/**
 * `cantip/core` — the framework-agnostic data layer, for fully custom apps.
 *
 * These read the generated manifest (`app/generated/*`, written by the cantip
 * plugin's generate step) and return plain data — no React, no Remix. Use them to
 * build your own routes/loaders when the default `cantip/routes/*` don't fit.
 *
 * The content/sidebar helpers are server-only (they read the filesystem); the
 * project + permalink helpers are isomorphic.
 */
export {
	getAllDocs,
	getDoc,
	resolvePermalink,
	getPermalinkForId,
	getCanonicalUrl,
	type Doc,
	type DocIndexEntry,
	type Heading,
} from './content.server'

export {
	buildSidebar,
	flattenSidebar,
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

export { compileMarkdown, type CompiledDoc } from '../../scripts/compile'
