import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ChevronLeft, ChevronRight, List, Search as SearchIcon, X } from 'lucide-react'

import type { Heading } from '~/lib/content.server'
import { TocLinks, tocHeadings } from '~/components/Toc'
import FindOnPage from '~/components/FindOnPage'
import { t } from '~/lib/site'
import { cn } from '~/lib/utils'

/** Shared tab class — IDENTICAL to MobileBottomBar's `tab`, so this row reads as
 *  a second deck of the same bar (stacked size-5 icon + 0.625rem label). */
const tab =
	'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[0.625rem] font-medium text-muted-foreground transition-colors'

/**
 * Page-specific action menu (mobile only), styled as a SECOND DECK of the global
 * MobileBottomBar: same pill chrome, same tab sizing (size-5 icons, 0.625rem
 * labels), sitting directly above the global bar so the two read as one stacked
 * control. The global bar itself is left untouched — this is a separate
 * page-scoped strip.
 *
 *   - Collapsed: a slim bar in the same chrome with one centred trigger tab
 *     ("Действия" + chevron).
 *   - Tapped: it swaps to the full action row — "Наверх" (scroll to top) and
 *     "Содержание" (open the TOC sheet) — as bottom-bar-style tabs. A trailing
 *     close tab (chevron-down) collapses it; tapping an action also collapses.
 *
 * Quiet by default: HIDDEN on the first screen, fading in once scrolled ~1
 * viewport (at the top there's nothing to scroll up to and the intro stays
 * clean), and dimmed until reached for.
 *
 * Layering: same inset-x-3 width as the global bar, stacked just above it, at
 * z-80 — below the bar (z-100) AND below the mobile overlays (Sidebar/files and
 * Projects panel, both z-90) so those cover it just like they cover each other.
 * The TOC sheet it opens uses the modal tier (z-[200]).
 */
