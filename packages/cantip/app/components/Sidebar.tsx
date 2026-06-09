import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTree } from '@headless-tree/react'
import {
	syncDataLoaderFeature,
	hotkeysCoreFeature,
	expandAllFeature,
	selectionFeature,
} from '@headless-tree/core'
import { Link, useNavigate } from '@remix-run/react'
import {
	ChevronRight,
	ChevronsDownUp,
	File as FileIcon,
	Folder,
	Image as ImageIcon,
	LayoutDashboard,
	Locate,
	MoreVertical,
	Search,
} from 'lucide-react'
import { createPortal } from 'react-dom'

import type { FlatSidebarItem, FlatSidebarMap, SidebarNodeType } from '~/lib/sidebar.server'
import { Button } from '~/components/ui/button'
import { useTabs } from '~/lib/tabs'
import { t } from '~/lib/site'
import { useKeyboardShortcuts, type Shortcut } from '~/lib/useKeyboardShortcuts'
import { cn } from '~/lib/utils'

const WIDTH_STORAGE_KEY = 'sidebar-width'
const DEFAULT_WIDTH = 280
// Practically unlimited: a tiny floor so the drag handle is always grabbable, and
// a ceiling tied to the viewport (set at drag time) so the content column can't be
// pushed off-screen. These bounds exist only to keep the layout recoverable.
const MIN_WIDTH = 48
const MAX_VIEWPORT_GAP = 64 // px kept free on the right so content never vanishes
const TOC_WIDTH = 250 // width of the right "На этой странице" column (xl+ only)
const CONTENT_MIN = 640 // hide the TOC once the content column would be narrower

/**
 * Inline script injected into <head> (before paint) so the persisted sidebar
 * width — and the derived TOC visibility — are applied to <html> before first
 * render, avoiding a layout shift on load. Sets `--sidebar-width`, `--toc-width`
 * (collapses the TOC column to 0 when content would be too narrow), and toggles a
 * `toc-collapsed` class the Toc component keys off to hide itself. Falls back to
 * the default width when nothing is stored. Logic mirrors `applyLayout` below —
 * keep the two in sync.
 */
export const sidebarWidthInitScript = `(function(){try{var w=parseInt(localStorage.getItem('${WIDTH_STORAGE_KEY}'),10);if(!w||isNaN(w))w=${DEFAULT_WIDTH};var vw=window.innerWidth;var max=Math.max(${MIN_WIDTH},vw-${MAX_VIEWPORT_GAP});w=Math.min(max,Math.max(${MIN_WIDTH},w));var d=document.documentElement;d.style.setProperty('--sidebar-width',w+'px');var roomForToc=vw-w-${TOC_WIDTH}>=${CONTENT_MIN};d.style.setProperty('--toc-width',roomForToc?'${TOC_WIDTH}px':'0px');d.classList.toggle('toc-collapsed',!roomForToc);}catch(e){var d=document.documentElement;d.style.setProperty('--sidebar-width','${DEFAULT_WIDTH}px');d.style.setProperty('--toc-width','${TOC_WIDTH}px');}})();`

/**
 * Clamp a requested sidebar width to the viewport and apply it, plus the derived
 * TOC visibility, to <html>. Returns the clamped width (for persistence). Mirrors
 * `sidebarWidthInitScript` — keep the two in sync. Returns null off the client.
 */
function applyLayout(requested: number): number | null {
	if (typeof window === 'undefined') return null
	const vw = window.innerWidth
	const max = Math.max(MIN_WIDTH, vw - MAX_VIEWPORT_GAP)
	const w = Math.min(max, Math.max(MIN_WIDTH, requested))
	const d = document.documentElement
	d.style.setProperty('--sidebar-width', `${w}px`)
	const roomForToc = vw - w - TOC_WIDTH >= CONTENT_MIN
	d.style.setProperty('--toc-width', roomForToc ? `${TOC_WIDTH}px` : '0px')
	d.classList.toggle('toc-collapsed', !roomForToc)
	return w
}

const icons: Record<SidebarNodeType, JSX.Element> = {
	directory: <Folder className="size-4" />,
	file: <FileIcon className="size-4" />,
	canvas: <LayoutDashboard className="size-4" />,
	image: <ImageIcon className="size-4" />,
}

const iconColor: Record<SidebarNodeType, string> = {
	directory: 'text-sidebar-foreground/70',
	file: 'text-muted-foreground',
	canvas: 'text-amber-500',
	image: 'text-emerald-500',
}

