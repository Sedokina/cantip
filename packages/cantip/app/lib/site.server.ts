/**
 * Runtime site-data API (server-only) — reads `app/generated/site.json` via `fs`,
 * mirroring `content.server.ts`.
 *
 * Branding, projects, the general bucket, and theme tokens are emitted as DATA
 * (not a bundled module), so the Remix build is client-agnostic and this data can
 * change without a rebuild. The loaded data is memoized per process; `resetSite()`
 * drops the cache so a regenerate is picked up without a restart (SIGHUP / file
 * watch). The root loader reads `getSiteData()` and passes it to the client via
 * `useLoaderData` + the `SiteProvider` context — client code never imports this.
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

let _site: GeneratedSite | null = null
let _projects: Project[] | null = null

/** The generated site data, read + parsed from disk once per process. */
export function getSiteData(): GeneratedSite {
	if (!_site) {
		_site = JSON.parse(fs.readFileSync(SITE_FILE, 'utf8')) as GeneratedSite
	}
	return _site
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

/**
 * Drop the in-memory site cache. The next call re-reads `site.json`. Lets a
 * long-lived server pick up regenerated branding/theme without a rebuild/restart.
 */
export function resetSite(): void {
	_site = null
	_projects = null
}
