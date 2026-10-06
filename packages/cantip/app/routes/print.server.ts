/**
 * Print route loader (server-only). Split out of `print.tsx` for the same reason
 * as `doc.server`: the consumer's route stub re-exports the loader from here and
 * the component from the client-safe module.
 */
import { json } from '@remix-run/node'
import type { LoaderFunctionArgs } from '@remix-run/node'
import type { Element, Root, RootContent } from 'hast'

import { docTitle, getDoc, getImage, resolvePathname, type Heading } from '~/lib/content.server'

interface PrintDoc {
	kind: 'doc'
	/** Element id of the page's title; heading ids inside the page start with `<anchor>-`. */
	anchor: string
	title: string
	frontmatter: Record<string, unknown>
	headings: Heading[]
	hast: Root
	newSheet: boolean
}

interface PrintImage {
	kind: 'image'
	anchor: string
	title: string
	src: string
	newSheet: boolean
}

type PrintPage = PrintDoc | PrintImage

/**
 * Prefix every `id` and every in-page `#` link in a page's tree, and point links
 * to other printed pages at their copy in this document. Printed pages share one
 * document, so two pages with the same heading or footnote id would otherwise
 * send TOC entries and footnote links to the first page.
 */
function rewriteTree(node: Root | RootContent, anchor: string, anchors: Map<string, string>): void {
	if (node.type === 'element') rewriteElement(node, anchor, anchors)
	if ('children' in node) for (const child of node.children) rewriteTree(child, anchor, anchors)
}

function rewriteElement(element: Element, anchor: string, anchors: Map<string, string>): void {
	const { id, href } = element.properties
	if (typeof id === 'string' && id) element.properties.id = `${anchor}-${id}`
	if (typeof href !== 'string') return
	if (href.startsWith('#') && href.length > 1) {
		element.properties.href = `#${anchor}-${href.slice(1)}`
	} else if (href.startsWith('/')) {
		const [path, hash] = href.split('#', 2)
		const target = anchors.get(resolvePathname(path) ?? '')
		if (target) element.properties.href = hash ? `#${target}-${hash}` : `#${target}`
	}
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const params = new URL(request.url).searchParams
	const pages: PrintPage[] = []
	const missing: string[] = []
	// Doc id → anchor of its first copy in this document.
	const anchors = new Map<string, string>()
	// Indexes into the `page` params, so they still match after missing pages are skipped.
	const sheets = new Set(params.getAll('sheet'))

	for (const [index, href] of params.getAll('page').entries()) {
		const newSheet = sheets.has(String(index))
		const id = resolvePathname(href)
		const anchor = `p${pages.length + 1}`
		const image = id ? await getImage(id) : null
		if (image) {
			if (!anchors.has(image.id)) anchors.set(image.id, anchor)
			pages.push({ kind: 'image', anchor, title: image.data.title, src: image.data.src, newSheet })
			continue
		}
		const doc = id ? await getDoc(id) : null
		if (!doc || doc.isCanvas || doc.frontmatter.draft === true) {
			missing.push(href)
			continue
		}
		if (!anchors.has(doc.id)) anchors.set(doc.id, anchor)
		pages.push({
			kind: 'doc',
			anchor,
			title: docTitle(doc, doc.id),
			frontmatter: doc.frontmatter,
			headings: doc.headings.map((h) => ({ ...h, slug: `${anchor}-${h.slug}` })),
			// The loader caches parsed content, so rewriting must not touch the shared tree.
			hast: structuredClone(doc.hast),
			newSheet,
		})
	}

	// A page can link to a page printed after it, so links are rewritten once every anchor is known.
	for (const page of pages) if (page.kind === 'doc') rewriteTree(page.hast, page.anchor, anchors)

	return json({
		pages,
		missing,
		toc: params.get('toc') === '1',
		props: params.get('props') === '1',
	})
}
