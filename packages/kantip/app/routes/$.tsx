import { useEffect } from 'react'
import { json, redirect } from '@remix-run/node'
import { useLoaderData, useLocation } from '@remix-run/react'
import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node'

import { getDoc, resolvePermalink, getPermalinkForId } from '~/lib/content.server'
import { getPriority } from '~/lib/utils'
import { t, pageTitle } from '~/lib/site'
import { Toc, DocPageOverride } from '~/lib/slots'
import PageFloatingMenu from '~/components/PageFloatingMenu'
import CanvasMount from '~/components/CanvasMount'
import { CodeWrapToggle } from '~/components/CodeWrapToggle'

/** A colored MoSCoW priority pill, rendered inline next to the page title. */
function PriorityBadge({ priority }: { priority: string }) {
	return (
		<span className="priority-badge" data-priority={priority}>
			{priority}
		</span>
	)
}

/** Render a single frontmatter value as text: arrays comma-joined, everything else stringified. */
function formatValue(value: unknown): string {
	if (Array.isArray(value)) return value.map((v) => String(v)).join(', ')
	if (value === null) return ''
	if (typeof value === 'object') return JSON.stringify(value)
	return String(value)
}

/** A generic key→value table of every frontmatter field, collapsed by default. */
function FrontmatterTable({ frontmatter }: { frontmatter: Record<string, unknown> }) {
	const entries = Object.entries(frontmatter)
	if (entries.length === 0) return null
	return (
		<details className="frontmatter">
			<summary className="frontmatter__summary">{t('properties')}</summary>
			<dl className="frontmatter__list">
				{entries.map(([key, value]) => (
					<div className="frontmatter__row" key={key}>
						<dt className="frontmatter__key">{key}</dt>
						<dd className="frontmatter__value">{formatValue(value)}</dd>
					</div>
				))}
			</dl>
		</details>
	)
}

export const loader = async ({ params }: LoaderFunctionArgs) => {
	// The splat param holds the full doc path, e.g. "krista/глоссарий/коллекция".
	const slug = (params['*'] ?? '').replace(/\/$/, '')

	// Permalinks make a doc's URL independent of its file name. The permalink is
	// the canonical URL: if `slug` is a permalink we serve the doc in place; if
	// it is the file-path URL of a doc that has a permalink, we 301 to the
	// permalink so there is a single canonical address that survives renames.
	const permalinkTarget = await resolvePermalink(slug)
	const docId = permalinkTarget ?? slug
	if (!permalinkTarget) {
		const canonical = await getPermalinkForId(slug)
		if (canonical && canonical !== slug) {
			return redirect(`/${canonical}/`, 301)
		}
	}

	const doc = await getDoc(docId)
	if (!doc || doc.frontmatter.draft === true) {
		throw new Response('Not Found', { status: 404 })
	}
	const title =
		(doc.frontmatter.title as string | undefined) ??
		slug.split('/').pop()?.replace(/-/g, ' ') ??
		slug
	return json({ doc, title })
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
	return [{ title: pageTitle(data?.title) }]
}

/**
 * Route default export: render the user's `DocPage` override when one is
 * configured (it receives the same loader data via `useLoaderData`), else the
 * engine's default doc body below.
 */
export default function DocPageRoute() {
	if (DocPageOverride) return <DocPageOverride />
	return <EngineDocPage />
}

function EngineDocPage() {
	const { doc, title } = useLoaderData<typeof loader>()
	const showToc = doc.frontmatter.tableOfContents !== false
	const isCanvas = doc.html.includes('canvas-container')
	const priority = getPriority(doc.frontmatter.tags)

	// Scroll to the #hash heading after the doc renders. Remix's ScrollRestoration
	// scrolls to the hash at the navigation's DOM commit, but when navigating
	// *between* docs the new heading only exists once this component renders the
	// new HTML — so that initial attempt misses and the first click appears to do
	// nothing (a second click, now same-doc, works). Re-running keyed on doc.id +
	// hash covers the cross-doc case. scrollIntoView honours the heading's
	// scroll-margin-top, so it lands below the sticky bars.
	const { hash } = useLocation()
	useEffect(() => {
		if (!hash) return
		const id = decodeURIComponent(hash.slice(1))
		// Wait a frame so the freshly-committed doc HTML is in the DOM.
		requestAnimationFrame(() => {
			document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
		})
	}, [doc.id, hash])

	if (isCanvas) {
		// Canvas pages span the content + TOC columns (everything right of the sidebar).
		return (
			<>
				<main className="min-w-0 xl:col-span-2">
					<article className="content">
						<h1 className="title-row px-10">
							{title}
							{priority && <PriorityBadge priority={priority} />}
						</h1>
						<div className="px-10">
							<FrontmatterTable frontmatter={doc.frontmatter} />
						</div>
						<div className="body" dangerouslySetInnerHTML={{ __html: doc.html }} />
					</article>
				</main>
				<CanvasMount deps={doc.id} />
				<CodeWrapToggle deps={doc.id} />
			</>
		)
	}

	return (
		<>
			{/* On mobile the bottom padding clears the global bar PLUS the page actions
			    deck that opens above it (one bar-height row sitting 1.5rem higher), so
			    the last lines of content never hide behind either, open or closed. */}
			<main className="mx-auto w-full min-w-0 max-w-[calc(720px+5rem)] px-10 pb-16 pt-8 max-md:px-4 max-md:pb-[calc(2*var(--mobile-bar-height)+env(safe-area-inset-bottom)+3rem)]">
				<article className="content">
					<h1 className="title-row">
						{title}
						{priority && <PriorityBadge priority={priority} />}
					</h1>
					<FrontmatterTable frontmatter={doc.frontmatter} />
					<div className="body" dangerouslySetInnerHTML={{ __html: doc.html }} />
				</article>
			</main>
			{showToc && <Toc headings={doc.headings} />}
			{showToc && <PageFloatingMenu headings={doc.headings} />}
			<CanvasMount deps={doc.id} />
			<CodeWrapToggle deps={doc.id} />
		</>
	)
}
