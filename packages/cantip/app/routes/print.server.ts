/**
 * Print route loader (server-only). Split out of `print.tsx` for the same reason
 * as `doc.server`: the consumer's route stub re-exports the loader from here and
 * the component from the client-safe module.
 */
import { json } from '@remix-run/node'
import type { LoaderFunctionArgs } from '@remix-run/node'
import type { Element, Root, RootContent } from 'hast'

import { docTitle, getDoc, resolvePathname, type Heading } from '~/lib/content.server'

interface PrintPage {
	/** Element id of the page's title; heading ids inside the page start with `<anchor>-`. */
	anchor: string
	title: string
	frontmatter: Record<string, unknown>
	headings: Heading[]
	hast: Root
}

/**
 * Prefix every `id` and every in-page `#` link in a page's tree. Printed pages
 * share one document, so two pages with the same heading or footnote id would
 * otherwise send TOC entries and footnote links to the first page.
 */
function prefixIds(node: Root | RootContent, prefix: string): void {
	if (node.type === 'element') prefixElement(node, prefix)
	if ('children' in node) for (const child of node.children) prefixIds(child, prefix)
}

function prefixElement(element: Element, prefix: string): void {
	const { id, href } = element.properties
	if (typeof id === 'string' && id) element.properties.id = prefix + id
	if (typeof href === 'string' && href.startsWith('#') && href.length > 1) {
		element.properties.href = `#${prefix}${href.slice(1)}`
	}
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const params = new URL(request.url).searchParams
	const pages: PrintPage[] = []
	const missing: string[] = []

	for (const href of params.getAll('page')) {
		const id = resolvePathname(href)
		const doc = id ? await getDoc(id) : null
		if (!doc || doc.isCanvas || doc.frontmatter.draft === true) {
			missing.push(href)
			continue
		}
		const anchor = `p${pages.length + 1}`
		// The loader caches parsed content, so prefixing must not touch the shared tree.
		const hast = structuredClone(doc.hast)
		prefixIds(hast, `${anchor}-`)
		pages.push({
			anchor,
			title: docTitle(doc, doc.id),
			frontmatter: doc.frontmatter,
			headings: doc.headings.map((h) => ({ ...h, slug: `${anchor}-${h.slug}` })),
			hast,
		})
	}

	return json({
		pages,
		missing,
		toc: params.get('toc') === '1',
		props: params.get('props') === '1',
		breaks: params.get('breaks') === '1',
	})
}
