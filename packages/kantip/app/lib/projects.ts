/**
 * Project registry — the runtime/UI layer over the generated site data.
 *
 * A "project" maps onto the **first path segment** of every doc `id`
 * (e.g. `krista-partners/о-проекте/...` → project `krista-partners`), which in
 * turn is one content source (one git submodule / loose folder, see
 * `docs.config.ts` → `scripts/generate-content.ts`). Nothing here touches the
 * build pipeline; it reads the already-generated `app/generated/site.ts`.
 *
 * That module is plain literals bundled by Vite, so this file is ISOMORPHIC —
 * safe to import from client components (`ProjectSwitcher`, `_index`, `Search`,
 * `MobileProjectsPanel`) and from server code (`root.tsx`, `sidebar.server`)
 * alike, with no runtime file access. The project list, branding, and labels all
 * come from the user's `docs.config.ts` via the generator.
 *
 * The active project is derived from the URL (see `getActiveProjectId`), so it's
 * SSR-friendly, shareable, and survives reload with no extra client state.
 */
import { SITE } from '~/generated/site'

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

/** The named projects, from the generated site data (authored in docs.config.ts). */
export const PROJECTS: Project[] = SITE.projects.map((p) => ({
	id: p.id,
	name: p.name,
	logo: p.logo,
	landing: p.landing,
	description: p.description,
}))

/** The pseudo-project that owns any doc not under a known project. */
export const GENERAL_PROJECT: Project = {
	id: GENERAL_PROJECT_ID,
	name: SITE.general.name,
	logo: SITE.general.logo,
	landing: '/',
	description: SITE.general.description,
}

/**
 * All projects shown in the switcher. The `general` bucket is appended only when
 * it is enabled AND actually has docs (the generator sets `general.enabled`
 * accordingly), matching the prior behavior.
 */
export function getProjects(): Project[] {
	return SITE.general.enabled ? [...PROJECTS, GENERAL_PROJECT] : PROJECTS
}

const byId = new Map<string, Project>([...PROJECTS, GENERAL_PROJECT].map((p) => [p.id, p]))

/** The project a doc belongs to, from its first id segment. Unknown → `general`. */
export function getProjectIdForDoc(docId: string): string {
	const first = docId.split('/')[0] ?? ''
	return byId.has(first) && first !== GENERAL_PROJECT_ID ? first : GENERAL_PROJECT_ID
}

/** Look up a project by id (incl. `general`). */
export function getProject(id: string): Project | undefined {
	return byId.get(id)
}

/**
 * Active project derived from a request pathname. The first non-empty segment is
 * the project id, or `null` when the path names no known project (e.g. on `/`),
 * so the home page can render with no project selected and no sidebar.
 */
export function getActiveProjectId(pathname: string): string | null {
	const first = decodeURIComponent(pathname).split('/').filter(Boolean)[0] ?? ''
	if (byId.has(first) && first !== GENERAL_PROJECT_ID) return first
	return null
}
