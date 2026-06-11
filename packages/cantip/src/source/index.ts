/**
 * `cantip/source` — the framework-agnostic content core.
 *
 * Use `loader({ source })` to turn any content backend (a `{ files }` Source)
 * into the page tree + lookups the routes consume. The built-in Obsidian backend
 * emits a Source as `~/generated/content`; a custom backend just produces the
 * same `{ files: VirtualFile[] }` shape.
 */
export { loader } from './loader'
export type {
	LoaderOptions,
	LoaderOutput,
	LoaderPage,
	SidebarNode,
	SidebarNodeType,
	FlatSidebarItem,
	FlatSidebarMap,
} from './loader'
export type { Source, VirtualFile, VirtualPage, VirtualMeta, PageData, Heading } from './types'
