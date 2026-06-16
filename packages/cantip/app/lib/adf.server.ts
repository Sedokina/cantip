/**
 * HTML → ADF (Atlassian Document Format) conversion (server-only).
 *
 * Jira Cloud stores rich text as ADF — a JSON tree, not markdown or HTML. At
 * runtime cantip only has each page's pre-rendered HTML (the source markdown is
 * not in the build artifact), so this parses that HTML into a real hast tree
 * (via `hast-util-from-html`) and walks it into ADF, preserving structure:
 * headings, paragraphs, nested lists, blockquotes, code blocks, tables, rules,
 * and inline marks (bold/italic/code/strikethrough/links/super-&subscript).
 *
 * Things deliberately dropped (no clean ADF mapping without extra work/uploads):
 *   - images       → rendered as a link to the image src (alt text as label)
 *   - math/mermaid → flattened to their text content
 * Isolating all of this here means the rest of the integration is agnostic to
 * how faithful the conversion is.
 */
import { fromHtml } from 'hast-util-from-html'

/** A single ADF node (block or inline). */
export type AdfNode = Record<string, unknown>

/** An ADF document root. */
export interface AdfDoc {
	version: 1
	type: 'doc'
	content: AdfNode[]
}

/** An ADF inline mark (bold, link, …). */
interface Mark {
	type: string
	attrs?: Record<string, unknown>
}

/** Minimal hast node shape — enough to walk without depending on @types/hast. */
interface HNode {
	type: string
	tagName?: string
	value?: string
	properties?: Record<string, unknown>
	children?: HNode[]
}

const INLINE_MARK_TAGS: Record<string, () => Mark | null> = {
	strong: () => ({ type: 'strong' }),
	b: () => ({ type: 'strong' }),
	em: () => ({ type: 'em' }),
	i: () => ({ type: 'em' }),
	code: () => ({ type: 'code' }),
	del: () => ({ type: 'strike' }),
	s: () => ({ type: 'strike' }),
	strike: () => ({ type: 'strike' }),
	sup: () => ({ type: 'subsup', attrs: { type: 'sup' } }),
	sub: () => ({ type: 'subsup', attrs: { type: 'sub' } }),
}

const BLOCK_TAGS = new Set([
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
	'p', 'ul', 'ol', 'blockquote', 'pre', 'hr', 'table',
	'div', 'section', 'article', 'figure', 'figcaption', 'details',
])

/** Recursively concatenate raw text (whitespace preserved — for <pre>). */
function rawText(node: HNode): string {
	if (node.type === 'text') return node.value ?? ''
	return (node.children ?? []).map(rawText).join('')
}

/** The `language-xxx` class on a hast element, if any (for code blocks). */
function codeLanguage(node: HNode): string | null {
	const className = node.properties?.className
	const classes = Array.isArray(className) ? className.map(String) : []
	const lang = classes.find((c) => c.startsWith('language-'))
	return lang ? lang.slice('language-'.length) : null
}

/** Trim leading/trailing whitespace-only inline nodes and edge spaces. */
function trimInline(nodes: AdfNode[]): AdfNode[] {
	const isBlankText = (n: AdfNode) => n.type === 'text' && !String(n.text).trim()
	while (nodes.length && isBlankText(nodes[0])) nodes.shift()
	while (nodes.length && isBlankText(nodes[nodes.length - 1])) nodes.pop()
	if (nodes[0]?.type === 'text') nodes[0].text = String(nodes[0].text).replace(/^\s+/, '')
	const last = nodes[nodes.length - 1]
	if (last?.type === 'text') last.text = String(last.text).replace(/\s+$/, '')
	return nodes.filter((n) => n.type !== 'text' || String(n.text).length > 0)
}

/**
 * Build a text node with ADF-legal marks. Marks are deduped by type, and —
 * crucially — the `code` mark may only coexist with `link` in ADF, so when it's
 * present we drop every other mark. Emitting e.g. code+strong (from `**`x`**`)
 * makes Jira reject the whole document with INVALID_INPUT.
 */
