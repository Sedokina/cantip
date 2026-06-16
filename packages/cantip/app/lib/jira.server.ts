/**
 * Jira Cloud integration (server-only).
 *
 * Cantip is a read-only, build-time engine: the running server only ever READS
 * generated content. Publishing to Jira is the one place it reaches OUT to a
 * live, authenticated, write-capable service — so it lives behind a resource
 * route (`routes/api.jira`) and never runs in the browser (credentials must stay
 * server-side, and Jira's REST API blocks browser CORS anyway).
 *
 * Configuration is ENV-ONLY (no `docs.config.ts` surface): a single shared Jira
 * service-account identity. There is no per-user auth — the cantip user is
 * irrelevant; identity matters only inside Jira.
 *
 *   JIRA_BASE_URL            https://your-org.atlassian.net   (required)
 *   JIRA_EMAIL               service-account@your-org.com     (required)
 *   JIRA_API_TOKEN           <Atlassian API token>            (required)
 *   JIRA_DEFAULT_PROJECT     PROJ                             (optional)
 *   JIRA_DEFAULT_ISSUE_TYPE  Task                             (optional, default "Task")
 *
 * The feature is "enabled" iff the three required vars are present. When any is
 * missing every export degrades gracefully (config is null; the button hides).
 */

/** Resolved, validated Jira connection config (null when not configured). */
export interface JiraConfig {
	baseUrl: string
	email: string
	token: string
	defaultProject: string | null
	defaultIssueType: string
}

/** Non-secret subset safe to send to the browser (drives the Publish button). */
export interface JiraClientConfig {
	enabled: boolean
	defaultProject: string | null
	defaultIssueType: string
}

/**
 * Read + validate Jira env config. Returns null unless all three required vars
 * are set, so callers can treat null as "feature off". A trailing slash on the
 * base URL is trimmed so REST paths concatenate safely.
 */
export function getJiraConfig(): JiraConfig | null {
	const baseUrl = process.env.JIRA_BASE_URL?.trim().replace(/\/+$/, '')
	const email = process.env.JIRA_EMAIL?.trim()
	const token = process.env.JIRA_API_TOKEN?.trim()
	if (!baseUrl || !email || !token) return null
	return {
		baseUrl,
		email,
		token,
		defaultProject: process.env.JIRA_DEFAULT_PROJECT?.trim() || null,
		defaultIssueType: process.env.JIRA_DEFAULT_ISSUE_TYPE?.trim() || 'Task',
	}
}

/** Project the env config down to the non-secret bits the client needs. */
export function getJiraClientConfig(): JiraClientConfig {
	const config = getJiraConfig()
	return {
		enabled: config !== null,
		defaultProject: config?.defaultProject ?? null,
		defaultIssueType: config?.defaultIssueType ?? 'Task',
	}
}

/** The Basic auth header value for Jira Cloud: base64("email:token"). */
function authHeader(config: JiraConfig): string {
	const basic = Buffer.from(`${config.email}:${config.token}`).toString('base64')
	return `Basic ${basic}`
}

// ── ADF (Atlassian Document Format) ────────────────────────────────────────
// Jira Cloud stores descriptions as ADF, a JSON tree — not markdown or HTML.
// A minimal ADF doc is `{ version: 1, type: 'doc', content: [...blocks] }`.

/** A single ADF block node. */
type AdfNode = Record<string, unknown>

/** An ADF document root. */
export interface AdfDoc {
	version: 1
	type: 'doc'
	content: AdfNode[]
}

const HTML_ENTITIES: Record<string, string> = {
	'&amp;': '&',
	'&lt;': '<',
	'&gt;': '>',
	'&quot;': '"',
	'&#39;': "'",
	'&nbsp;': ' ',
}

/** Decode the handful of HTML entities the renderer emits. */
function decodeEntities(text: string): string {
	return text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => HTML_ENTITIES[m] ?? m)
}

