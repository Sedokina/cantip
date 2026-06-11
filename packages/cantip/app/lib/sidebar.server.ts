/**
 * Sidebar builder — now delegates to `loader()` (via content.server). The tree
 * logic moved into `cantip/source`'s `loader().getSidebar()`; this file keeps the
 * historical entry points so callers (`root.server.ts`) don't change.
 */
import { content } from './content.server'

export type {
	SidebarNode,
	SidebarNodeType,
	FlatSidebarItem,
	FlatSidebarMap,
} from 'cantip/source'

/** The flattened sidebar map for a single project (headless-tree shape). */
export function buildSidebar(projectId: string) {
	return content().getSidebar(projectId)
}

/**
 * Back-compat passthrough: `buildSidebar` now returns the already-flattened map
 * (the loader flattens internally), so callers that wrapped it in
 * `flattenSidebar` just pass the value through.
 */
export function flattenSidebar<T>(map: T): T {
	return map
}
