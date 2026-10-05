import { useEffect, useRef } from 'react'
import { useLoaderData } from '@remix-run/react'
import type { MetaFunction, SerializeFrom } from '@remix-run/node'
import { Printer, X } from 'lucide-react'

import type { loader } from './print.server'
import { pageTitleFromMatches } from '~/lib/meta'
import { useT } from '~/lib/site-context'
import { getPriority } from '~/lib/utils'
import { tocHeadings } from '~/components/Toc'
import { Button } from '~/components/ui/button'
import HastRenderer from '~/components/HastRenderer'
import PriorityBadge from '~/components/PriorityBadge'
import FrontmatterTable from '~/components/FrontmatterTable'

// NOTE: the `loader` lives in `./print.server` (`cantip/routes/print.server`), as
// for the doc route.

/** Tells the root layout to render this route without the sidebar, top bar and tabs, in the light theme. */
export const handle = { bare: true, theme: 'light' }

// Browsers name the saved PDF after the document title.
export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
	const single = data?.pages.length === 1 ? data.pages[0].title : undefined
	return [{ title: pageTitleFromMatches(matches, single) }]
}

type PrintPage = SerializeFrom<typeof loader>['pages'][number]

function waitForImages(): Promise<unknown> {
	return Promise.all(
		Array.from(document.images)
			.filter((img) => !img.complete)
			.map(
				(img) =>
					new Promise((resolve) => {
						img.addEventListener('load', resolve, { once: true })
						img.addEventListener('error', resolve, { once: true })
					}),
			),
	)
}

// A closed <details> hides its content from print in every browser, and CSS
// cannot open it.
async function preparePrint(): Promise<void> {
	for (const details of document.querySelectorAll('details')) details.open = true
	await document.fonts.ready
	await waitForImages()
}

export default function PrintRoute() {
	const { pages, missing, toc, props, breaks } = useLoaderData<typeof loader>()
	const t = useT()
	const printed = useRef(false)

	const print = async () => {
		await preparePrint()
		window.print()
	}

	// StrictMode runs effects twice in development; the ref keeps it to one dialog.
	useEffect(() => {
		if (printed.current || pages.length === 0) return
		printed.current = true
		void print()
	}, [pages.length])

	return (
		<div data-breaks={breaks || undefined} className="print-root mx-auto w-full max-w-[calc(720px+5rem)] px-10 pb-16 max-md:px-4">
			<div className="print-toolbar sticky top-0 z-10 -mx-10 mb-6 flex flex-col gap-2 border-b bg-background/95 px-10 py-3 backdrop-blur max-md:-mx-4 max-md:px-4">
				<div className="flex items-center justify-end gap-2">
					<Button variant="outline" size="sm" onClick={() => window.close()}>
						<X className="size-4" />
						{t('close')}
					</Button>
					<Button size="sm" onClick={() => void print()} disabled={pages.length === 0}>
						<Printer className="size-4" />
						{t('print')}
					</Button>
				</div>
				{missing.length > 0 && (
					<div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
						<p className="m-0">{t('printMissingPages')}</p>
						<ul className="m-0 mt-1 list-disc pl-5">
							{missing.map((href) => (
								<li key={href} className="break-all">
									{href}
								</li>
							))}
						</ul>
					</div>
				)}
			</div>

			{toc && pages.length > 1 && <CombinedToc pages={pages} />}
			{pages.map((page) => (
				<PrintedPage key={page.anchor} page={page} toc={toc && pages.length === 1} props={props} />
			))}
		</div>
	)
}

/** One TOC at the start of a multi-page print: each page title with its h2/h3 headings. */
function CombinedToc({ pages }: { pages: PrintPage[] }) {
	const t = useT()
	return (
		<nav className="print-toc">
			<h1 className="print-toc__title">{t('toc')}</h1>
			<ol className="print-toc__pages">
				{pages.map((page) => (
					<li key={page.anchor}>
						<a href={`#${page.anchor}`} className="print-toc__page">
							{page.title}
						</a>
						<HeadingList headings={page.headings} />
					</li>
				))}
			</ol>
		</nav>
	)
}

function HeadingList({ headings }: { headings: PrintPage['headings'] }) {
	const shown = tocHeadings(headings)
	if (shown.length === 0) return null
	return (
		<ul className="print-toc__headings">
			{shown.map((h) => (
				<li key={h.slug} data-depth={h.depth}>
					<a href={`#${h.slug}`}>{h.text}</a>
				</li>
			))}
		</ul>
	)
}

function PrintedPage({ page, toc, props }: { page: PrintPage; toc: boolean; props: boolean }) {
	const priority = getPriority(page.frontmatter.tags)
	return (
		<article className="content print-page">
			<h1 id={page.anchor} className="title-row">
				{page.title}
				{priority && <PriorityBadge priority={priority} />}
			</h1>
			{props && <FrontmatterTable frontmatter={page.frontmatter} open />}
			{toc && (
				<nav className="print-toc">
					<HeadingList headings={page.headings} />
				</nav>
			)}
			<div className="body">
				<HastRenderer tree={page.hast} />
			</div>
		</article>
	)
}