function textNode(text: string, marks: Mark[]): AdfNode {
	if (marks.length === 0) return { type: 'text', text }
	const byType = new Map<string, Mark>()
	for (const m of marks) byType.set(m.type, m)
	let legal = [...byType.values()]
	if (byType.has('code')) legal = legal.filter((m) => m.type === 'code' || m.type === 'link')
	return legal.length ? { type: 'text', text, marks: legal } : { type: 'text', text }
}

/** Walk inline content, accumulating marks down the tree. */
function inlineNodes(nodes: HNode[], marks: Mark[]): AdfNode[] {
	const out: AdfNode[] = []
	for (const node of nodes) {
		if (node.type === 'text') {
			// HTML collapses runs of whitespace; mirror that for prose text.
			const text = (node.value ?? '').replace(/\s+/g, ' ')
			if (text) out.push(textNode(text, marks))
			continue
		}
		if (node.type !== 'element' || !node.tagName) continue
		const tag = node.tagName.toLowerCase()
		if (tag === 'br') {
			out.push({ type: 'hardBreak' })
			continue
		}
		if (tag === 'img') {
			const src = node.properties?.src
			if (typeof src === 'string' && src) {
				const alt = typeof node.properties?.alt === 'string' && node.properties.alt ? node.properties.alt : src
				out.push(textNode(alt, [...marks, { type: 'link', attrs: { href: src } }]))
			}
			continue
		}
		let mark: Mark | null = null
		if (tag === 'a') {
			const href = node.properties?.href
			mark = typeof href === 'string' && href ? { type: 'link', attrs: { href } } : null
		} else if (INLINE_MARK_TAGS[tag]) {
			mark = INLINE_MARK_TAGS[tag]()
		}
		out.push(...inlineNodes(node.children ?? [], mark ? [...marks, mark] : marks))
	}
	return out
}

/** Build a paragraph from inline content, or null if it has no text. */
function paragraph(children: HNode[]): AdfNode | null {
	const content = trimInline(inlineNodes(children, []))
	return content.length ? { type: 'paragraph', content } : null
}

/** Collect every <tr> under a table (through thead/tbody/tfoot). */
function tableRows(node: HNode): HNode[] {
	const rows: HNode[] = []
	for (const child of node.children ?? []) {
		if (child.type !== 'element' || !child.tagName) continue
		const tag = child.tagName.toLowerCase()
		if (tag === 'tr') rows.push(child)
		else if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') rows.push(...tableRows(child))
	}
	return rows
}

/** Convert an HTML <table> to an ADF table node, or null if it has no rows. */
function table(node: HNode): AdfNode | null {
	const rows: AdfNode[] = []
	for (const tr of tableRows(node)) {
		const cells: AdfNode[] = []
		for (const cell of tr.children ?? []) {
			if (cell.type !== 'element' || !cell.tagName) continue
			const tag = cell.tagName.toLowerCase()
			if (tag !== 'td' && tag !== 'th') continue
			const blocks = blockNodes(cell.children ?? [])
			// ADF cells require at least one block.
			if (blocks.length === 0) blocks.push({ type: 'paragraph', content: [] })
			cells.push({ type: tag === 'th' ? 'tableHeader' : 'tableCell', attrs: {}, content: blocks })
		}
		if (cells.length) rows.push({ type: 'tableRow', content: cells })
	}
	if (rows.length === 0) return null
	return { type: 'table', attrs: { isNumberColumnEnabled: false, layout: 'default' }, content: rows }
}

/** Convert a <ul>/<ol> to an ADF list, or null if it has no items. */
function list(node: HNode, type: 'bulletList' | 'orderedList'): AdfNode | null {
	const items: AdfNode[] = []
	for (const child of node.children ?? []) {
		if (child.type !== 'element' || child.tagName?.toLowerCase() !== 'li') continue
		const blocks = blockNodes(child.children ?? [])
		if (blocks.length === 0) blocks.push({ type: 'paragraph', content: [] })
		items.push({ type: 'listItem', content: blocks })
	}
	return items.length ? { type, content: items } : null
}

