/**
 * Runtime site-data API (server-only) — reads `app/generated/site.json` via `fs`,
 * mirroring `content.server.ts`.
 *
 * Branding, projects, the general bucket, and theme tokens are emitted as DATA
 * (not a bundled module), so the Remix build is client-agnostic and this data can
 * change without a rebuild. The loaded data is memoized per process and reloaded
 * when `cantip generate` replaces `site.json`, so a running server serves new
 * content without a restart. The root loader reads `getSiteData()` and passes it
 * to the client via `useLoaderData` + the `SiteProvider` context — client code
 * never imports this.
 */
import fs from 'node:fs'
import path from 'node:path'

import type { GeneratedSite } from './config/site'
import {
	resolveProjects,
	projectIdForDoc,
	activeProjectId,
	findProject,
	type Project,
} from './projects-core'

// Read from the user's cwd (where `remix-serve` runs and the generator writes),
// the same contract as content.server.ts. cwd-relative is safe because the app is
// always launched from the project root.
const SITE_FILE = path.resolve(process.cwd(), 'app/generated/site.json')

// The generator writes site.json last, so a new site.json means every other
// generated file is complete. Production checks at most once per second. Dev checks
// on every call, because the Vite plugin reloads the browser right after a
// regenerate and that request must already see the new data.
const CHECK_INTERVAL_MS = process.env.NODE_ENV === 'production' ? 1000 : 0

let _site: GeneratedSite | null = null
let _projects: Project[] | null = null
let _siteFileVersion: string | null = null
let _generation = 0
let _lastCheck = 0
let _reloadFailed = false

// `rename` gives the new file a new inode, so two writes in the same millisecond
// still differ.
function readSiteFileVersion(): string {
	const stat = fs.statSync(SITE_FILE)
	return `${stat.ino}:${stat.mtimeMs}`
}

function reloadSiteIfChanged(): void {
	const now = Date.now()
	if (_site && now - _lastCheck < CHECK_INTERVAL_MS) return
	_lastCheck = now

	let version: string
	let site: GeneratedSite
	try {
		version = readSiteFileVersion()
		if (_site && version === _siteFileVersion) return
		site = JSON.parse(fs.readFileSync(SITE_FILE, 'utf8')) as GeneratedSite
	} catch (error) {
		if (!_site) throw error
		// Keep serving the last good data rather than failing every request.
		if (!_reloadFailed) console.error(`cantip: could not reload ${SITE_FILE}; serving the previous data.`, error)
		_reloadFailed = true
		return
	}
	_site = site
	_projects = null
	_siteFileVersion = version
	_generation++
	_reloadFailed = false
}

/** The generated site data, reloaded when `cantip generate` replaces site.json. */
export function getSiteData(): GeneratedSite {
	reloadSiteIfChanged()
	return _site as GeneratedSite
}

/**
 * Increases each time site.json is reloaded. `content.server.ts` rebuilds its
 * loader when this changes, so content and site data always come from one run.
 */
export function getSiteGeneration(): number {
	reloadSiteIfChanged()
	return _generation
}

/** The resolved project list (named + general bucket when enabled). Memoized. */
export function getProjects(): Project[] {
	if (!_projects) _projects = resolveProjects(getSiteData())
	return _projects
}

/** The project a doc belongs to, from its first id segment. Unknown → `general`. */
export function getProjectIdForDoc(docId: string): string {
	return projectIdForDoc(getProjects(), docId)
}

/** Active project derived from a request pathname, or null when none. */
export function getActiveProjectId(pathname: string): string | null {
	return activeProjectId(getProjects(), pathname)
}

/** Look up a single project by id (incl. `general`), or undefined. */
export function getProject(id: string): Project | undefined {
	return findProject(getProjects(), id)
}

/** Drop the in-memory site cache. The next call re-reads `site.json`. */
export function resetSite(): void {
	_site = null
	_projects = null
	_siteFileVersion = null
}

/**
 * The site's public origin (no trailing slash). Content that leaves the site
 * carries root-relative hrefs (`/project/page`), which resolve against whatever
 * host displays them — so the Jira publish path rewrites them against this.
 *
 * Behind a TLS-terminating reverse proxy the Node server sees plain http, so the
 * request's own origin is wrong (http://… instead of https://…). Set
 * `CANTIP_PUBLIC_URL` to the public base (e.g. `https://docs.example.com`); only
 * the localhost dev case falls back to deriving it from the request.
 */
export function publicOrigin(request: Request): string {
	const explicit = process.env.CANTIP_PUBLIC_URL?.trim().replace(/\/+$/, '')
	if (explicit) return explicit
	return new URL(request.url).origin
}
