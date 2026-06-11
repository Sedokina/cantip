/**
 * `cantip/core` — the data layer for fully custom apps.
 *
 * Re-exports the loaded content API + project helpers, so you can build your own
 * routes/loaders when the default `cantip/routes/*` don't fit. For the raw
 * framework-agnostic primitives (`loader`, `Source`, `VirtualFile`), import
 * `cantip/source` directly.
 *
 * The content/sidebar helpers are server-only (they read the generated content
 * module); the project + permalink helpers are isomorphic.
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

export {
	getProjects,
	getProject,
	getProjectIdForDoc,
	getActiveProjectId,
	type Project,
} from './projects'

export { loader, type Source, type VirtualFile, type PageData } from 'cantip/source'
