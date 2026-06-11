/**
 * `loader()` — turns a Source (`{ files }`) into the content API the routes use.
 *
 * Pure data over the in-memory `VirtualFile[]`: NO filesystem, NO markdown
 * processor. This is the framework-agnostic heart (Fumadocs' `loader`). It
 * absorbs what used to live in `content.server.ts` (doc lookup, permalinks) and
 * `sidebar.server.ts` (per-project tree), but now backend-agnostic — any Source
 * works, not just the Obsidian generator.
 */
import type { PageData, Source, VirtualFile, VirtualPage } from './types'

export type SidebarNodeType = 'directory' | 'file' | 'canvas' | 'image'

export interface SidebarNode {
	label: string
	href?: string
	nodeType: SidebarNodeType
	children: SidebarNode[]
}

export interface FlatSidebarItem {
	name: string
	href?: string
	type: SidebarNodeType
	children: string[]
}
export type FlatSidebarMap = Record<string, FlatSidebarItem>

/** A page as the loader exposes it: its id + rendered data. */
export interface LoaderPage {
	id: string
	slugs: string[]
	data: PageData
}

export interface LoaderOptions {
	source: Source
	/** Locale tag for stable sorting (defaults to 'en'). */
	lang?: string
	/**
	 * Maps a page id to its owning "project" (first path segment) — used to scope
	 * the sidebar to one project and drop the leading segment. Defaults to the
	 * first segment. Pass a custom fn to disable project-scoping (return '').
	 */
	projectOf?: (id: string) => string
}

export interface LoaderOutput {
	/** Every non-draft page. */
	getPages(): LoaderPage[]
	/** A page by id, or null. */
	getPage(id: string): LoaderPage | null
	/** Resolve a permalink to its page id, or null. */
	resolvePermalink(slug: string): string | null
	/** The canonical permalink for a page id, or null. */
	getPermalinkForId(id: string): string | null
	/** Canonical URL for an id: its permalink URL when set, else `/{id}/`. */
	getCanonicalUrl(id: string): string
	/** The sidebar tree for one project, flattened for the headless-tree UI. */
	getSidebar(projectId: string): FlatSidebarMap
}

function prettify(slug: string): string {
	const cleaned = decodeURIComponent(slug).replace(/-/g, ' ')
	return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function isPage(f: VirtualFile): f is VirtualPage {
	return f.type === 'page'
}

interface BuildNode {
	label: string
	href?: string
	nodeType?: SidebarNodeType
	childMap: Map<string, BuildNode>
}

export function loader(options: LoaderOptions): LoaderOutput {
	const { source, lang = 'en' } = options
	const projectOf = options.projectOf ?? ((id: string) => id.split('/')[0] ?? '')

	// Index every page by id, dropping drafts up front.
	const pages = new Map<string, LoaderPage>()
	for (const f of source.files) {
		if (!isPage(f)) continue
		if (f.data.frontmatter.draft === true) continue
		pages.set(f.path, { id: f.path, slugs: f.path.split('/'), data: f.data })
	}

	// Permalink directions, derived from the source.
	const toId = source.permalinks ?? {}
	const toPermalink: Record<string, string> = {}
	for (const [permalink, id] of Object.entries(toId)) {
		if (!toPermalink[id]) toPermalink[id] = permalink // first wins
	}

	const getPermalinkForId = (id: string) => toPermalink[id] ?? null
	const getCanonicalUrl = (id: string) => {
		const p = getPermalinkForId(id)
		return p ? `/${p}/` : `/${id}/`
	}

	function getSidebar(projectId: string): FlatSidebarMap {
		const rootMap = new Map<string, BuildNode>()
		for (const page of pages.values()) {
			if (projectOf(page.id) !== projectId) continue
			// Drop the leading project segment; remaining segments form the tree.
			const segments = page.id.split('/').slice(1)
			if (segments.length === 0) continue
			let current = rootMap
			for (let i = 0; i < segments.length; i++) {
				const seg = segments[i]!
				const isLast = i === segments.length - 1
				if (!current.has(seg)) {
					current.set(seg, { label: isLast ? page.data.title : prettify(seg), childMap: new Map() })
				}
				const node = current.get(seg)!
				if (isLast) {
					node.href = getCanonicalUrl(page.id)
					node.label = page.data.title || prettify(seg)
					node.nodeType = page.data.isCanvas ? 'canvas' : 'file'
				}
				current = node.childMap
			}
		}
		return flatten(mapToNodes(rootMap, lang))
	}

	return {
		getPages: () => Array.from(pages.values()),
		getPage: (id) => pages.get(id) ?? null,
		resolvePermalink: (slug) => toId[slug] ?? null,
		getPermalinkForId,
		getCanonicalUrl,
		getSidebar,
	}
}

function mapToNodes(map: Map<string, BuildNode>, lang: string): SidebarNode[] {
	return Array.from(map.entries()).map(([, val]) => {
		const children = mapToNodes(val.childMap, lang).sort((a, b) => a.label.localeCompare(b.label, lang))
		return {
			label: val.label,
			href: val.href,
			nodeType: val.nodeType ?? (children.length > 0 ? 'directory' : 'file'),
			children,
		}
	})
}

/** Flatten the tree into the id-keyed map the headless-tree sidebar consumes. */
function flatten(nodes: SidebarNode[]): FlatSidebarMap {
	const map: FlatSidebarMap = {}
	let counter = 0
	function walk(node: SidebarNode): string {
		const id = `n${counter++}`
		const childIds = node.children.map(walk)
		map[id] = { name: node.label, href: node.href, type: node.nodeType, children: childIds }
		return id
	}
	const rootChildIds = nodes.map(walk)
	map['root'] = { name: 'Root', type: 'directory', children: rootChildIds }
	return map
}