/** Expand a single block-level element into zero or more ADF block nodes. */
function handleBlock(node: HNode): AdfNode[] {
	const tag = node.tagName?.toLowerCase() ?? ''
	const children = node.children ?? []
	if (/^h[1-6]$/.test(tag)) {
		const content = trimInline(inlineNodes(children, []))
		return [{ type: 'heading', attrs: { level: Number(tag[1]) }, content }]
	}
	if (tag === 'p') {
		const p = paragraph(children)
		return p ? [p] : []
	}
	if (tag === 'ul' || tag === 'ol') {
		const l = list(node, tag === 'ul' ? 'bulletList' : 'orderedList')
		return l ? [l] : []
	}
	if (tag === 'blockquote') {
		const blocks = blockNodes(children)
		return blocks.length ? [{ type: 'blockquote', content: blocks }] : []
	}
	if (tag === 'pre') {
		const text = rawText(node).replace(/\n$/, '')
		if (!text) return []
		const langNode = children.find((c) => c.type === 'element' && c.tagName?.toLowerCase() === 'code')
		const language = (langNode && codeLanguage(langNode)) ?? codeLanguage(node)
		return [{ type: 'codeBlock', attrs: language ? { language } : {}, content: [{ type: 'text', text }] }]
	}
	if (tag === 'hr') return [{ type: 'rule' }]
	if (tag === 'table') {
		const t = table(node)
		return t ? [t] : []
	}
	// div/section/article/figure/details/etc — unwrap and keep walking.
	return blockNodes(children)
}

/**
 * Walk a list of hast nodes into ADF block nodes. Mixed inline + block content
 * (as inside <li>, <blockquote>, or a bare <div>) is handled by buffering runs
 * of inline nodes into paragraphs between the block-level children.
 */
function blockNodes(nodes: HNode[]): AdfNode[] {
	const blocks: AdfNode[] = []
	let inlineBuffer: HNode[] = []
	const flush = () => {
		if (inlineBuffer.length) {
			const p = paragraph(inlineBuffer)
			if (p) blocks.push(p)
			inlineBuffer = []
		}
	}
	for (const node of nodes) {
		if (node.type === 'element' && node.tagName && BLOCK_TAGS.has(node.tagName.toLowerCase())) {
			flush()
			blocks.push(...handleBlock(node))
		} else if (node.type === 'text' || node.type === 'element') {
			// Skip whitespace-only text between block elements.
			if (node.type === 'text' && !inlineBuffer.length && !(node.value ?? '').trim()) continue
			inlineBuffer.push(node)
		}
	}
	flush()
	return blocks
}

/** Convert rendered page HTML into a Jira-ready ADF document. */
export function htmlToAdf(html: string): AdfDoc {
	const root = fromHtml(html, { fragment: true }) as unknown as HNode
	const content = blockNodes(root.children ?? [])
	// ADF rejects an empty doc; guarantee at least one (empty) paragraph.
	if (content.length === 0) content.push({ type: 'paragraph', content: [] })
	return { version: 1, type: 'doc', content }
}

/**
 * Drop a leading level-1 heading from an ADF doc. A page's body starts with its
 * `# Title`, which becomes the issue summary — so repeating it in the
 * description is redundant. Used for whole-page publishes (not selections).
 */
export function dropLeadingTitle(doc: AdfDoc): AdfDoc {
	const [first, ...rest] = doc.content
	if (first?.type === 'heading' && (first.attrs as { level?: number } | undefined)?.level === 1) {
		return { ...doc, content: rest.length ? rest : [{ type: 'paragraph', content: [] }] }
	}
	return doc
}

/** Wrap plain text (e.g. a raw selection) as an ADF doc, one paragraph per block. */
export function textToAdf(text: string): AdfDoc {
	const content: AdfNode[] = text
		.split(/\n{2,}/)
		.map((b) => b.replace(/\s+/g, ' ').trim())
		.filter((b) => b.length > 0)
		.map((b) => ({ type: 'paragraph', content: [{ type: 'text', text: b }] }))
	if (content.length === 0) content.push({ type: 'paragraph', content: [] })
	return { version: 1, type: 'doc', content }
}
