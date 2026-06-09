import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Search as SearchIcon, X } from 'lucide-react'

import { t } from '~/lib/site'
import { cn } from '~/lib/utils'

/**
 * In-page "find on this page" — a built-in replacement for the browser's Ctrl+F,
 * aimed at mobile where the native find bar is awful (tiny, covers content, hard
 * to dismiss). Searches only the article body (`article.content`), highlights
 * every match, and lets the reader step through them with a running "3 / 12"
 * count.
 *
 * Highlighting uses the CSS Custom Highlight API (`CSS.highlights` + the
 * `::highlight()` pseudo, styled in app.css). That paints over Range objects
 * WITHOUT mutating the DOM — essential here because the article HTML is injected
 * via dangerouslySetInnerHTML and React owns nothing inside it; wrapping matches
 * in <mark> would fight React and risk corrupting the content. Ranges are also
 * cheap to discard, so clearing on close is a one-liner.
 *
 * Rendered (mobile-only) by the doc route; opened from the page floating menu.
 */

/** Highlight registry names — two layers so the current match reads differently. */
const HL_ALL = 'find-all'
const HL_CURRENT = 'find-current'

/** Whether the browser supports the CSS Custom Highlight API we rely on. */
function highlightSupported(): boolean {
	return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined'
}

/** Drop both highlight layers from the global registry. */
function clearHighlights() {
	if (!highlightSupported()) return
	CSS.highlights.delete(HL_ALL)
	CSS.highlights.delete(HL_CURRENT)
}

/**
 * Collect every text node under `root`, skipping ones inside <script>/<style>
 * (never visible prose). Each node's full text is searched as one string.
 */
function textNodesIn(root: Node): Text[] {
	const nodes: Text[] = []
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			const parent = node.parentElement
			if (!parent) return NodeFilter.FILTER_REJECT
			const tag = parent.tagName
			if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT
			// Skip pure-whitespace nodes — nothing matchable, keeps the walk lean.
			if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT
			return NodeFilter.FILTER_ACCEPT
		},
	})
	let n = walker.nextNode()
	while (n) {
		nodes.push(n as Text)
		n = walker.nextNode()
	}
	return nodes
}

/**
 * Find every (case-insensitive) occurrence of `query` within the article and
 * return a Range per match. Matches are confined to single text nodes — a query
 * spanning element boundaries (e.g. across a <strong>) won't match, which is the
 * normal, acceptable limitation for this kind of find.
 */
function findRanges(root: Element, query: string): Range[] {
	const ranges: Range[] = []
	if (!query) return ranges
	const needle = query.toLowerCase()
	for (const node of textNodesIn(root)) {
		const haystack = (node.nodeValue ?? '').toLowerCase()
		let from = 0
		let idx = haystack.indexOf(needle, from)
		while (idx !== -1) {
			const range = document.createRange()
			range.setStart(node, idx)
			range.setEnd(node, idx + needle.length)
			ranges.push(range)
			from = idx + needle.length
			idx = haystack.indexOf(needle, from)
		}
	}
	return ranges
}

export default function FindOnPage({ onClose }: { onClose: () => void }) {
	const [query, setQuery] = useState('')
	const [ranges, setRanges] = useState<Range[]>([])
	const [current, setCurrent] = useState(0)
	const inputRef = useRef<HTMLInputElement>(null)

	const supported = useMemo(highlightSupported, [])

	// Focus the field on open so the reader can type straight away.
	useEffect(() => {
		inputRef.current?.focus()
	}, [])

	// Recompute matches whenever the query changes. Reset to the first match each
	// time so the count + current highlight stay in sync with what's typed.
	useEffect(() => {
		if (!supported) return
		const root = document.querySelector('article.content')
		const q = query.trim()
		const found = root && q ? findRanges(root, q) : []
		setRanges(found)
		setCurrent(0)
	}, [query, supported])

	// Paint the "all matches" layer whenever the match set changes, and the
	// "current match" layer whenever the set OR the cursor changes. Two separate
	// Highlight objects so the active match can be styled distinctly.
	useEffect(() => {
		if (!supported) return
		if (ranges.length === 0) {
			clearHighlights()
			return
		}
		CSS.highlights.set(HL_ALL, new Highlight(...ranges))
		const active = ranges[current]
		if (active) CSS.highlights.set(HL_CURRENT, new Highlight(active))
		else CSS.highlights.delete(HL_CURRENT)
	}, [ranges, current, supported])

	// Scroll the active match into view as the reader steps through.
	useEffect(() => {
		const active = ranges[current]
		if (!active) return
		// Range has no scrollIntoView; use its bounding rect's nearest element.
		const target =
			active.startContainer.parentElement ?? (active.commonAncestorContainer as Element | null)
		target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
	}, [ranges, current])

	// Always clear highlights when the bar unmounts (close), so matches don't
	// linger painted over the page after the reader is done.
	useEffect(() => clearHighlights, [])

	const step = useCallback(
		(delta: number) => {
			setCurrent((c) => {
				if (ranges.length === 0) return 0
				// Wrap around both ends so prev from the first lands on the last.
				return (c + delta + ranges.length) % ranges.length
			})
		},
		[ranges.length],
	)

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault()
			step(e.shiftKey ? -1 : 1)
		} else if (e.key === 'Escape') {
			e.preventDefault()
			onClose()
		}
	}

	const has = ranges.length > 0
	const q = query.trim()

	return (
		<div
			className={cn(
				'fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[110] md:hidden',
				'flex items-center gap-1 rounded-2xl border bg-sidebar/95 px-2 py-1.5 shadow-lg backdrop-blur',
			)}
			role="search"
			aria-label={t('findOnPage')}
		>
			<SearchIcon className="size-4 shrink-0 text-muted-foreground" />
			<input
				ref={inputRef}
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				onKeyDown={onKeyDown}
				placeholder={t('findOnPagePlaceholder')}
				className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
				autoComplete="off"
				spellCheck={false}
				enterKeyHint="search"
			/>

			{/* Match counter: "3 / 12", or "0" when nothing matches a non-empty query. */}
			{q && (
				<span className="shrink-0 px-1 text-xs tabular-nums text-muted-foreground">
					{has ? `${current + 1} / ${ranges.length}` : '0'}
				</span>
			)}

			<button
				type="button"
				onClick={() => step(-1)}
				disabled={!has}
				className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
				aria-label={t('prevMatch')}
			>
				<ChevronUp className="size-4" />
			</button>
			<button
				type="button"
				onClick={() => step(1)}
				disabled={!has}
				className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
				aria-label={t('nextMatch')}
			>
				<ChevronDown className="size-4" />
			</button>
			<button
				type="button"
				onClick={onClose}
				className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
				aria-label={t('closeFindOnPage')}
			>
				<X className="size-4" />
			</button>
		</div>
	)
}