export default function PageFloatingMenu({ headings }: { headings: Heading[] }) {
	const shown = tocHeadings(headings)
	const [visible, setVisible] = useState(true)
	const [open, setOpen] = useState(false)
	const [tocOpen, setTocOpen] = useState(false)
	const [findOpen, setFindOpen] = useState(false)
	const navRef = useRef<HTMLElement>(null)

	// While the deck is open, any pointer/focus landing outside it collapses it —
	// standard dropdown dismissal. pointerdown fires before click so a tap-away
	// closes immediately; focusin covers keyboard/AT moving focus elsewhere.
	useEffect(() => {
		if (!open) return
		const onAway = (e: Event) => {
			if (!navRef.current?.contains(e.target as Node)) setOpen(false)
		}
		document.addEventListener('pointerdown', onAway)
		document.addEventListener('focusin', onAway)
		return () => {
			document.removeEventListener('pointerdown', onAway)
			document.removeEventListener('focusin', onAway)
		}
	}, [open])

	// Visibility for the collapsed trigger: show it at the very top, at the very
	// bottom, or while scrolling UP. Hide it while scrolling down, and — once you
	// scroll up and stop — auto-hide after a short idle so it doesn't linger over
	// the content. (The expanded row ignores all this; see the `open` guards.)
	useEffect(() => {
		if (open) return // While interacting, stay put — don't react to scroll.
		let lastY = window.scrollY
		let idle: ReturnType<typeof setTimeout> | undefined

		const evaluate = () => {
			clearTimeout(idle)
			const y = window.scrollY
			const max = document.documentElement.scrollHeight - window.innerHeight
			const atTop = y <= 4
			const atBottom = y >= max - 4
			const scrollingUp = y < lastY
			lastY = y

			if (atTop || atBottom) {
				setVisible(true) // Persistent edges — stay shown, no idle timer.
			} else if (scrollingUp) {
				setVisible(true)
				// Scrolled up then stopped → hide after the scrolling settles.
				idle = setTimeout(() => setVisible(false), 2000)
			} else {
				setVisible(false) // Scrolling down.
			}
		}

		evaluate()
		window.addEventListener('scroll', evaluate, { passive: true })
		return () => {
			clearTimeout(idle)
			window.removeEventListener('scroll', evaluate)
		}
	}, [open])

	const scrollTop = () => {
		setOpen(false)
		window.scrollTo({ top: 0, behavior: 'smooth' })
	}

	const openToc = () => {
		setOpen(false)
		setTocOpen(true)
	}

	const openFind = () => {
		setOpen(false)
		setFindOpen(true)
	}

	return (
		<>
			{open ? (
				/* Expanded: full-width deck matching the global bar, stacked above it. */
				<nav
					ref={navRef}
					className={cn(
						'fixed inset-x-3 bottom-[calc(var(--mobile-bar-height)+env(safe-area-inset-bottom)+1.5rem)] z-80 md:hidden',
						'flex items-stretch gap-1 rounded-2xl border bg-sidebar/95 px-1.5 py-1 shadow-lg backdrop-blur',
					)}
					aria-label={t('pageActions')}
				>
					<button type="button" onClick={scrollTop} className={tab} aria-label={t('scrollTop')}>
						<ArrowUp className="size-5" />
						<span>{t('scrollTop')}</span>
					</button>
					<button type="button" onClick={openFind} className={tab} aria-label={t('findOnPage')}>
						<SearchIcon className="size-5" />
						<span>{t('find')}</span>
					</button>
					<button type="button" onClick={openToc} className={tab} aria-label={t('toc')}>
						<List className="size-5" />
						<span>{t('toc')}</span>
					</button>
					<button
						type="button"
						onClick={() => setOpen(false)}
						className={tab}
						aria-label={t('hide')}
						aria-expanded
					>
						<ChevronRight className="size-5" />
						<span>{t('hide')}</span>
					</button>
				</nav>
			) : (
				/* Collapsed: a small centred pill, shown per the scroll rules above. */
				<div
					className={cn(
						'fixed inset-x-3 bottom-[calc(var(--mobile-bar-height)+env(safe-area-inset-bottom)+1.5rem)] z-80 flex justify-end md:hidden',
						'transition-opacity duration-200',
						visible ? 'opacity-100' : 'pointer-events-none opacity-0',
					)}
				>
					<button
						type="button"
						onClick={() => setOpen(true)}
						className="flex items-center gap-1 rounded-xl border bg-sidebar/95 px-3 py-2 text-[0.6875rem] font-medium text-muted-foreground shadow-md backdrop-blur transition-colors hover:text-foreground"
						aria-label={t('pageActions')}
						aria-expanded={false}
					>
						<ChevronLeft className="size-3.5" />
						На странице
					</button>
				</div>
			)}

			{tocOpen && <TocSheet shown={shown} onClose={() => setTocOpen(false)} />}
			{findOpen && <FindOnPage onClose={() => setFindOpen(false)} />}
		</>
	)
}

/**
 * Bottom-sheet TOC modal. Slides up from the bottom, backdrop dismiss + Escape +
 * body-scroll-lock, mirroring the Search modal conventions. Tapping a heading
 * link closes the sheet (the link's hash navigation scrolls to the heading).
 */
function TocSheet({ shown, onClose }: { shown: Heading[]; onClose: () => void }) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		document.addEventListener('keydown', onKey)
		const prev = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => {
			document.removeEventListener('keydown', onKey)
			document.body.style.overflow = prev
		}
	}, [onClose])

	return (
		<div
			className="fixed inset-0 z-[200] flex flex-col justify-end bg-background/40 backdrop-blur-sm md:hidden"
			onClick={onClose}
			role="dialog"
			aria-modal="true"
			aria-label={t('toc')}
		>
			<div
				className="flex h-[75vh] flex-col overflow-hidden rounded-t-2xl border-t bg-popover pb-[env(safe-area-inset-bottom)]"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
					<span className="text-sm font-semibold text-foreground">{t('toc')}</span>
					<button
						type="button"
						onClick={onClose}
						className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
						aria-label={t('close')}
					>
						<X className="size-5" />
					</button>
				</div>
				{/* onClick on the list closes after a heading is tapped (links bubble up). */}
				<div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-6 text-sm" onClick={onClose}>
					<TocLinks shown={shown} />
				</div>
			</div>
		</div>
	)
}