/** Build an ADF doc from already-split block strings (drops empties). */
function adfFromBlocks(blocks: string[]): AdfDoc {
	const content: AdfNode[] = blocks
		.map((b) => decodeEntities(b.replace(/\s+/g, ' ').trim()))
		.filter((text) => text.length > 0)
		.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] }))
	// ADF rejects an empty doc; guarantee at least one (empty) paragraph.
	if (content.length === 0) content.push({ type: 'paragraph', content: [] })
	return { version: 1, type: 'doc', content }
}

/**
 * Convert rendered page HTML to a minimal ADF document.
 *
 * SLICE 1 (intentionally crude): at runtime we only have the page's
 * pre-rendered HTML (the source markdown is not in the build artifact). We turn
 * block-closing tags into paragraph breaks, strip the remaining tags, and emit
 * one paragraph per block — so ALL structure and inline formatting (headings,
 * bold, links, code, lists, tables) is flattened to plain-text paragraphs.
 * Rich, structure-preserving conversion (headings, lists, code blocks → real
 * ADF nodes) is a later slice; isolating it here means only this function
 * changes when we upgrade it.
 */
export function htmlToAdf(html: string): AdfDoc {
	const withBreaks = html
		.replace(/<\/(p|div|li|blockquote|pre|tr|h[1-6]|ul|ol|table)>/gi, '$&\n\n')
		.replace(/<br\s*\/?>/gi, '\n')
	const stripped = withBreaks.replace(/<[^>]+>/g, '')
	return adfFromBlocks(stripped.split(/\n{2,}/))
}

/** Wrap a plain string (e.g. a text selection) as an ADF doc, one para per line. */
export function textToAdf(text: string): AdfDoc {
	return adfFromBlocks(text.split(/\n{2,}/))
}

// ── REST calls ──────────────────────────────────────────────────────────────

/** A created/updated issue, projected to what the client needs. */
export interface JiraIssueRef {
	key: string
	url: string
}

/** Raised for any non-2xx Jira response, carrying a human-readable reason. */
export class JiraError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message)
		this.name = 'JiraError'
	}
}

/** Extract a useful message from Jira's (inconsistent) error response body. */
function jiraErrorMessage(status: number, body: unknown): string {
	if (body && typeof body === 'object') {
		const b = body as { errorMessages?: string[]; errors?: Record<string, string> }
		if (b.errorMessages?.length) return b.errorMessages.join('; ')
		if (b.errors && Object.keys(b.errors).length) {
			return Object.entries(b.errors)
				.map(([k, v]) => `${k}: ${v}`)
				.join('; ')
		}
	}
	return `Jira request failed (HTTP ${status})`
}

/** REST helper: sets auth + JSON headers, parses Jira's errors uniformly. */
async function jiraFetch(
	config: JiraConfig,
	path: string,
	init: { method: string; body?: unknown },
): Promise<unknown> {
	const res = await fetch(`${config.baseUrl}${path}`, {
		method: init.method,
		headers: {
			Authorization: authHeader(config),
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	})
	const text = await res.text()
	const parsed = text ? (JSON.parse(text) as unknown) : null
	if (!res.ok) throw new JiraError(jiraErrorMessage(res.status, parsed), res.status)
	return parsed
}

/** Build the human-facing browse URL for an issue key. */
function browseUrl(config: JiraConfig, key: string): string {
	return `${config.baseUrl}/browse/${key}`
}

/**
 * Create a Jira issue. `summary` is truncated to Jira's 255-char limit; the
 * description is sent as ADF. Returns the new issue's key + browse URL.
 */
export async function createIssue(
	config: JiraConfig,
	input: { projectKey: string; issueType: string; summary: string; description: AdfDoc },
): Promise<JiraIssueRef> {
	const body = {
		fields: {
			project: { key: input.projectKey },
			issuetype: { name: input.issueType },
			summary: input.summary.slice(0, 255) || '(untitled)',
			description: input.description,
		},
	}
	const result = (await jiraFetch(config, '/rest/api/3/issue', { method: 'POST', body })) as { key: string }
	return { key: result.key, url: browseUrl(config, result.key) }
}