/** Icon component per node type (for places that need the component, not an element). */
const iconComponent: Record<SidebarNodeType, typeof FileIcon> = {
	directory: Folder,
	file: FileIcon,
	canvas: LayoutDashboard,
	image: ImageIcon,
}

interface Props {
	data: FlatSidebarMap
	currentPath: string
	open?: boolean
	className?: string
}

const rowBase =
	'group flex items-center gap-1 rounded-md py-1.5 pr-2 text-sm cursor-pointer select-none transition-colors hover:bg-sidebar-accent'

/** Static, non-interactive tree for SSR / pre-hydration (links work without JS).
 *  Only renders children of folders in `expanded`, so the initial HTML matches
 *  the interactive tree's collapsed state — no expand→collapse flash on hydrate,
 *  and a far smaller DOM to send and parse. */
function FallbackTree({
	data,
	currentPath,
	expanded,
}: {
	data: FlatSidebarMap
	currentPath: string
	expanded: Set<string>
}) {
	const cur = normPath(currentPath)
	const renderNodes = (ids: string[], level: number): JSX.Element => (
		<ul className="list-none m-0 p-0">
			{ids.map((id) => {
				const item = data[id]
				if (!item) return null
				const isActive = item.href ? normPath(item.href) === cur : false
				const isFolder = item.children.length > 0
				const isOpen = isFolder && expanded.has(id)
				return (
					<li key={id}>
						<div
							title={item.name}
							className={cn(rowBase, isActive && 'bg-sidebar-accent')}
							style={{ paddingLeft: `${level * 12 + 8}px` }}
						>
							{isFolder ? (
								<span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
									<ChevronRight className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')} />
								</span>
							) : (
								<span className="size-4 shrink-0" />
							)}
							<span className={cn('flex size-4 shrink-0 items-center justify-center', iconColor[item.type])}>
								{icons[item.type] ?? icons.file}
							</span>
							{item.href ? (
								<Link
									to={item.href}
									className={cn(
										'flex-1 min-w-0 truncate no-underline',
										isActive ? 'text-foreground font-medium' : 'text-sidebar-foreground/80',
									)}
								>
									{item.name}
								</Link>
							) : (
								<span
									className={cn(
										'flex-1 min-w-0 truncate',
										level === 0 ? 'font-semibold text-foreground' : 'text-sidebar-foreground/80',
									)}
								>
									{item.name}
								</span>
							)}
						</div>
						{isOpen && renderNodes(item.children, level + 1)}
					</li>
				)
			})}
		</ul>
	)
	return <div className="outline-none">{renderNodes(data['root']?.children ?? [], 0)}</div>
}

/** Normalise a path for active-item comparison: decoded, no trailing slash. */
function normPath(p?: string): string {
	if (!p) return ''
	return decodeURIComponent(p).replace(/\/+$/, '')
}

function highlightParts(text: string, query: string): JSX.Element {
	if (!query) return <>{text}</>
	const lower = text.toLowerCase()
	const idx = lower.indexOf(query.toLowerCase())
	if (idx === -1) return <>{text}</>
	return (
		<>
			{text.slice(0, idx)}
			<mark className="bg-transparent font-semibold text-foreground">
				{text.slice(idx, idx + query.length)}
			</mark>
			{text.slice(idx + query.length)}
		</>
	)
}

interface SearchHit {
	id: string
	name: string
	/** "Folder › Subfolder" breadcrumb of the ancestors (excludes the item itself). */
	crumb: string
	type: SidebarNodeType
	href?: string
}

/** What the file-search modal matches against. */
type SearchScope = 'all' | 'files' | 'directories'
const SCOPE_OPTIONS: { value: SearchScope; label: string }[] = [
	{ value: 'all', label: 'Все' },
	{ value: 'files', label: 'Файлы' },
	{ value: 'directories', label: 'Папки' },
]

/**
 * WebStorm-style "search by file" modal: a centered overlay with a query input
 * and a keyboard-navigable result list. Opened from the sidebar header icon or
 * Ctrl/Cmd+P. Matches file (and, unless "только файлы" is on, folder) names by
 * substring; picking a result navigates to its doc (folders just reveal in the
 * tree). Self-contained — portal + outside-click + Esc, mirroring RowMenu/
 * ProjectSwitcher rather than pulling in a dialog dependency.
 */
