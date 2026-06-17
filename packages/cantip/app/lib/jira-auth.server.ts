/**
 * Per-user Jira authentication via OAuth 2.0 (3LO), server-only.
 *
 * Each browser connects its OWN Jira identity: it consents once on Atlassian,
 * and we keep its tokens in an ENCRYPTED, httpOnly session cookie — no database,
 * and it works across container replicas (any replica decrypts with the shared
 * SESSION_SECRET). When a browser hasn't connected, we fall back to the shared
 * env service account (jira.server.ts) if one is configured.
 *
 * Required env to enable per-user OAuth (all three):
 *   JIRA_OAUTH_CLIENT_ID      from your Atlassian OAuth 2.0 (3LO) app
 *   JIRA_OAUTH_CLIENT_SECRET  "
 *   SESSION_SECRET            random string; encrypts/signs the session cookie
 *
 * Register the app at developer.atlassian.com with callback `<origin>/jira/callback`
 * and scopes: read:jira-work write:jira-work read:jira-user offline_access.
 */
import crypto from 'node:crypto'
import { createCookie } from '@remix-run/node'

import {
	connectionFromEnv,
	getJiraConfig,
	type JiraConnection,
} from '~/lib/jira.server'

/** Scopes requested at consent. offline_access yields a refresh token. */
const SCOPES = 'read:jira-work write:jira-work read:jira-user offline_access'
const AUTH_BASE = 'https://auth.atlassian.com'
const API_GATEWAY = 'https://api.atlassian.com'

/** OAuth app credentials + cookie secret (null unless all are configured). */
export interface OAuthConfig {
	clientId: string
	clientSecret: string
	sessionSecret: string
}

export function getOAuthConfig(): OAuthConfig | null {
	const clientId = process.env.JIRA_OAUTH_CLIENT_ID?.trim()
	const clientSecret = process.env.JIRA_OAUTH_CLIENT_SECRET?.trim()
	const sessionSecret = process.env.SESSION_SECRET?.trim()
	if (!clientId || !clientSecret || !sessionSecret) return null
	return { clientId, clientSecret, sessionSecret }
}

/** A connected user's Jira tokens + site, stored (encrypted) in the cookie. */
export interface JiraSession {
	accessToken: string
	refreshToken: string
	/** ms epoch when the access token expires. */
	expiresAt: number
	cloudId: string
	siteUrl: string
	user: string
}

// ── Cookie payload encryption (AES-256-GCM) ─────────────────────────────────
// Remix's signed cookie gives integrity but NOT confidentiality, and these are
// OAuth tokens — so we encrypt the payload ourselves before it goes in the
// cookie. scrypt(SESSION_SECRET) → 32-byte key, cached per secret.

const keyCache = new Map<string, Buffer>()
function keyFor(secret: string): Buffer {
	let key = keyCache.get(secret)
	if (!key) {
		key = crypto.scryptSync(secret, 'cantip-jira-session-v1', 32)
		keyCache.set(secret, key)
	}
	return key
}

function encrypt(plaintext: string, secret: string): string {
	const iv = crypto.randomBytes(12)
	const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(secret), iv)
	const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
	return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url')
}

function decrypt(token: string, secret: string): string | null {
	try {
		const buf = Buffer.from(token, 'base64url')
		const iv = buf.subarray(0, 12)
		const tag = buf.subarray(12, 28)
		const data = buf.subarray(28)
		const decipher = crypto.createDecipheriv('aes-256-gcm', keyFor(secret), iv)
		decipher.setAuthTag(tag)
		return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
	} catch {
		return null
	}
}

// ── Cookies ──────────────────────────────────────────────────────────────────

const secure = process.env.NODE_ENV === 'production'

