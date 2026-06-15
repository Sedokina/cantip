/**
 * `cantip/core` — the data layer for fully custom apps.
 *
 * Re-exports the loaded content API + project helpers, so you can build your own
 * routes/loaders when the default `cantip/routes/*` don't fit. For the raw
 * framework-agnostic primitives (`loader`, `Source`, `VirtualFile`), import
 * `cantip/source` directly.
 *
 * The content/sidebar/site helpers here are SERVER-ONLY (they read the generated
 * content + site.json from disk). For the project list on the CLIENT, use the
 * `useProjects()` / `useProject()` hooks from the `SiteProvider` context instead.
 * The permalink + pure project helpers are isomorphic.
 */
export {
	getDoc,
	resolvePermalink,
	getPermalinkForId,
	getCanonicalUrl,
	content,
	type Doc,
	type Heading,
} from './content.server'

export {
	buildSidebar,
	type SidebarNode,
	type SidebarNodeType,
	type FlatSidebarItem,
	type FlatSidebarMap,
} from './sidebar.server'

// Server-side site data + project helpers (read site.json from disk).
export {
	getSiteData,
	getProjects,
	getProject,
	getProjectIdForDoc,
	getActiveProjectId,
} from './site.server'

// Isomorphic pure project logic + the Project type.
export {
	resolveProjects,
	projectIdForDoc,
	activeProjectId,
	findProject,
	GENERAL_PROJECT_ID,
	type Project,
} from './projects-core'

export { loader, type Source, type VirtualFile, type PageData } from 'cantip/source'