function FileSearchModal({
	data,
	getAncestorIds,
	onClose,
	onPick,
}: {
	data: FlatSidebarMap
	getAncestorIds: (id: string) => string[]
	onClose: () => void
	onPick: (id: string) => void
}) {
	const [query, setQuery] = useState('')
	const [scope, setScope] = useState<SearchScope>('all')
	const [active, setActive] = useState(0)
	const inputRef = useRef<HTMLInputElement>(null)
	const listRef = useRef<HTMLUListElement>(null)

	// Focus the input on open.
	useEffect(() => {
		inputRef.current?.focus()
	}, [])

	// Close on Escape / outside click.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [onClose])

	const hits = useMemo<SearchHit[]>(() => {
		const q = query.trim().toLowerCase()
		const out: SearchHit[] = []
		for (const [id, item] of Object.entries(data)) {
			if (id === 'root') continue
			const isDir = item.type === 'directory'
			if (scope === 'files' && isDir) continue
			if (scope === 'directories' && !isDir) continue
			if (q && !item.name.toLowerCase().includes(q)) continue
			const crumb = getAncestorIds(id)
				.reverse()
				.map((a) => data[a]?.name)
				.filter(Boolean)
				.join(' › ')
			out.push({ id, name: item.name, crumb, type: item.type, href: item.href })
		}
		// Prefix matches first, then alphabetical — keeps the best match on top.
		out.sort((a, b) => {
			if (q) {
				const ap = a.name.toLowerCase().startsWith(q)
				const bp = b.name.toLowerCase().startsWith(q)
				if (ap !== bp) return ap ? -1 : 1
			}
			return a.name.localeCompare(b.name, 'ru')
		})
		return out.slice(0, 50)
	}, [query, scope, data, getAncestorIds])

	// Keep the active index in range as the result set changes, and scroll it in view.
	useEffect(() => {
		setActive(0)
	}, [query, scope])
	useEffect(() => {
		listRef.current
			?.querySelector('[data-active="true"]')
			?.scrollIntoView({ block: 'nearest' })
	}, [active, hits])

	const choose = (i: number) => {
		const hit = hits[i]
		if (hit) onPick(hit.id)
	}

	const onInputKey = (e: React.KeyboardEvent) => {
		if (e.key === 'ArrowDown') {
			e.preventDefault()
			setActive((a) => Math.min(a + 1, hits.length - 1))
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			setActive((a) => Math.max(a - 1, 0))
		} else if (e.key === 'Enter') {
			e.preventDefault()
			choose(active)
		}
	}

	return createPortal(
		<div
			className="fixed inset-0 z-100 bg-background/40 backdrop-blur-sm md:flex md:items-start md:justify-center md:p-4 md:pt-[12vh]"
			onMouseDown={onClose}
		>
			<div
				className="fixed inset-0 flex flex-col overflow-hidden bg-popover md:static md:max-h-[70vh] md:w-[min(40rem,calc(100vw-2rem))] md:rounded-lg md:border md:shadow-xl"
				onMouseDown={(e) => e.stopPropagation()}
			>
				<div className="flex items-center gap-2 border-b px-3">
					<Search className="size-4 shrink-0 text-muted-foreground" />
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={onInputKey}
						placeholder="Поиск по файлам..."
						autoComplete="off"
						className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
					/>
					<div className="flex shrink-0 items-center gap-0.5 rounded-md bg-muted p-0.5" role="tablist">
						{SCOPE_OPTIONS.map((opt) => (
							<button
								key={opt.value}
								type="button"
								role="tab"
								aria-selected={scope === opt.value}
								tabIndex={-1}
								onClick={() => setScope(opt.value)}
								className={cn(
									'rounded px-2 py-1 text-xs transition-colors',
									scope === opt.value
										? 'bg-background font-medium text-foreground shadow-sm'
										: 'text-muted-foreground hover:text-foreground',
								)}
							>
								{opt.label}
							</button>
						))}
					</div>
				</div>
				<ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1">
					{hits.length === 0 ? (
						<li className="px-3 py-6 text-center text-sm text-muted-foreground">Ничего не найдено</li>
					) : (
						hits.map((hit, i) => {
							const isActive = i === active
							const Icon = iconComponent[hit.type]
							return (
								<li key={hit.id}>
									<button
										type="button"
										data-active={isActive || undefined}
										onMouseMove={() => setActive(i)}
										onClick={() => choose(i)}
										className={cn(
											'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
											isActive && 'bg-sidebar-accent',
										)}
									>
										<Icon className="size-4 shrink-0 text-muted-foreground" />
										<span className="min-w-0 flex-1">
											<span className="block truncate text-sm text-foreground">
												{highlightParts(hit.name, query.trim())}
											</span>
											{hit.crumb && (
												<span className="block truncate text-xs text-muted-foreground">{hit.crumb}</span>
											)}
										</span>
									</button>
								</li>
							)
						})
					)}
				</ul>
				{/* Mobile-only footer: the full-screen sheet has no backdrop to
				    tap, so give an explicit way out. Hidden from md up, where the
				    backdrop + Escape dismiss the centered card. */}
				<div className="flex justify-end border-t p-3 md:hidden">
					<button
						type="button"
						onClick={onClose}
						className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent hover:text-foreground"
					>
						{t('close')}
					</button>
				</div>
			</div>
		</div>,
		document.body,
	)
}

