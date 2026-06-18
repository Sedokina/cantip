import { useEffect } from 'react'
import { Link, isRouteErrorResponse, useLoaderData, useLocation, useRouteError } from '@remix-run/react'
import type { MetaFunction } from '@remix-run/node'

import type { loader } from './doc.server'
import { getPriority } from '~/lib/utils'
import { useT } from '~/lib/site-context'
import { Button } from '~/components/ui/button'
import { pageTitleFromMatches } from '~/lib/meta'
import { useComponent, useOverride } from '~/lib/components'
import PageFloatingMenu from '~/components/PageFloatingMenu'
import PublishToJira from '~/components/PublishToJira'
import EditSource from '~/components/EditSource'
import HastRenderer from '~/components/HastRenderer'

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
	const t = useT()
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

// NOTE: the `loader` is NOT exported here — it lives in `./doc.server`
// (`cantip/routes/doc.server`). The consumer's route stub imports the loader from
// there, keeping this component module client-safe. `meta` only needs the loader
// TYPE (import type above), which erases at build.
export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
	return [{ title: pageTitleFromMatches(matches, data?.title) }]
}

/**
 * Route default export: render the user's `DocPage` override when one is
 * configured (it receives the same loader data via `useLoaderData`), else the
 * engine's default doc body below.
 */
export default function DocPageRoute() {
	const DocPageOverride = useOverride('DocPage')
	if (DocPageOverride) return <DocPageOverride />
	return <EngineDocPage />
}

function EngineDocPage() {
	const Toc = useComponent('Toc')
	const { doc, title, editUrl, linkedTickets } = useLoaderData<typeof loader>()
	const showToc = doc.frontmatter.tableOfContents !== false
	const isCanvas = doc.isCanvas
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
				<main className="canvas-main min-w-0 xl:col-span-2">
					<article className="content">
						<h1 className="title-row canvas-title px-10">
							{title}
							{priority && <PriorityBadge priority={priority} />}
						</h1>
						<div className="body">
							<HastRenderer tree={doc.hast} />
						</div>
					</article>
				</main>
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
					<div className="flex items-start justify-between gap-4">
						<h1 className="title-row">
							{title}
							{priority && <PriorityBadge priority={priority} />}
						</h1>
						<div className="flex shrink-0 items-center gap-2">
							<EditSource url={editUrl} />
							<PublishToJira
								pageId={doc.id}
								title={title}
								linkedTickets={linkedTickets}
							/>
						</div>
					</div>
					<FrontmatterTable frontmatter={doc.frontmatter} />
					<div className="body">
						<HastRenderer tree={doc.hast} />
					</div>
				</article>
			</main>
			{showToc && <Toc headings={doc.headings} />}
			{showToc && <PageFloatingMenu headings={doc.headings} />}
		</>
	)
}

export const ErrorBoundary = StatusPage

/**
 * Route-level error boundary. A doc loader that can't find a page throws a 404
 * `Response` (see `doc.server`), which Remix routes here — so this renders in the
 * content column, inside the engine's chrome (sidebar/top bar stay put). A 404
 * gets the dedicated not-found design; any other thrown error gets the generic
 * variant. Both read their copy from the localized `ui` dictionary via `useT`.
 */
function StatusPage() {
	const error = useRouteError()
	const t = useT()
	const isNotFound = isRouteErrorResponse(error) && error.status === 404

	const code = isRouteErrorResponse(error) ? error.status : 500
	const title = isNotFound ? t('notFoundTitle') : t('errorTitle')
	const message = isNotFound ? t('notFoundMessage') : t('errorMessage')

	return (
		<main className="mx-auto flex w-full min-w-0 max-w-[calc(720px+5rem)] flex-col items-center px-10 pb-16 pt-[max(8vh,4rem)] text-center max-md:px-4 max-md:pb-20">
			{/* The status code as a big, soft watermark — uses the brand color at low
			    opacity so it reads as decoration, not as body text. */}
			<p
				aria-hidden
				className="select-none bg-gradient-to-b from-primary to-primary/40 bg-clip-text text-[clamp(6rem,22vw,11rem)] font-extrabold leading-none tracking-tight text-transparent"
			>
				{code}
			</p>
			<h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
				{title}
			</h1>
			<p className="mt-3 max-w-md text-balance text-base text-muted-foreground">{message}</p>
			<Button asChild size="lg" className="mt-8">
				<Link to="/">{t('backHome')}</Link>
			</Button>
		</main>
	)
}
