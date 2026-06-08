import { useEffect, useState } from 'react'
import { useStickyBox } from 'react-sticky-box'
import type { Heading } from '~/lib/content.server'
import { t } from '~/lib/site'
import { cn } from '~/lib/utils'

// Headings shown in every TOC: section (h2) and subsection (h3) only.
export function tocHeadings(headings: Heading[]) {
	return headings.filter((h) => h.depth >= 2 && h.depth <= 3)
}

// Scroll-spy: returns the slug of the heading the reader is currently at.
//
// We observe each heading element and keep the set that's intersecting the
// "active band" — the top 20% of the viewport (rootMargin shrinks the bottom
// to -80%). The active heading is the LAST visible one in document order, so
// it stays highlighted while reading its section, then advances as the next
// heading crosses into the band. The 44px top inset matches the sticky TopBar
// so a heading scrolled flush under the bar still counts as "at the top".
export function useActiveHeading(shown: Heading[]) {
	const [activeSlug, setActiveSlug] = useState<string | null>(null)

	useEffect(() => {
		if (shown.length === 0) return

		const elements = shown
			.map((h) => document.getElementById(h.slug))
			.filter((el): el is HTMLElement => el !== null)
		if (elements.length === 0) return

		// Track visibility per slug so we can pick the last visible heading even
		// across multiple observer callbacks.
		const visible = new Set<string>()

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) visible.add(entry.target.id)
					else visible.delete(entry.target.id)
				}
				// Last visible heading in document order wins.
				const slugs = shown.map((h) => h.slug)
				const last = slugs.filter((s) => visible.has(s)).at(-1)
				if (last) {
					setActiveSlug(last)
				} else {
					// Nothing in the band (e.g. mid-section with a tall block):
					// keep the last heading scrolled past the top of the band.
					const passed = elements.filter((el) => el.getBoundingClientRect().top < 44)
					const lastPassed = passed.at(-1)
					if (lastPassed) setActiveSlug(lastPassed.id)
				}
			},
			{ rootMargin: '-44px 0px -80% 0px', threshold: 0 },
		)

		for (const el of elements) observer.observe(el)
		return () => observer.disconnect()
	}, [shown])

	return activeSlug
}

// Shared link list rendered by the desktop sidebar TOC and the mobile TOC modal.
export function TocLinks({ shown }: { shown: Heading[] }) {
	const activeSlug = useActiveHeading(shown)

	if (shown.length === 0) {
		return <p className="m-0 text-muted-foreground">Нет содержания</p>
	}
	return (
		<ul className="m-0 list-none p-0">
			{shown.map((h) => {
				const isActive = h.slug === activeSlug
				return (
					<li key={h.slug} className={cn('m-0', h.depth === 3 && 'pl-3')}>
						<a
							href={`#${h.slug}`}
							aria-current={isActive ? 'location' : undefined}
							className={cn(
								'block rounded px-2 py-1 no-underline hover:text-foreground',
								isActive
									? 'bg-accent font-medium text-foreground'
									: 'text-muted-foreground',
							)}
						>
							{h.text}
						</a>
					</li>
				)
			})}
		</ul>
	)
}

export default function Toc({ headings }: { headings: Heading[] }) {
	const shown = tocHeadings(headings)

	// "Smart sticky" via react-sticky-box: a short TOC pins below the TopBar and
	// stays; a TOC taller than the viewport follows the page as you scroll and
	// pins at whichever edge you scrolled away from (bottom on the way down, top
	// on the way back up) so every item is reachable without an inner scrollbar.
	// Plain CSS `position: sticky` can only pin one edge, which clipped tall TOCs.
	//
	// offsetTop is the 44px TopBar height (the bar is `sticky top-0 h-11`). The tab
	// strip lives in the content column (col 2), NOT over this TOC column (col 3),
	// so it never overlaps the TOC and the offset stays 44px whether tabs are open.
	const stickyRef = useStickyBox({ offsetTop: 44, offsetBottom: 0 })

	// The <aside> is the full-height TRACK: it spans both grid rows so its height
	// equals the scroll area the sticky inner node travels within. The inner <div>
	// (stickyRef) is what react-sticky-box positions.
	//
	// `!row-start-1` is important-flagged on purpose: the parent Outlet wrapper in
	// root.tsx applies `[&>*]:row-start-2` to every child, and that descendant
	// selector outranks a plain `xl:row-start-1` here — so without `!` the TOC
	// would start in row 2 (below the tab strip) instead of spanning from row 1.
	return (
		<aside
			id="toc"
			className="hidden border-l xl:col-start-3 xl:row-span-2 xl:!row-start-1 xl:block"
		>
			<div ref={stickyRef} className="px-5 pb-6 pt-2 text-[0.8125rem]">
				<h2 className="mb-2 mt-0 text-lg font-semibold text-foreground">{t('onThisPage')}</h2>
				<TocLinks shown={shown} />
			</div>
		</aside>
	)
}
