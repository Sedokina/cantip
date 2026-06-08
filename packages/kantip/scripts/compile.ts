import fs from 'node:fs/promises'
import path from 'node:path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import remarkMath from 'remark-math'
import remarkFrontmatter from 'remark-frontmatter'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeStringify from 'rehype-stringify'
import { visit } from 'unist-util-visit'
import { slug as slugify } from 'github-slugger'
import yaml from 'yaml'
import { slugifyObsidianPath } from './obsidian/obsidian.ts'
import type { Root as MdastRoot } from 'mdast'
import type { Root as HastRoot, Element } from 'hast'

export interface Heading {
	depth: number
	slug: string
	text: string
}

export interface CompiledDoc {
	/** Route id, e.g. "krista/глоссарий/коллекция" (no leading slash, no extension). */
	id: string
	frontmatter: Record<string, unknown>
	headings: Heading[]
	html: string
}

function extractFrontmatter(tree: MdastRoot): Record<string, unknown> {
	for (const node of tree.children) {
		if (node.type === 'yaml') {
			try {
				const parsed = yaml.parse((node as { value: string }).value)
				return parsed && typeof parsed === 'object' ? parsed : {}
			} catch {
				return {}
			}
		}
	}
	return {}
}

function nodeText(node: Element): string {
	let out = ''
	visit(node, 'text', (t: { value: string }) => {
		out += t.value
	})
	return out
}

/**
 * rehype plugin: assign slug ids to headings (matching Astro/github-slugger
 * behaviour) and collect them into `file.data.headings` for the TOC.
 */
function rehypeHeadings() {
	return (tree: HastRoot, file: { data: Record<string, unknown> }) => {
		const headings: Heading[] = []
		const seen = new Map<string, number>()
		visit(tree, 'element', (node: Element) => {
			const m = /^h([1-6])$/.exec(node.tagName)
			if (!m) return
			const depth = Number(m[1])
			const text = nodeText(node).trim()
			let id = slugify(text)
			// de-duplicate ids the way github-slugger does within a doc
			if (seen.has(id)) {
				const n = seen.get(id)! + 1
				seen.set(id, n)
				id = `${id}-${n}`
			} else {
				seen.set(id, 0)
			}
			node.properties = node.properties ?? {}
			if (!node.properties.id) node.properties.id = id
			headings.push({ depth, slug: String(node.properties.id), text })
		})
		file.data.headings = headings
	}
}

/**
 * rehype plugin: hoist `has-blank-before` from a `<code>` up to its `<pre>`.
 *
 * `remarkBlankLineGaps` attaches the class via mdast `hProperties`, which for a
 * fenced code block lands on the inner `<code>` element — but the block-level
 * box (and the `margin-block: 0` reset it must override) lives on the wrapping
 * `<pre>`. A class on `<code>` therefore produces no gap. Move it to the `<pre>`
 * so the marker sits on the element CSS actually keys the gap on.
 */
function rehypeHoistBlankBeforeToPre() {
	return (tree: HastRoot) => {
		visit(tree, 'element', (node: Element) => {
			if (node.tagName !== 'pre') return
			const code = node.children.find(
				(c): c is Element => c.type === 'element' && c.tagName === 'code',
			)
			if (!code) return
			const codeCls = code.properties?.className
			if (!Array.isArray(codeCls) || !codeCls.includes('has-blank-before')) return
			// Drop the marker from <code> and add it to <pre>.
			const remaining = codeCls.filter((c) => c !== 'has-blank-before')
			if (remaining.length > 0) code.properties!.className = remaining
			else delete code.properties!.className
			node.properties = node.properties ?? {}
			const preCls = node.properties.className
			node.properties.className = Array.isArray(preCls)
				? [...preCls, 'has-blank-before']
				: ['has-blank-before']
		})
	}
}

/**
 * remark plugin: attach `.has-blank-before` to every block the author separated
 * from its previous sibling with a blank line. Blank-line separation is the only
 * thing that earns a vertical gap; the gap itself lives entirely in CSS, keyed on
 * `.has-blank-before`.
 *
 * This plugin does NOT read source positions — it can't. The obsidian generator
 * round-trips the document through remark-stringify, which renormalises
 * blank-line spacing throughout (it drifts in 86% of files), so positions on the
 * markdown we compile here no longer reflect what the author wrote. Instead the
 * generator records the author's gaps at the source — where positions are
 * pristine — by inserting a `<!--blank-gap-->` comment (see BLANK_GAP_MARKER in
 * `scripts/obsidian/remark.ts`) before each gapped block. Here we simply honour
 * those markers: the block following a marker gets the class, and the marker is
 * stripped so it never reaches the HTML. Markers before raw `html` blocks aren't
 * emitted (callouts/canvas bring their own margins), so none are read for them.
 *
 * The class is attached through mdast `data.hProperties.className` so that
 * remark-rehype renders it onto the resulting element.
 */
