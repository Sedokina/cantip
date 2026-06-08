import { getAllDocs, getCanonicalUrl, type DocIndexEntry } from './content.server'
import { getProjectIdForDoc } from './projects'

export type SidebarNodeType = 'directory' | 'file' | 'canvas' | 'image'

export interface SidebarNode {
	label: string
	href?: string
	nodeType: SidebarNodeType
	children: SidebarNode[]
}

function prettify(slug: string): string {
	const cleaned = decodeURIComponent(slug).replace(/-/g, ' ')
	return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function detectNodeType(entry: DocIndexEntry): SidebarNodeType {
	if (entry.isCanvas) return 'canvas'
	return 'file'
}

interface BuildNode {
	label: string
	href?: string
	nodeType?: SidebarNodeType
	childMap: Map<string, BuildNode>
}

/**
 * Build the sidebar tree for a **single project**. Only docs belonging to
 * `projectId` (by their first id segment, see `getProjectIdForDoc`) are included,
 * and that leading project segment is dropped from the tree — the project's own
 * folders sit at the top level, since the project switcher already names the
 * project. Hrefs keep the full id so navigation still resolves.
 */
export async function buildSidebar(projectId: string): Promise<SidebarNode[]> {
	const docs = await getAllDocs()
	const rootMap = new Map<string, BuildNode>()

	for (const entry of docs) {
		if (getProjectIdForDoc(entry.id) !== projectId) continue

		// Strip the leading project segment; the remaining segments form the tree.
		const segments = entry.id.split('/').slice(1)
		if (segments.length === 0) continue
		let current = rootMap

		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i]!
			const isLast = i === segments.length - 1

			if (!current.has(seg)) {
				current.set(seg, {
					label: isLast ? (entry.title ?? prettify(seg)) : prettify(seg),
					childMap: new Map(),
				})
			}

			const node = current.get(seg)!

			if (isLast) {
				// Canonical URL → permalink when the doc has one, else /{id}/.
				node.href = await getCanonicalUrl(entry.id)
				node.label = entry.title ?? prettify(seg)
				node.nodeType = detectNodeType(entry)
			}

			current = node.childMap
		}
	}

	return mapToNodes(rootMap)
}

function mapToNodes(map: Map<string, BuildNode>): SidebarNode[] {
	return Array.from(map.entries()).map(([, val]) => {
		const children = mapToNodes(val.childMap).sort((a, b) => a.label.localeCompare(b.label, 'ru'))
		return {
			label: val.label,
			href: val.href,
			nodeType: val.nodeType ?? (children.length > 0 ? 'directory' : 'file'),
			children,
		}
	})
}

export interface FlatSidebarItem {
	name: string
	href?: string
	type: SidebarNodeType
	children: string[]
}

export type FlatSidebarMap = Record<string, FlatSidebarItem>

/** Flatten the tree into the id-keyed map shape the headless-tree sidebar consumes. */
export function flattenSidebar(nodes: SidebarNode[]): FlatSidebarMap {
	const map: FlatSidebarMap = {}
	let counter = 0

	function walk(node: SidebarNode): string {
		const id = `n${counter++}`
		const childIds = node.children.map((child) => walk(child))
		map[id] = { name: node.label, href: node.href, type: node.nodeType, children: childIds }
		return id
	}

	const rootChildIds = nodes.map((node) => walk(node))
	map['root'] = { name: 'Root', type: 'directory', children: rootChildIds }

	return map
}