// The whole session is too big for one cookie — combined, the Atlassian access
// token (~2.4 KB) + refresh token (~1.7 KB) blow past the ~4 KB per-cookie
// limit. So we split it across TWO cookies by meaning: the access token (+ small
// fields) in one, the refresh token in the other. Each lands well under 4 KB,
// and keeping the refresh token means sessions survive (no hourly reconnect).
// Managed by hand (not createCookie) to avoid its JSON+base64 re-expansion — the
// encrypted value is already URL-safe base64url.
const ACCESS_COOKIE = 'cantip_jira_at'
const REFRESH_COOKIE = 'cantip_jira_rt'
const SESSION_MAX_AGE = 60 * 60 * 24 * 90 // 90 days (refresh-token lifetime)
const COOKIE_SOFT_LIMIT = 3900 // warn if an encrypted value nears the ~4 KB cap

function cookieAttrs(maxAge: number): string {
	const parts = [`Path=/`, 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
	if (secure) parts.push('Secure')
	return parts.join('; ')
}

/** Parse a Cookie request header into a name→value map. */
function parseCookies(header: string | null): Record<string, string> {
	const jar: Record<string, string> = {}
	if (!header) return jar
	for (const part of header.split(';')) {
		const eq = part.indexOf('=')
		if (eq === -1) continue
		const name = part.slice(0, eq).trim()
		if (name) jar[name] = part.slice(eq + 1).trim()
	}
	return jar
}

/** One Set-Cookie line for a named cookie holding an encrypted value. */
function setCookie(name: string, encrypted: string, maxAge: number): string {
	if (encrypted.length > COOKIE_SOFT_LIMIT) {
		console.warn(
			`[jira] ${name} cookie is ${encrypted.length} bytes (near the ~4 KB browser cap); ` +
				`it may be dropped. This Atlassian token is unusually large.`,
		)
	}
	return `${name}=${encrypted}; ${cookieAttrs(maxAge)}`
}

/** A short-lived cookie carrying the CSRF `state` + post-connect redirect. */
function stateCookie(secret: string) {
	return createCookie('cantip_jira_oauth', {
		httpOnly: true,
		secure,
		sameSite: 'lax',
		path: '/',
		maxAge: 600,
		secrets: [secret],
	})
}

export function readSession(request: Request, secret: string): JiraSession | null {
	const jar = parseCookies(request.headers.get('Cookie'))
	// The access cookie is required; the refresh cookie is optional (its absence
	// just means we can't renew — the access token works until it expires).
	const accessJson = jar[ACCESS_COOKIE] ? decrypt(jar[ACCESS_COOKIE], secret) : null
	if (!accessJson) return null
	const refreshJson = jar[REFRESH_COOKIE] ? decrypt(jar[REFRESH_COOKIE], secret) : null
	try {
		const access = JSON.parse(accessJson) as Omit<JiraSession, 'refreshToken'>
		const refreshToken = refreshJson ? ((JSON.parse(refreshJson) as { refreshToken?: string }).refreshToken ?? '') : ''
		return { ...access, refreshToken }
	} catch {
		return null
	}
}

/** Two Set-Cookie lines: the access part and the refresh part. */
export function commitSession(session: JiraSession, secret: string): string[] {
	const { refreshToken, ...access } = session
	return [
		setCookie(ACCESS_COOKIE, encrypt(JSON.stringify(access), secret), SESSION_MAX_AGE),
		setCookie(REFRESH_COOKIE, encrypt(JSON.stringify({ refreshToken }), secret), SESSION_MAX_AGE),
	]
}

/** Two Set-Cookie lines that expire both session cookies. */
export function destroySession(): string[] {
	return [`${ACCESS_COOKIE}=; ${cookieAttrs(0)}`, `${REFRESH_COOKIE}=; ${cookieAttrs(0)}`]
}

export function commitState(state: string, redirectTo: string, secret: string): Promise<string> {
	return stateCookie(secret).serialize({ state, redirectTo })
}

export async function readState(request: Request, secret: string): Promise<{ state: string; redirectTo: string } | null> {
	const parsed = (await stateCookie(secret).parse(request.headers.get('Cookie'))) as unknown
	if (parsed && typeof parsed === 'object' && 'state' in parsed) return parsed as { state: string; redirectTo: string }
	return null
}

export function clearState(secret: string): Promise<string> {
	return stateCookie(secret).serialize('', { maxAge: 0 })
}

// ── OAuth flow ────────────────────────────────────────────────────────────────

/** A fresh CSRF state token. */
export function newState(): string {
	return crypto.randomBytes(16).toString('hex')
}

/** The Atlassian consent URL to redirect the user to. */
export function authorizeUrl(config: OAuthConfig, redirectUri: string, state: string): string {
	const params = new URLSearchParams({
		audience: 'api.atlassian.com',
		client_id: config.clientId,
		scope: SCOPES,
		redirect_uri: redirectUri,
		state,
		response_type: 'code',
		prompt: 'consent',
	})
	return `${AUTH_BASE}/authorize?${params}`
}

interface TokenResponse {
	access_token: string
	refresh_token?: string
	expires_in: number
	scope?: string
	token_type?: string
}

/** Opt-in verbose logging (set JIRA_OAUTH_DEBUG=1). Never log in normal runs —
 *  these payloads are sensitive. */
function debugEnabled(): boolean {
	const v = process.env.JIRA_OAUTH_DEBUG
	return v === '1' || v === 'true'
}

/** Decode a JWT's header + payload (NOT verifying the signature) for inspection. */
function decodeJwt(token: string): { header: unknown; payload: unknown } | null {
	const parts = token.split('.')
	if (parts.length < 2) return null
	try {
		return {
			header: JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')),
			payload: JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')),
		}
	} catch {
		return null
	}
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
	const res = await fetch(`${AUTH_BASE}/oauth/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify(body),
	})
	const text = await res.text()
	if (!res.ok) {
		if (debugEnabled()) console.error(`[jira][debug] token endpoint ${res.status}:`, text)
		throw new Error(`Atlassian token endpoint failed (HTTP ${res.status})`)
	}
	if (debugEnabled()) {
		// The exact, unmodified response body from Atlassian (includes the real
		// access_token / refresh_token values).
		console.log('[jira][debug] token endpoint raw response:\n' + text)
	}
	const json = JSON.parse(text) as TokenResponse
	if (debugEnabled()) {
		// The decoded access-token JWT (header + payload, signature not verified) —
		// the `scope` claim here is what drives the token's size.
		const decoded = decodeJwt(json.access_token)
		console.log(
			'[jira][debug] access token decoded (header + payload):\n' +
				(decoded ? JSON.stringify(decoded, null, 2) : '(not a decodable JWT — opaque token)'),
		)
	}
	return json
}

/** Exchange an authorization code for tokens, then resolve the site + user into
 *  a full JiraSession ready to store. */
export async function sessionFromCode(config: OAuthConfig, code: string, redirectUri: string): Promise<JiraSession> {
	const token = await tokenRequest({
		grant_type: 'authorization_code',
		client_id: config.clientId,
		client_secret: config.clientSecret,
		code,
		redirect_uri: redirectUri,
	})
	const { cloudId, siteUrl } = await resolveSite(token.access_token)
	const user = await fetchDisplayName(token.access_token, cloudId)
	return {
		accessToken: token.access_token,
		refreshToken: token.refresh_token ?? '',
		expiresAt: Date.now() + token.expires_in * 1000,
		cloudId,
		siteUrl,
		user,
	}
}

/** Use the refresh token to mint a new access token (refresh tokens rotate, so
 *  the new one — when returned — replaces the old). */
async function refreshSession(config: OAuthConfig, session: JiraSession): Promise<JiraSession> {
	const token = await tokenRequest({
		grant_type: 'refresh_token',
		client_id: config.clientId,
		client_secret: config.clientSecret,
		refresh_token: session.refreshToken,
	})
	return {
		...session,
		accessToken: token.access_token,
		refreshToken: token.refresh_token ?? session.refreshToken,
		expiresAt: Date.now() + token.expires_in * 1000,
	}
}

/** Pick the Jira site this token can reach. Prefer the one matching the env
 *  JIRA_BASE_URL (if set), else the first accessible resource. */
async function resolveSite(accessToken: string): Promise<{ cloudId: string; siteUrl: string }> {
	const res = await fetch(`${API_GATEWAY}/oauth/token/accessible-resources`, {
		headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
	})
	const text = await res.text()
	if (!res.ok) throw new Error(`Could not list accessible Jira sites (HTTP ${res.status})`)
	if (debugEnabled()) console.log('[jira][debug] accessible-resources raw response:\n' + text)
	const sites = JSON.parse(text) as Array<{ id: string; url: string }>
	if (sites.length === 0) throw new Error('This Atlassian account has no accessible Jira sites')
	const preferred = process.env.JIRA_BASE_URL?.trim().replace(/\/+$/, '')
	const chosen = (preferred && sites.find((s) => s.url.replace(/\/+$/, '') === preferred)) || sites[0]
	return { cloudId: chosen.id, siteUrl: chosen.url.replace(/\/+$/, '') }
}

/** Best-effort display name for the connected user (never throws). */
async function fetchDisplayName(accessToken: string, cloudId: string): Promise<string> {
	try {
		const res = await fetch(`${API_GATEWAY}/ex/jira/${cloudId}/rest/api/3/myself`, {
			headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
		})
		if (!res.ok) return ''
		const me = (await res.json()) as { displayName?: string }
		return me.displayName ?? ''
	} catch {
		return ''
	}
}

/** A connection built from a user's OAuth session. */
function connectionFromSession(session: JiraSession): JiraConnection {
	return {
		apiBase: `${API_GATEWAY}/ex/jira/${session.cloudId}`,
		siteUrl: session.siteUrl,
		authHeader: `Bearer ${session.accessToken}`,
	}
}

// ── Resolver: the one entry point routes use ───────────────────────────────

/**
 * The auth context for a request. `connection` is null when nothing can publish
 * (no session and no env fallback). `commit` is a Set-Cookie to attach to the
 * response when the session was refreshed or cleared.
 */
export interface JiraAuth {
	connection: JiraConnection | null
	mode: 'oauth' | 'shared' | null
	user: string | null
	/** Set-Cookie values to attach when the session was refreshed or cleared. */
	commit?: string[]
}

/**
 * Resolve who this request publishes as: the browser's own OAuth identity if
 * connected (refreshing the access token when it's about to expire), otherwise
 * the shared env account, otherwise nothing.
 */
export async function getJiraAuth(request: Request): Promise<JiraAuth> {
	const oauth = getOAuthConfig()
	if (oauth) {
		const session = readSession(request, oauth.sessionSecret)
		if (session) {
			if (Date.now() < session.expiresAt - 60_000) {
				return { connection: connectionFromSession(session), mode: 'oauth', user: session.user || null }
			}
			// Access token (about to be) expired — refresh it.
			try {
				const refreshed = await refreshSession(oauth, session)
				return {
					connection: connectionFromSession(refreshed),
					mode: 'oauth',
					user: refreshed.user || null,
					commit: commitSession(refreshed, oauth.sessionSecret),
				}
			} catch {
				// Refresh failed (revoked/expired) — drop the session, fall through.
				const fallback = envAuth()
				return { ...fallback, commit: destroySession() }
			}
		}
	}
	return envAuth()
}

/** The shared-account fallback (or an empty auth when no env account is set). */
function envAuth(): JiraAuth {
	const config = getJiraConfig()
	if (config) return { connection: connectionFromEnv(config), mode: 'shared', user: null }
	return { connection: null, mode: null, user: null }
}

/** Non-secret status for the browser: whether publishing is available, whether
 *  this browser is connected, and (for OAuth) as whom. */
export interface JiraStatus {
	enabled: boolean
	connected: boolean
	mode: 'oauth' | 'shared' | null
	user: string | null
	oauthAvailable: boolean
	commit?: string[]
}

export async function getJiraStatus(request: Request): Promise<JiraStatus> {
	const oauthAvailable = getOAuthConfig() !== null
	const auth = await getJiraAuth(request)
	return {
		enabled: oauthAvailable || auth.connection !== null,
		connected: auth.connection !== null,
		mode: auth.mode,
		user: auth.user,
		oauthAvailable,
		commit: auth.commit,
	}
}