const BLANK_GAP_MARKER = '<!--blank-gap-->'

function remarkBlankLineGaps() {
	type Parent = { children?: BlockNode[] }
	type BlockNode = {
		type: string
		value?: string
		data?: { hProperties?: { className?: string[] } }
		children?: BlockNode[]
	}
	const isGapMarker = (n: BlockNode | undefined) =>
		n?.type === 'html' && n.value?.trim() === BLANK_GAP_MARKER
	function walk(parent: Parent) {
		const children = parent.children
		if (!children) return
		// Strip gap markers, remembering which block each preceded so we can tag it
		// without leaving the comment behind. Iterate backwards so splices are safe.
		const gapped = new Set<BlockNode>()
		for (let i = children.length - 1; i >= 0; i--) {
			if (isGapMarker(children[i])) {
				const next = children[i + 1]
				if (next) gapped.add(next)
				children.splice(i, 1)
			}
		}
		for (const node of children) {
			if (gapped.has(node)) {
				node.data ??= {}
				node.data.hProperties ??= {}
				const cls = node.data.hProperties.className ?? []
				cls.push('has-blank-before')
				node.data.hProperties.className = cls
			}
			walk(node)
		}
	}
	return (tree: MdastRoot) => {
		walk(tree as unknown as Parent)
	}
}

const processor = unified()
	.use(remarkParse)
	.use(remarkFrontmatter)
	.use(remarkGfm)
	// Obsidian renders a single newline as a line break (a "hard break"); the
	// vault was authored against that behaviour (e.g. multi-line blockquotes
	// without trailing spaces). Default CommonMark collapses single newlines to
	// spaces — remark-breaks restores the Obsidian/GitHub line-break semantics.
	.use(remarkBreaks)
	// Mark blocks preceded by a blank line so CSS can apply the inter-block gap
	// ONLY there (see `.has-blank-before` in app.css), instead of a blanket
	// adjacent-sibling margin. Must run BEFORE remarkRehype (needs mdast
	// positions) and after remarkBreaks (which doesn't add/remove blocks).
	.use(remarkBlankLineGaps)
	.use(remarkMath, { singleDollarTextMath: true })
	// allowDangerousHtml: the generated markdown contains raw HTML (callouts,
	// <img>, canvas containers) produced by the obsidian remark pipeline.
	.use(remarkRehype, { allowDangerousHtml: true })
	.use(rehypeKatex)
	// remarkBlankLineGaps puts the gap marker on the inner <code>; move it up to
	// the <pre> so the inter-block gap actually applies (see plugin doc above).
	.use(rehypeHoistBlankBeforeToPre)
	.use(rehypeHeadings)
	.use(rehypeStringify, { allowDangerousHtml: true })

/** Compile a single markdown string to HTML + headings + frontmatter. */
export async function compileMarkdown(markdown: string): Promise<Omit<CompiledDoc, 'id'>> {
	const mdast = processor.parse(markdown) as MdastRoot
	const frontmatter = extractFrontmatter(mdast)
	const file = await processor.process(markdown)
	return {
		frontmatter,
		headings: (file.data.headings as Heading[]) ?? [],
		html: String(file),
	}
}

/** Walk a content directory and compile every .md file into the manifest. */
export async function compileDir(contentRoot: string, logger: { info(m: string): void }): Promise<CompiledDoc[]> {
	const docs: CompiledDoc[] = []

	async function walk(dir: string): Promise<void> {
		const entries = await fs.readdir(dir, { withFileTypes: true })
		await Promise.all(
			entries.map(async (entry) => {
				const full = path.join(dir, entry.name)
				if (entry.isDirectory()) {
					await walk(full)
				} else if (entry.isFile() && entry.name.endsWith('.md')) {
					const raw = await fs.readFile(full, 'utf8')
					const compiled = await compileMarkdown(raw)
					const rel = path.relative(contentRoot, full).replace(/\\/g, '/').replace(/\.md$/, '')
					// Slugify the id with the same logic used to generate internal link
					// hrefs (lowercase, slugified per segment) so routes match wikilinks.
					const id = slugifyObsidianPath(rel)
					docs.push({ id, ...compiled })
				}
			}),
		)
	}

	await walk(contentRoot)
	logger.info(`Compiled ${docs.length} markdown page(s) to HTML.`)
	return docs
}