interface RowMenuItem {
	label: string
	onSelect: () => void
}

/**
 * Per-row "more actions" menu (the ⋮ button at the end of a row). Hidden until
 * the row is hovered/active (driven by the parent's `group` + `forceShow`), and
 * revealed while its own dropdown is open. The dropdown is rendered in a portal
 * with fixed positioning computed from the button rect, so it isn't clipped by
 * the sidebar's `overflow` containers. Lightweight (outside-click + Escape),
 * mirroring the ProjectSwitcher pattern — no extra dependency. Renders whatever
 * `actions` the caller passes, so files and directories supply their own items.
 */
function RowMenu({
	forceShow,
	actions,
}: {
	/** Keep the button visible even when the row isn't hovered (e.g. active row). */
	forceShow?: boolean
	actions: RowMenuItem[]
}) {
	const [open, setOpen] = useState(false)
	const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
	const btnRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		if (!open) return
		const close = () => setOpen(false)
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false)
		}
		// Close on any outside interaction; also close on scroll/resize since the
		// fixed menu would otherwise float away from its (scrolled) row.
		document.addEventListener('mousedown', close)
		document.addEventListener('keydown', onKey)
		window.addEventListener('scroll', close, true)
		window.addEventListener('resize', close)
		return () => {
			document.removeEventListener('mousedown', close)
			document.removeEventListener('keydown', onKey)
			window.removeEventListener('scroll', close, true)
			window.removeEventListener('resize', close)
		}
	}, [open])

	const toggle = (e: React.MouseEvent) => {
		// Don't let the row's onClick/navigation fire from the menu button.
		e.stopPropagation()
		e.preventDefault()
		if (!open && btnRef.current) {
			const r = btnRef.current.getBoundingClientRect()
			setPos({ top: r.bottom + 2, left: r.right })
		}
		setOpen((o) => !o)
	}

	return (
		<>
			<button
				ref={btnRef}
				type="button"
				aria-label="Действия"
				aria-haspopup="menu"
				aria-expanded={open}
				// stop dblclick from opening a tab when interacting with the menu button
				onDoubleClick={(e) => {
					e.stopPropagation()
					e.preventDefault()
				}}
				onClick={toggle}
				className={cn(
					'flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground',
					open || forceShow ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
				)}
			>
				<MoreVertical className="size-3.5" />
			</button>
			{open &&
				pos &&
				createPortal(
					<div
						role="menu"
						// stop the document mousedown-to-close from firing for clicks inside
						onMouseDown={(e) => e.stopPropagation()}
						onClick={(e) => e.stopPropagation()}
						style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-100%)' }}
						className="z-[200] min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
					>
						{actions.map((action) => (
							<button
								key={action.label}
								type="button"
								role="menuitem"
								onClick={() => {
									setOpen(false)
									action.onSelect()
								}}
								className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent"
							>
								{action.label}
							</button>
						))}
					</div>,
					document.body,
				)}
		</>
	)
}

