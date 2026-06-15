/**
 * Pure project-registry logic — operates on a project list passed in, with NO
 * data import. The data (the generated site) now lives in `site.json` and reaches
 * here two ways: server code via `app/lib/site.server.ts`, client code via the
 * `SiteProvider` context (`app/lib/site-context.tsx`). Keeping the logic pure lets
 * both share it without bundling the data.
 *
 * A "project" maps onto the FIRST path segment of every doc `id` (e.g.
 * `krista-partners/о-проекте/...` → project `krista-partners`), which is one
 * content source. The active project is derived from the URL, so it's SSR-friendly
 * and survives reload with no client state.
 */
import type { GeneratedSite, SiteProject } from './config/site'

export interface Project {
	/** Matches the first segment of a doc id, e.g. `krista-partners`. */
	id: string
	/** Display name shown in the switcher. */
	name: string
	/** Logo path under /public. */
	logo: string
	/** Where "switch to this project" navigates (its landing doc). */
	landing: string
	/** Short blurb, reused on the home page cards. */
	description: string
}

/** Id of the built-in pseudo-project for docs that aren't under a known vault. */
export const GENERAL_PROJECT_ID = 'general'

/** The pseudo-project that owns any doc not under a known project. */
export function generalProject(general: GeneratedSite['general']): Project {
	return {
		id: GENERAL_PROJECT_ID,
		name: general.name,
		logo: general.logo,
		landing: '/',
		description: general.description,
	}
}

/** Named projects (from config), mapped to the runtime `Project` shape. */
export function namedProjects(projects: SiteProject[]): Project[] {
	return projects.map((p) => ({
		id: p.id,
		name: p.name,
		logo: p.logo,
		landing: p.landing,
		description: p.description,
	}))
}

/**
 * All projects shown in the switcher. The `general` bucket is appended only when
 * it is enabled AND actually has docs (the generator sets `general.enabled`).
 */
export function resolveProjects(site: GeneratedSite): Project[] {
	const named = namedProjects(site.projects)
	return site.general.enabled ? [...named, generalProject(site.general)] : named
}

/** Index a project list by id for O(1) lookup. */
function indexById(projects: Project[]): Map<string, Project> {
	return new Map(projects.map((p) => [p.id, p]))
}

/** The project a doc belongs to, from its first id segment. Unknown → `general`. */
export function projectIdForDoc(projects: Project[], docId: string): string {
	const byId = indexById(projects)
	const first = docId.split('/')[0] ?? ''
	return byId.has(first) && first !== GENERAL_PROJECT_ID ? first : GENERAL_PROJECT_ID
}

/** Look up a project by id (incl. `general`). */
export function findProject(projects: Project[], id: string): Project | undefined {
	return indexById(projects).get(id)
}

/**
 * Active project derived from a request pathname. The first non-empty segment is
 * the project id, or `null` when the path names no known project (e.g. on `/`).
 */
export function activeProjectId(projects: Project[], pathname: string): string | null {
	const byId = indexById(projects)
	const first = decodeURIComponent(pathname).split('/').filter(Boolean)[0] ?? ''
	if (byId.has(first) && first !== GENERAL_PROJECT_ID) return first
	return null
}