export default function Sidebar({ data, currentPath, open = false, className }: Props) {
	const navigate = useNavigate()
	const { hasTabs, openTab } = useTabs()

	// --- Parent map + active item (memoised on data/currentPath) ---
	const parentMap = useMemo(() => {
		const m = new Map<string, string>()
		for (const [id, item] of Object.entries(data)) {
			for (const childId of item.children) m.set(childId, id)
		}
		return m
	}, [data])

	const getAncestorIds = useCallback(
		(targetId: string): string[] => {
			const ancestors: string[] = []
			let cur = parentMap.get(targetId)
			while (cur && cur !== 'root') {
				ancestors.push(cur)
				cur = parentMap.get(cur)
			}
			return ancestors
		},
		[parentMap],
	)

	const activeId = useMemo(() => {
		const cur = normPath(currentPath)
		for (const [id, item] of Object.entries(data)) {
			if (item.href && normPath(item.href) === cur) return id
		}
		return null
	}, [data, currentPath])

	// --- Initial expanded state: collapsed by default, revealing only the
	//     ancestors of the active page so the current location is visible. ---
	const initialExpanded = useMemo(
		() => (activeId ? getAncestorIds(activeId) : []),
		[activeId, getAncestorIds],
	)

	// In-tree text filtering is no longer driven by a header input (replaced by the
	// file-search modal), so `search` stays '' and the filter/expand-all paths below
	// are inert. Kept so those code paths don't need unpicking; setSearch('') is still
	// used by locate() as a defensive reset.
	const [search, setSearch] = useState('')
	const [searchModalOpen, setSearchModalOpen] = useState(false)

	// useTree populates items only after a client-side effect runs, so during SSR
	// (and the first paint before hydration) we render a static fallback tree from
	// the same data. This keeps the nav present in the initial HTML and avoids an
	// empty-sidebar flash; the interactive tree takes over once mounted.
	const [mounted, setMounted] = useState(false)
	useEffect(() => setMounted(true), [])

	// Ctrl/Cmd+P opens the file-search modal (WebStorm/VS Code quick-open feel).
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
				e.preventDefault()
				setSearchModalOpen(true)
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [])

	// Re-evaluate the layout (clamp + TOC visibility) on window resize: a narrower
	// window can squeeze the content column just like a wider sidebar does. Reads
	// the current width from the CSS variable the init script / drag already set.
	useEffect(() => {
		const onResize = () => {
			const cur = parseInt(
				getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'),
				10,
			)
			applyLayout(Number.isNaN(cur) ? DEFAULT_WIDTH : cur)
		}
		window.addEventListener('resize', onResize)
		return () => window.removeEventListener('resize', onResize)
	}, [])

	const tree = useTree<FlatSidebarItem>({
		rootItemId: 'root',
		getItemName: (item) => item.getItemData().name,
		isItemFolder: (item) => item.getItemData().children.length > 0,
		dataLoader: {
			getItem: (itemId) => data[itemId],
			getChildren: (itemId) => data[itemId].children,
		},
		initialState: { expandedItems: initialExpanded },
		indent: 12,
		features: [syncDataLoaderFeature, hotkeysCoreFeature, expandAllFeature, selectionFeature],
	})

	// --- Search: compute matches + visible ancestors ---
	const { matchingIds, visibleIds } = useMemo(() => {
		const matching = new Set<string>()
		const visible = new Set<string>()
		const q = search.trim().toLowerCase()
		if (q) {
			for (const [id, item] of Object.entries(data)) {
				if (id === 'root') continue
				if (item.name.toLowerCase().includes(q)) {
					matching.add(id)
					visible.add(id)
					for (const anc of getAncestorIds(id)) visible.add(anc)
				}
			}
		}
		return { matchingIds: matching, visibleIds: visible }
	}, [search, data, getAncestorIds])

	const expandedBeforeSearch = useRef<string[] | null>(null)
	useEffect(() => {
		const q = search.trim()
		if (q) {
			if (expandedBeforeSearch.current === null) {
				expandedBeforeSearch.current = [...(tree.getState().expandedItems ?? [])]
			}
			tree.expandAll()
		} else if (expandedBeforeSearch.current !== null) {
			// Restore the pre-search shape: collapse everything search opened, then
			// re-expand only the folders that were open before. Use the instance
			// API (collapseAll + expand) — mutating expandedItems via setState does
			// not reliably re-collapse children in this version. The active item's
			// ancestors get re-revealed by the activeId effect (and clicking a search
			// result makes that result active, opening its folder).
			// Sort shallow→deep so each folder's parent is already expanded (and its
			// instance loaded) before we expand it.
			const toReopen = [...expandedBeforeSearch.current].sort(
				(a, b) => getAncestorIds(a).length - getAncestorIds(b).length,
			)
			expandedBeforeSearch.current = null
			tree.collapseAll()
			for (const id of toReopen) {
				const inst = tree.getItemInstance(id)
				if (inst && !inst.isExpanded()) inst.expand()
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [search])

	const treeContainerRef = useRef<HTMLDivElement>(null)

	// --- Collapse all: fold every open folder back to the root level. ---
	const collapseAll = useCallback(() => {
		setSearch('')
		tree.collapseAll()
	}, [tree])

	// --- Locate: expand ancestors of the active item and scroll to it ---
	const locate = useCallback(() => {
		if (!activeId) return
		setSearch('')
		// Expand outermost-first via the item-instance API (see the activeId
		// reveal effect above for why setState on expandedItems isn't enough).
		for (const id of getAncestorIds(activeId).reverse()) {
			const inst = tree.getItemInstance(id)
			if (inst && !inst.isExpanded()) inst.expand()
		}
		requestAnimationFrame(() => {
			const el = treeContainerRef.current?.querySelector('[data-active="true"]')
			if (el) {
				el.scrollIntoView({ block: 'center', behavior: 'smooth' })
				el.classList.add('locate-flash')
				el.addEventListener('animationend', () => el.classList.remove('locate-flash'), { once: true })
			}
		})
	}, [activeId, getAncestorIds, tree])

	// --- Scroll active item into view on first mount ---
	useEffect(() => {
		if (!activeId) return
		requestAnimationFrame(() => {
			treeContainerRef.current
				?.querySelector('[data-active="true"]')
				?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// --- Global keyboard shortcuts for the tree (fire anywhere outside a text
	//     field): `l` reveals the current page, `g c` collapses every folder. ---
	const treeShortcuts = useMemo<Shortcut[]>(
		() => [
			{ keys: 'l', label: 'Найти текущую страницу в дереве', group: 'Дерево', run: locate },
			{ keys: 'c', label: 'Свернуть все папки', group: 'Дерево', run: collapseAll },
		],
		[locate, collapseAll],
	)
	useKeyboardShortcuts(treeShortcuts)

	// --- Reveal the active item whenever it changes (e.g. navigating via a tab
	//     click after refresh): expand its ancestor folders so it isn't hidden
	//     inside a collapsed menu. `initialState` only applies at tree creation,
	//     so without this a later navigation leaves the item collapsed away.
	//     Skipped while searching, which drives its own expand-all behaviour. ---
	useEffect(() => {
		if (!activeId || search.trim()) return
		// getAncestorIds returns innermost-first; expand outermost-first so each
		// child folder's instance exists (it's only loaded once its parent is
		// expanded). Use the item-instance API — mutating expandedItems via
		// tree.setState does not reliably reveal children in this version.
		for (const id of getAncestorIds(activeId).reverse()) {
			const inst = tree.getItemInstance(id)
			if (inst && !inst.isExpanded()) inst.expand()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeId, getAncestorIds])

	// --- Resize: drag the right edge to set --sidebar-width, persisted. ---
	const [resizing, setResizing] = useState(false)
	const startResize = useCallback((e: React.PointerEvent) => {
		// Only the grid sidebar (md+) is resizable; the mobile overlay is full-width.
		e.preventDefault()
		setResizing(true)
		let lastWidth = DEFAULT_WIDTH
		const onMove = (ev: PointerEvent) => {
			// applyLayout clamps to the viewport and toggles the TOC; remember the
			// clamped result so pointer-up persists the value actually applied.
			lastWidth = applyLayout(ev.clientX) ?? lastWidth
		}
		const onUp = () => {
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
			setResizing(false)
			try {
				localStorage.setItem(WIDTH_STORAGE_KEY, String(lastWidth))
			} catch {
				/* ignore */
			}
		}
		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
	}, [])

	// While dragging, suppress text selection and force the resize cursor globally.
	useEffect(() => {
		if (!resizing) return
		const prev = document.body.style.cssText
		document.body.style.userSelect = 'none'
		document.body.style.cursor = 'col-resize'
		return () => {
			document.body.style.cssText = prev
		}
	}, [resizing])

	const isFiltering = search.trim().length > 0
	const items = tree.getItems()

	// Open a file from the sidebar, applying the tab rules:
	//  - double-click → always open as a tab
	//  - single-click → open as a tab only if tabs are already open; otherwise
	//    just navigate in place (no tab bar shown — the original behavior).
	// Either way the URL changes, and the route renders the doc; the tab list is
	// a UI layer on top. Returns nothing; callers handle the click guard.
	const openFile = useCallback(
		(href: string, name: string, isDoubleClick: boolean) => {
			if (isDoubleClick || hasTabs) openTab(href, name)
			navigate(href)
		},
		[hasTabs, openTab, navigate],
	)

	// Pick a result from the file-search modal: reveal the item in the tree
	// (expand its ancestor folders, outermost-first, so its instance exists),
	// focus it (the ring follows the selection), and scroll it into view. For a
	// file we also navigate to its doc and let it expand; a folder just opens.
	const pickSearchResult = useCallback(
		(id: string) => {
			setSearchModalOpen(false)
			const item = data[id]
			if (!item) return
			// Expand ancestors first so getItemInstance(id) resolves to a loaded item.
			for (const anc of getAncestorIds(id).reverse()) {
				const inst = tree.getItemInstance(anc)
				if (inst && !inst.isExpanded()) inst.expand()
			}
			const self = tree.getItemInstance(id)
			if (self) {
				if (!item.href && !self.isExpanded()) self.expand()
				self.setFocused()
			}
			if (item.href) navigate(item.href)
			requestAnimationFrame(() => {
				treeContainerRef.current
					?.querySelector(`[data-item-id="${CSS.escape(id)}"]`)
					?.scrollIntoView({ block: 'center', behavior: 'smooth' })
			})
		},
		[data, getAncestorIds, navigate, tree],
	)

	return (
		<aside
			id="sidebar"
			className={cn(
				// Desktop: pin just below the sticky TopBar (h-11 = 2.75rem) and shrink
				// height to match, so the bar never covers the menu and the sidebar
				// doesn't overflow past the viewport bottom.
				'sticky top-11 flex h-[calc(100vh-2.75rem)] flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground',
				// Mobile: full-screen overlay toggled by the bottom bar. Runs full
				// height (inset-0); the floating bottom bar (z-100) sits over it, and
				// the tree's bottom padding keeps the last items clear of that bar.
				'max-md:fixed max-md:inset-0 max-md:z-90 max-md:h-auto',
				open ? 'max-md:flex' : 'max-md:hidden',
				className,
			)}
		>
			{/* Resize handle: drag the right edge to set the sidebar width (md+ only). */}
			<div
				onPointerDown={startResize}
				role="separator"
				aria-orientation="vertical"
				aria-label="Изменить ширину панели"
				className={cn(
					'absolute right-0 top-0 z-10 hidden h-full w-1.5 cursor-col-resize md:block',
					'hover:bg-sidebar-accent',
					resizing && 'bg-sidebar-accent',
				)}
			/>
			<div className="flex shrink-0 items-center justify-end gap-2 border-b px-1 py-0.5 md:gap-0.5">
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={() => setSearchModalOpen(true)}
					title="Поиск по файлам (Ctrl+P)"
					aria-label="Поиск по файлам"
					className="size-9 text-muted-foreground md:size-6"
				>
					<Search className="size-4 md:size-3.5" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={locate}
					title="Найти в дереве (L)"
					aria-label="Найти текущую страницу в дереве"
					className="size-9 text-muted-foreground md:size-6"
				>
					<Locate className="size-4 md:size-3.5" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={collapseAll}
					title="Свернуть всё (C)"
					aria-label="Свернуть все папки"
					className="size-9 text-muted-foreground md:size-6"
				>
					<ChevronsDownUp className="size-4 md:size-3.5" />
				</Button>
			</div>

			{/* Extra bottom padding so the last tree items have breathing room and
			    stay comfortably scrollable into view at the bottom of the menu. On
			    mobile, clear the floating bottom bar (its height + gap + safe area)
			    so the last items aren't hidden behind it. */}
			<div
				className="flex-1 overflow-y-auto px-2 pt-1 pb-14 max-md:pb-[calc(var(--mobile-bar-height)+env(safe-area-inset-bottom)+3rem)]"
				ref={treeContainerRef}
			>
				{!mounted ? (
					<FallbackTree
						data={data}
						currentPath={currentPath}
						expanded={new Set(initialExpanded)}
					/>
				) : (
					<div {...tree.getContainerProps()} className="outline-none">
						{items.map((item) => {
							const id = item.getId()
							if (isFiltering && !visibleIds.has(id)) return null
							const itemData = item.getItemData()
							const isFolder = item.isFolder()
							const isActive = activeId === id
							const isMatch = matchingIds.has(id)
							const level = item.getItemMeta().level
							const rowProps = item.getProps()

							return (
								<div
									{...rowProps}
									key={id}
									title={itemData.name}
									data-item-id={id}
									data-active={isActive || undefined}
									className={cn(
										rowBase,
										isActive && 'bg-sidebar-accent',
										item.isFocused() && 'relative z-10 ring-1 ring-ring',
									)}
									style={{ paddingLeft: `${level * 12 + 8}px` }}
									onKeyDown={(e) => {
										// Preserve the tree's own key handling (arrow nav, expand/collapse).
										rowProps.onKeyDown?.(e)
										// Shift+Enter triggers the focused row's secondary action, mirroring
										// its RowMenu entry: a file opens in a new tab ("Открыть в новой
										// вкладке"); a folder expands recursively ("Развернуть рекурсивно").
										if (e.key === 'Enter' && e.shiftKey) {
											if (itemData.href) {
												e.preventDefault()
												openFile(itemData.href, itemData.name, true)
											} else if (isFolder) {
												e.preventDefault()
												void item.expandAll()
											}
										}
									}}
									onClick={(e) => {
										// Make the whole row navigate, not just the link text. The chevron
										// stops propagation, and the inner <Link> handles its own clicks
										// (incl. modifier-clicks / new-tab), so we only act on the rest of
										// the row and skip modified clicks here.
										rowProps.onClick?.(e)
										if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
										const target = e.target as HTMLElement
										if (itemData.href && !target.closest('a, [data-chevron]')) {
											openFile(itemData.href, itemData.name, false)
										}
									}}
									onDoubleClick={(e) => {
										// Double-click always opens the file as a tab (regardless of whether
										// any tabs are currently open). Skip the chevron and modifier-clicks.
										if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
										const target = e.target as HTMLElement
										if (itemData.href && !target.closest('[data-chevron]')) {
											e.preventDefault()
											openFile(itemData.href, itemData.name, true)
										}
									}}
								>
									{isFolder ? (
										<button
											type="button"
											data-chevron
											className="flex size-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
											onClick={(e) => {
												e.stopPropagation()
												if (item.isExpanded()) item.collapse()
												else item.expand()
											}}
										>
											<ChevronRight
												className={cn('size-3.5 transition-transform', item.isExpanded() && 'rotate-90')}
											/>
										</button>
									) : (
										<span className="size-4 shrink-0" />
									)}
									<span className={cn('flex size-4 shrink-0 items-center justify-center', iconColor[itemData.type])}>
										{icons[itemData.type] ?? icons.file}
									</span>
									{itemData.href ? (
										<Link
											to={itemData.href}
											onClick={(e) => {
												// Let the browser handle modifier-clicks (open in new tab, etc.).
												if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
												// Otherwise drive navigation through the tab rules instead of the
												// Link's default, so a single-click on the text honors hasTabs too.
												e.preventDefault()
												openFile(itemData.href!, itemData.name, false)
											}}
											className={cn(
												'flex-1 min-w-0 truncate no-underline',
												isActive ? 'text-foreground font-medium' : 'text-sidebar-foreground/80',
												isMatch && 'text-foreground font-semibold',
											)}
										>
											{isMatch ? highlightParts(itemData.name, search.trim()) : itemData.name}
										</Link>
									) : (
										<span
											className={cn(
												'flex-1 min-w-0 truncate',
												level === 0 ? 'font-semibold text-foreground' : 'text-sidebar-foreground/80',
												isMatch && 'text-foreground font-semibold',
											)}
										>
											{isMatch ? highlightParts(itemData.name, search.trim()) : itemData.name}
										</span>
									)}
									{/* "More actions" menu. File rows open the doc as an app tab;
									    directory rows expand the whole subtree recursively. The ⋮
									    button moves focus to its row first (it stops propagation, so
									    the tree's own click never runs) — keeping the focus ring on
									    the row whose action fired, like a normal row click would. */}
									{itemData.href ? (
										<RowMenu
											actions={[
												{
													label: 'Открыть в новой вкладке (Shift+Enter)',
													onSelect: () => {
														item.setFocused()
														openFile(itemData.href!, itemData.name, true)
													},
												},
											]}
										/>
									) : (
										isFolder && (
											<RowMenu
												actions={[
													{
														label: 'Развернуть рекурсивно (Shift+Enter)',
														onSelect: () => {
															item.setFocused()
															// expandAll on the item instance opens this folder and
															// every descendant folder (awaiting child loads as it goes).
															void item.expandAll()
														},
													},
												]}
											/>
										)
									)}
								</div>
							)
						})}
						{isFiltering && matchingIds.size === 0 && (
							<div className="p-4 text-center text-[0.8125rem] text-muted-foreground">Ничего не найдено</div>
						)}
					</div>
				)}
			</div>

			{searchModalOpen && (
				<FileSearchModal
					data={data}
					getAncestorIds={getAncestorIds}
					onClose={() => setSearchModalOpen(false)}
					onPick={pickSearchResult}
				/>
			)}
		</aside>
	)
}
