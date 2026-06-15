import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from '@remix-run/react'
import {
	ChevronRight,
	FileText,
	Folder,
	FolderTree,
	Search as SearchIcon,
	WholeWord,
	X,
} from 'lucide-react'

import { findProject, type Project } from '~/lib/projects-core'
import { useProjects, useT } from '~/lib/site-context'
import { cn } from '~/lib/utils'

/**
 * Custom shadcn-styled search over Pagefind's JS API.
 *
 * The index + runtime are static assets under `/pagefind/` (generated at build
 * time by scripts/build-search-index.ts). We import `/pagefind/pagefind.js`
 * lazily on first open and call its `search()` directly, then render results
 * with our own markup so they match the rest of the chrome (instead of using
 * Pagefind's prebuilt UI). The same component backs both the desktop top bar
 * and the mobile bottom bar.
 */

interface PagefindSubResult {
	title: string
	url: string
	excerpt: string
}
interface PagefindData {
	url: string
	meta: { title?: string }
	excerpt: string
	sub_results?: PagefindSubResult[]
}
interface PagefindResult {
	id: string
	data: () => Promise<PagefindData>
}
/** Options accepted by Pagefind's search/debouncedSearch (the bits we use). */
interface PagefindSearchOptions {
	filters?: Record<string, string | string[]>
}
/** `filters()` returns each filter's values mapped to their result counts. */
type PagefindFilterCounts = Record<string, Record<string, number>>
interface PagefindApi {
	search: (
		query: string,
		options?: PagefindSearchOptions,
	) => Promise<{ results: PagefindResult[] }>
	debouncedSearch: (
		query: string,
		options?: PagefindSearchOptions,
		debounceMs?: number,
	) => Promise<{ results: PagefindResult[] } | null>
	filters: () => Promise<PagefindFilterCounts>
	preload: (query: string) => void
}

let pagefindPromise: Promise<PagefindApi | null> | null = null

/** Load and init the Pagefind runtime once. */
function loadPagefind(): Promise<PagefindApi | null> {
	if (typeof window === 'undefined') return Promise.resolve(null)
	if (pagefindPromise) return pagefindPromise
	pagefindPromise = (async () => {
		try {
			// Pagefind's runtime is a build-time-generated asset under public/.
			// Vite refuses to import files in public/ if it can see the path as a
			// literal, so build the URL at runtime (from the page origin) to keep
			// the import opaque — it stays a plain browser dynamic import().
			const url = `${window.location.origin}/pagefind/pagefind.js`
			const mod = (await import(/* @vite-ignore */ url)) as PagefindApi & {
				init?: () => Promise<void>
			}
			await mod.init?.()
			return mod
		} catch (err) {
			console.error('Failed to load Pagefind', err)
			pagefindPromise = null
			return null
		}
	})()
	return pagefindPromise
}

/** First path segment of the current route = the project the reader is in. */
function projectFromPath(pathname: string): string {
	return pathname.replace(/^\/+/, '').split('/')[0] ?? ''
}

/**
 * Display label for a project id. The id is the vault directory (the value
 * Pagefind filters on); show the human name from the project registry instead,
 * falling back to the raw id for any project not in the registry. Takes the
 * project list explicitly (it's runtime data now, read from context in the
 * component and passed down).
 */
function projectLabel(projects: Project[], id: string): string {
	return findProject(projects, id)?.name ?? id
}

/** A node in the directory tree built from the flat list of relative paths. */
interface DirNode {
	name: string // last path segment (display label)
	path: string // full relative path from the project root
	children: DirNode[]
}

/** Build a nested folder tree from flat relative paths like "a", "a/b", "a/b/c". */
function buildDirTree(paths: string[]): DirNode[] {
	const roots: DirNode[] = []
	const byPath = new Map<string, DirNode>()
	// Sorting guarantees parents are created before their children.
	for (const full of [...paths].sort()) {
		const segments = full.split('/')
		let prefix = ''
		let siblings = roots
		for (const seg of segments) {
			prefix = prefix ? `${prefix}/${seg}` : seg
			let node = byPath.get(prefix)
			if (!node) {
				node = { name: seg, path: prefix, children: [] }
				byPath.set(prefix, node)
				siblings.push(node)
			}
			siblings = node.children
		}
	}
	return roots
}

/** One row in the inline directory tree; recurses into its children. */
function DirTreeNode({
	node,
	depth,
	selected,
	onSelect,
}: {
	node: DirNode
	depth: number
	selected: string
	onSelect: (path: string) => void
}) {
	const hasChildren = node.children.length > 0
	// Auto-expand any ancestor of the current selection so it's visible on open.
	const [expanded, setExpanded] = useState(
		() => selected === node.path || selected.startsWith(`${node.path}/`),
	)
	const isSelected = selected === node.path
	return (
		<li>
			{/* A single click selects this folder; if it has children it also toggles
			    its expansion (open/close), so one click both highlights and drills.
			    Leaf folders just get selected. Selection is a draft — committed only
			    when the user presses OK in the modal footer. */}
			<button
				type="button"
				onClick={() => {
					onSelect(node.path)
					if (hasChildren) setExpanded((v) => !v)
				}}
				className={cn(
					'flex w-full items-center gap-1 rounded px-1 py-1 text-left hover:bg-accent',
					isSelected && 'bg-accent text-foreground',
				)}
				style={{ paddingLeft: `${depth * 12 + 4}px` }}
			>
				<ChevronRight
					className={cn(
						'size-3 shrink-0 transition-transform',
						expanded && 'rotate-90',
						!hasChildren && 'invisible',
					)}
				/>
				<Folder className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="truncate">{node.name}</span>
			</button>
			{hasChildren && expanded && (
				<ul>
					{node.children.map((child) => (
						<DirTreeNode
							key={child.path}
							node={child}
							depth={depth + 1}
							selected={selected}
							onSelect={onSelect}
						/>
					))}
				</ul>
			)}
		</li>
	)
}

/** Strip the trailing slash Pagefind preserves from our route URLs for <Link>. */
function toRoutePath(url: string): string {
	// Pagefind stores the url we indexed ("/krista/.../doc/"); drop any anchor's
	// leading host and keep the path + hash for sub-result deep links.
	return url
}

/** One result row: the page plus its best matching sub-sections. */
function ResultItem({ data, onNavigate }: { data: PagefindData; onNavigate: () => void }) {
	const title = data.meta.title ?? data.url
	const subs = (data.sub_results ?? []).slice(0, 3)
	return (
		<li className="rounded-md border bg-card">
			<Link
				to={toRoutePath(data.url)}
				onClick={onNavigate}
				className="flex items-start gap-2 rounded-md px-3 py-2 hover:bg-accent"
			>
				<FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
				<span className="min-w-0">
					<span className="block truncate text-sm font-medium">{title}</span>
					<span
						className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground [&_mark]:bg-transparent [&_mark]:font-semibold [&_mark]:text-foreground"
						dangerouslySetInnerHTML={{ __html: data.excerpt }}
					/>
				</span>
			</Link>
			{subs.length > 0 && (
				<ul className="border-t px-3 py-1">
					{subs.map((s) => (
						<li key={s.url}>
							<Link
								to={toRoutePath(s.url)}
								onClick={onNavigate}
								className="block truncate rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
							>
								{s.title}
							</Link>
						</li>
					))}
				</ul>
			)}
		</li>
	)
}

export function Search({
	className,
	enableShortcut = true,
	trigger,
}: {
	className?: string
	/**
	 * Whether this instance owns the global ⌘K shortcut. The app mounts two
	 * Search instances (desktop top bar + mobile bottom bar) at once; only one
	 * must handle ⌘K, otherwise both open and the hidden instance's portalled
	 * modal (which escapes its `md:hidden` container) covers the visible one with
	 * empty state. The mobile instance passes `enableShortcut={false}`.
	 */
	enableShortcut?: boolean
	/**
	 * Optional custom trigger. Given an `open` callback, it renders the element
	 * that opens the modal — lets callers (e.g. the mobile bottom bar) supply a
	 * differently-shaped button than the default bordered "Поиск…" pill while
	 * reusing all the modal logic. When omitted, the default trigger renders.
	 */
	trigger?: (open: () => void) => JSX.Element
}) {
	const t = useT()
	const projects = useProjects()
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState('')
	const [results, setResults] = useState<PagefindData[]>([])
	const [loading, setLoading] = useState(false)
	const [ready, setReady] = useState(false)
	const [mounted, setMounted] = useState(false)
	// Available filter values + counts from Pagefind (projects and directories).
	const [filterCounts, setFilterCounts] = useState<PagefindFilterCounts | null>(null)
	// Search scope. `project` defaults to the project the reader is currently in,
	// '' means all projects. `dir` is a directory path within the scope ('' = the
	// whole project/site). The user can opt out of the current project via these.
	const [project, setProject] = useState('')
	const [dir, setDir] = useState('')
	// What the user types in the directory box — a path RELATIVE to the selected
	// project (e.g. "требования/управление-клиентами"). Kept separate from the
	// committed `dir` (the full "<project>/<path>" filter value) so typing can show
	// hints without committing an invalid scope on every keystroke.
	const [dirInput, setDirInput] = useState('')
	// Whether the directory input is focused — the folder-picker dropdown shows
	// while focused (even with an empty input, to list top-level folders) and
	// hides on blur / selection.
	const [dirFocused, setDirFocused] = useState(false)
	// Screen-space rect of the directory input, used to position the folder
	// dropdown. The dropdown is portalled to <body> (so it escapes the modal's
	// `overflow-hidden`), which means it needs fixed coordinates rather than being
	// positioned relative to the input.
	const [dirRect, setDirRect] = useState<DOMRect | null>(null)
	const [showTree, setShowTree] = useState(false)
	// Draft folder selection inside the tree modal — a relative path. It's only
	// applied to the actual search scope when the user presses OK; Cancel discards
	// it. Seeded from the current scope each time the modal opens.
	const [treeDraft, setTreeDraft] = useState('')
	const inputRef = useRef<HTMLInputElement>(null)
	const dirInputRef = useRef<HTMLInputElement>(null)
	const location = useLocation()
	const currentProject = projectFromPath(location.pathname)

	// Portal target only exists on the client; gate the portal on mount.
	useEffect(() => setMounted(true), [])

	// Kick off loading the runtime as soon as the modal opens, and focus input.
	// If reopening onto a PRESERVED search (a non-empty query survived the last
	// dismiss), keep the query + scope so the user resumes where they left off.
	// Only a fresh open (no query) seeds the scope to the reader's current project.
	useEffect(() => {
		if (!open) return
		if (!query) {
			setProject(currentProject)
			setDir('')
			setDirInput('')
		}
		setShowTree(false)
		loadPagefind().then(async (api) => {
			setReady(!!api)
			if (api) setFilterCounts(await api.filters())
		})
		inputRef.current?.focus()
		// Read currentProject/query only at open time; we don't want to reset the
		// user's scope mid-session if the route changes underneath the open modal.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open])

	// Run a (debounced) search whenever the query changes.
	useEffect(() => {
		if (!open) return
		const q = query.trim()
		if (!q) {
			setResults([])
			setLoading(false)
			return
		}
		let cancelled = false
		setLoading(true)
		// Scope the search. A selected directory is the most specific filter and
		// already carries its project prefix, so it stands alone; otherwise fall
		// back to the project filter. Neither set → search everything.
		const filters: Record<string, string> = {}
		if (dir) filters.dir = dir
		else if (project) filters.project = project
		const options: PagefindSearchOptions = Object.keys(filters).length ? { filters } : {}
		loadPagefind().then(async (api) => {
			if (!api || cancelled) return
			const search = await api.debouncedSearch(q, options, 200)
			if (cancelled || !search) return // superseded by a newer keystroke
			const data = await Promise.all(search.results.slice(0, 8).map((r) => r.data()))
			if (cancelled) return
			setResults(data)
			setLoading(false)
		})
		return () => {
			cancelled = true
		}
	}, [query, project, dir, open])

	// Hide the modal but PRESERVE the query + scope, so reopening (top bar / ⌘K)
	// resumes the same search — the common "that result wasn't it, let me keep
	// looking" flow. Only the transient picker UI (tree/dir dropdown) is reset.
	const dismiss = useCallback(() => {
		setOpen(false)
		setDirFocused(false)
		setShowTree(false)
	}, [])

	// Wipe to a clean state: empty query, no directory, scope back to the reader's
	// current project. Used by the in-field clear (X) button.
	const reset = useCallback(() => {
		setQuery('')
		setResults([])
		setProject(currentProject)
		setDir('')
		setDirInput('')
		setDirFocused(false)
		setShowTree(false)
		inputRef.current?.focus()
		// currentProject changes with the route; reading it here (clear pressed) is
		// intentional — a fresh search should scope to wherever the reader now is.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentProject])

	// Whether the current input is wrapped in quotes — Pagefind's exact-phrase
	// syntax. Derived from the text itself (not separate state) so the button and
	// the visible input never disagree, even if the user types/edits quotes by hand.
	const isExact = (() => {
		const t = query.trim()
		return t.length >= 2 && t.startsWith('"') && t.endsWith('"')
	})()

	// Project options (sorted) from the index, for the scope selector.
	const projectOptions = Object.keys(filterCounts?.project ?? {}).sort()

	// Directory paths within the active project, RELATIVE to it (the "<project>/"
	// prefix stripped). These feed both the type-ahead hints and the tree view.
	// Without a project selected there's nothing to be relative to, so the dir
	// picker is hidden (the project dropdown is the only scope control then).
	const relDirs = (() => {
		if (!project) return [] as string[]
		const prefix = `${project}/`
		return Object.keys(filterCounts?.dir ?? {})
			.filter((d) => d.startsWith(prefix))
			.map((d) => d.slice(prefix.length))
			.filter(Boolean)
			.sort()
	})()

	// Nested tree of the project's directories, for the inline tree-view picker.
	const dirTree = buildDirTree(relDirs)

	// Commit a relative directory path as the active scope. Empty → whole project.
	// The committed `dir` filter value is always the full "<project>/<rel>".
	const commitDir = useCallback(
		(rel: string) => {
			// Keep the raw text the user typed verbatim in the box — including any
			// "/" separators they enter to build a nested path. Only normalise
			// (strip leading/trailing slashes) when deriving the committed filter
			// value, so a half-typed "требования/" still searches "требования" but
			// the slash stays visible for the next segment.
			setDirInput(rel)
			const clean = rel.replace(/^\/+|\/+$/g, '')
			setDir(clean && project ? `${project}/${clean}` : '')
		},
		[project],
	)

	// Measure the directory input's position so the portalled dropdown can be
	// placed right below it in screen space.
	const measureDir = useCallback(() => {
		const el = dirInputRef.current
		setDirRect(el ? el.getBoundingClientRect() : null)
	}, [])

	// Keep the dropdown anchored while it's open: re-measure on scroll/resize.
	useEffect(() => {
		if (!dirFocused) return
		measureDir()
		const onMove = () => measureDir()
		// Capture phase catches scrolls inside the modal's overflow containers too.
		window.addEventListener('scroll', onMove, true)
		window.addEventListener('resize', onMove)
		return () => {
			window.removeEventListener('scroll', onMove, true)
			window.removeEventListener('resize', onMove)
		}
	}, [dirFocused, measureDir])

	// Picking a folder from the hints/tree commits it AND, if it has sub-folders,
	// appends a trailing "/" so the user can keep typing the next segment straight
	// away (leaf folders get no dead slash). The filter value is the same either
	// way — commitDir strips the trailing slash when deriving it.
	const selectDir = useCallback(
		(rel: string) => {
			const hasChildren = relDirs.some((d) => d.startsWith(`${rel}/`))
			commitDir(hasChildren ? `${rel}/` : rel)
		},
		[relDirs, commitDir],
	)

	// Folder picker entries — the directories on the CURRENT level only (like a
	// file browser), not the whole matching subtree. The typed text is split into
	// a committed parent path (everything up to the last "/") and a partial segment
	// being typed (after it). We list the parent's DIRECT children whose name
	// starts with the partial segment. So: empty/"" → top-level folders;
	// "требования/" → children of требования; "требования/да" → children of
	// требования starting with "да". Each entry is a full relative path (so
	// selecting it commits correctly), but we display only the last segment.
	const dirHints = (() => {
		const raw = dirInput.replace(/^\/+/, '') // keep a trailing slash; drop leading
		const slash = raw.lastIndexOf('/')
		const parent = slash === -1 ? '' : raw.slice(0, slash) // committed dir, no trailing /
		const partial = (slash === -1 ? raw : raw.slice(slash + 1)).toLowerCase()
		const childPrefix = parent ? `${parent}/` : ''
		const seen = new Set<string>()
		const entries: string[] = []
		for (const d of relDirs) {
			if (parent && !d.startsWith(childPrefix)) continue
			const rest = d.slice(childPrefix.length)
			if (!rest) continue
			const name = rest.split('/')[0] // first segment below the parent = this level
			const fullPath = `${childPrefix}${name}`
			if (seen.has(fullPath)) continue
			if (partial && !name.toLowerCase().startsWith(partial)) continue
			seen.add(fullPath)
			entries.push(fullPath)
		}
		return entries.sort().slice(0, 12)
	})()

	// Normalised relative dir (no surrounding slashes) for exact comparisons such
	// as highlighting the active node in the tree.
	const dirRel = dirInput.trim().replace(/^\/+|\/+$/g, '')

	// Enter in the directory box "accepts" the best match: take the top hint (or,
	// if the text already exactly names a folder, that folder) and complete it via
	// selectDir — adding the trailing "/" when it has children so the user keeps
	// drilling. No match → leave the typed text as the (free-form) scope.
	const completeDir = useCallback(() => {
		if (!dirRel) return
		const exact = relDirs.find((d) => d.toLowerCase() === dirRel.toLowerCase())
		const best = exact ?? dirHints[0]
		if (best) selectDir(best)
	}, [dirRel, relDirs, dirHints, selectDir])

	// Reset the directory when the project scope changes — a directory from another
	// project would be empty under the new scope.
	const changeProject = useCallback((next: string) => {
		setProject(next)
		setDir('')
		setDirInput('')
		setShowTree(false)
		inputRef.current?.focus()
	}, [])

	// Toggle exact match by literally adding/removing the surrounding quotes in the
	// input, so the user sees exactly what's being searched. We trim first so the
	// quotes hug the text, then refocus the input for continued typing.
	const toggleExact = useCallback(() => {
		setQuery((q) => {
			const t = q.trim()
			if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
				return t.slice(1, -1)
			}
			return `"${t.replace(/"/g, '')}"`
		})
		inputRef.current?.focus()
	}, [])

	// Dismiss (not reset) on navigation so the query + scope survive — reopening
	// resumes the same search if the opened result wasn't the right one. Clicking a
	// result fires the <Link>'s onClick (which dismisses), but a result pointing at
	// the current page only changes the hash and a same-tick dismiss can be missed;
	// watching location guarantees the modal hides whenever a result navigates.
	useEffect(() => {
		if (open) dismiss()
		// Only react to location changes, not to `open` toggling on its own.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [location.pathname, location.hash])

	// Escape to close + lock background scroll while open. When the folder tree
	// modal is open, Escape dismisses just that (one layer at a time) and leaves
	// the search modal open.
	useEffect(() => {
		if (!open) return
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return
			if (showTree) setShowTree(false)
			else dismiss()
		}
		document.addEventListener('keydown', onKey)
		const prev = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => {
			document.removeEventListener('keydown', onKey)
			document.body.style.overflow = prev
		}
	}, [open, dismiss, showTree])

	// Global Cmd/Ctrl-K to open — only on the instance that owns the shortcut, so
	// the two mounted Search instances don't both open on one keypress.
	useEffect(() => {
		if (!enableShortcut) return
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault()
				setOpen(true)
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [enableShortcut])

	return (
		<>
			{trigger ? (
				trigger(() => setOpen(true))
			) : (
				<button
					type="button"
					onClick={() => setOpen(true)}
					className={cn(
						'inline-flex items-center gap-2 rounded-md border bg-background/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
						className,
					)}
					aria-label={t('search')}
				>
					<SearchIcon className="size-4 shrink-0" />
					<span className="max-md:hidden">{t('searchEllipsis')}</span>
					<kbd className="ml-auto hidden rounded border px-1.5 text-xs md:inline">Ctrl K</kbd>
				</button>
			)}

			{open &&
				mounted &&
				createPortal(
					// Portalled to <body> so the overlay escapes the top bar's
					// `-translate-x-1/2` transform — a transformed ancestor would
					// otherwise become the containing block for this `fixed` element,
					// trapping the backdrop and width inside the narrow centered bar.
					<div
						className="fixed inset-0 z-[200] bg-background/40 backdrop-blur-sm md:flex md:items-start md:justify-center md:p-4 md:pt-[10vh]"
						onMouseDown={dismiss}
						role="dialog"
						aria-modal="true"
						aria-label={t('searchDocs')}
					>
					<div
						className="fixed inset-0 flex flex-col overflow-hidden bg-popover md:static md:max-h-[80vh] md:w-full md:max-w-3xl md:rounded-lg md:border md:shadow-xl"
						onMouseDown={(e) => e.stopPropagation()}
					>
						{/* Search field */}
						<div className="flex items-center gap-2 border-b px-3">
							<SearchIcon className="size-4 shrink-0 text-muted-foreground" />
							<input
								ref={inputRef}
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder={t('searchDocsPlaceholder')}
								className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
								autoComplete="off"
								spellCheck={false}
							/>
							<button
								type="button"
								onClick={toggleExact}
								className={cn(
									'rounded p-1 hover:bg-accent hover:text-foreground',
									isExact ? 'bg-accent text-foreground' : 'text-muted-foreground',
								)}
								aria-label={t('exactMatch')}
								aria-pressed={isExact}
								title={t('exactMatchHint')}
							>
								<WholeWord className="size-4" />
							</button>
							{/* Clear to a clean state (empty query, scope back to the current
							    project) without leaving search — for starting a fresh search.
							    The modal still closes via Escape, the backdrop, or ⌘K toggling.
							    Disabled when there's nothing to clear. */}
							<button
								type="button"
								onClick={reset}
								disabled={!query && !dir}
								className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
								aria-label={t('clearSearch')}
								title={t('clear')}
							>
								<X className="size-4" />
							</button>
						</div>

						{/* Scope: project dropdown + a relative directory path box with
						    type-ahead hints and an inline tree-view picker. Defaults to
						    the reader's current project; "Все проекты" opts out site-wide. */}
						{projectOptions.length > 0 && (
							<div className="border-b px-3 py-2 text-xs text-muted-foreground">
								<div className="flex flex-wrap items-center gap-2">
									<span className="shrink-0">{t('searchIn')}</span>
									<select
										value={project}
										onChange={(e) => changeProject(e.target.value)}
										className="rounded border bg-background px-2 py-1 text-foreground outline-none focus:ring-1 focus:ring-ring"
										aria-label={t('searchProjectFilter')}
									>
										<option value="">{t('allProjects')}</option>
										{projectOptions.map((p) => (
											<option key={p} value={p}>
												{projectLabel(projects, p)}
											</option>
										))}
									</select>

									{/* Directory box only makes sense scoped to one project. */}
									{project && relDirs.length > 0 && (
										<div className="relative flex min-w-0 flex-1 items-center gap-1">
											<div className="relative min-w-0 flex-1">
												<input
													ref={dirInputRef}
													value={dirInput}
													onChange={(e) => commitDir(e.target.value)}
													onFocus={() => setDirFocused(true)}
													onBlur={() => setDirFocused(false)}
													onKeyDown={(e) => {
														// Enter completes the best matching folder (adds "/" if it
														// has children). preventDefault so it doesn't bubble to any
														// form submit / close the modal.
														if (e.key === 'Enter') {
															e.preventDefault()
															completeDir()
														} else if (e.key === 'Escape' && dirFocused) {
															// Let Escape dismiss the folder list first, before it
															// bubbles up and closes the whole search modal.
															e.preventDefault()
															e.stopPropagation()
															setDirFocused(false)
														}
													}}
													placeholder={t('folderPlaceholder')}
													className="w-full rounded border bg-background px-2 py-1 text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
													aria-label={t('folder')}
													autoComplete="off"
													spellCheck={false}
												/>
												{dirInput && (
													<button
														type="button"
														onClick={() => commitDir('')}
														className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
														aria-label={t('clearFolder')}
													>
														<X className="size-3" />
													</button>
												)}
												{/* Folder picker: the directories on the current level. Shows
												    while the input is focused (incl. empty → top-level folders),
												    closes on blur (click outside) or picking a leaf folder.
												    Portalled to <body> and positioned in screen space so the
												    modal's `overflow-hidden` can't clip it. */}
												{dirFocused &&
													dirHints.length > 0 &&
													dirRect &&
													createPortal(
														<ul
															className="fixed z-[220] max-h-48 overflow-y-auto rounded-md border bg-popover py-1 shadow-md"
															style={{
																top: dirRect.bottom + 4,
																left: dirRect.left,
																width: dirRect.width,
															}}
															// Keep focus in the input: stop the list's mousedown from
															// blurring it (the row handlers also preventDefault).
															onMouseDown={(e) => e.preventDefault()}
														>
															{dirHints.map((path) => {
															// Display only this level's folder name; the value is the
															// full relative path so selecting commits correctly.
															const name = path.slice(path.lastIndexOf('/') + 1)
															return (
																<li key={path}>
																	<button
																		type="button"
																		onMouseDown={(e) => {
																			// onMouseDown (not onClick) so the input's blur
																			// doesn't dismiss the list before we commit.
																			e.preventDefault()
																			// Folders with children: append "/" and KEEP the list
																			// open (now showing the children) so the user drills
																			// further. Leaf folders: final pick, so close the list.
																			// Either way keep focus on the dir box.
																			const hasChildren = relDirs.some((d) =>
																				d.startsWith(`${path}/`),
																			)
																			selectDir(path)
																			if (!hasChildren) setDirFocused(false)
																			dirInputRef.current?.focus()
																		}}
																		className="flex w-full items-center gap-1.5 truncate px-2 py-1 text-left text-foreground hover:bg-accent"
																	>
																		<Folder className="size-3.5 shrink-0 text-muted-foreground" />
																		<span className="truncate">{name}</span>
																	</button>
																</li>
															)
														})}
													</ul>,
													document.body,
												)}
											</div>
											<button
												type="button"
												onClick={() => {
													// Seed the draft with the current scope so the modal opens
													// with that folder pre-selected; OK commits, Cancel discards.
													setTreeDraft(dirRel)
													setShowTree(true)
												}}
												className={cn(
													'shrink-0 rounded border p-1 hover:bg-accent hover:text-foreground',
													showTree ? 'bg-accent text-foreground' : 'text-muted-foreground',
												)}
												aria-label={t('pickFolderFromTree')}
												aria-pressed={showTree}
												title={t('folderTree')}
											>
												<FolderTree className="size-4" />
											</button>
										</div>
									)}
								</div>
							</div>
						)}

						{/* Results */}
						<div className="min-h-0 flex-1 overflow-y-auto p-2">
							{!query.trim() ? (
								<p className="px-3 py-6 text-center text-sm text-muted-foreground">
									{ready ? t('typeToSearch') : t('loadingIndex')}
								</p>
							) : loading && results.length === 0 ? (
								<p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('searchEllipsis')}</p>
							) : results.length === 0 ? (
								<p className="px-3 py-6 text-center text-sm text-muted-foreground">
									{t('noResultsFor')} «{query.trim()}»
								</p>
							) : (
								<ul className="flex flex-col gap-1.5">
									{results.map((d) => (
										<ResultItem key={d.url} data={d} onNavigate={dismiss} />
									))}
								</ul>
							)}
						</div>

						{/* Mobile-only footer: the full-screen sheet has no backdrop to
						    tap, so give an explicit way out. Hidden from md up, where the
						    backdrop + Escape dismiss the centered card. */}
						<div className="flex justify-end border-t p-3 md:hidden">
							<button
								type="button"
								onClick={dismiss}
								className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent hover:text-foreground"
							>
								{t('close')}
							</button>
						</div>
					</div>
				</div>,
					document.body,
				)}

			{/* Folder tree picker — its own modal layered above the search modal.
			    Opened by the FolderTree button; selecting a folder commits it as
			    the scope and closes this modal (the search modal stays open). */}
			{open &&
				mounted &&
				showTree &&
				project &&
				createPortal(
					<div
						className="fixed inset-0 z-[210] bg-background/40 backdrop-blur-sm md:flex md:items-start md:justify-center md:p-4 md:pt-[12vh]"
						onMouseDown={() => setShowTree(false)}
						role="dialog"
						aria-modal="true"
						aria-label={t('folderPicker')}
					>
						<div
							className="fixed inset-0 flex flex-col overflow-hidden bg-popover md:static md:max-h-[70vh] md:w-full md:max-w-md md:rounded-lg md:border md:shadow-xl"
							onMouseDown={(e) => e.stopPropagation()}
						>
							<div className="flex items-center justify-between gap-2 border-b px-3 py-2">
								<span className="flex items-center gap-2 text-sm font-medium">
									<FolderTree className="size-4 shrink-0 text-muted-foreground" />
									{t('folderIn')} «{projectLabel(projects, project)}»
								</span>
								{/* Top-right X cancels, like the backdrop — no scope change. */}
								<button
									type="button"
									onClick={() => setShowTree(false)}
									className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
									aria-label={t('close')}
								>
									<X className="size-4" />
								</button>
							</div>
							<div className="min-h-0 flex-1 overflow-y-auto p-1">
								{dirTree.length > 0 ? (
									<ul>
										<li>
											{/* Selecting "весь проект" drafts an empty path (whole project). */}
											<button
												type="button"
												onClick={() => setTreeDraft('')}
												className={cn(
													'flex w-full items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-accent',
													!treeDraft && 'bg-accent text-foreground',
												)}
											>
												<Folder className="size-3.5 shrink-0 text-muted-foreground" />
												<span className="truncate">{projectLabel(projects, project)} ({t('wholeProject')})</span>
											</button>
										</li>
										{dirTree.map((node) => (
											<DirTreeNode
												key={node.path}
												node={node}
												depth={1}
												selected={treeDraft}
												onSelect={setTreeDraft}
											/>
										))}
									</ul>
								) : (
									<p className="px-3 py-6 text-center text-sm text-muted-foreground">
										{t('noSubfolders')}
									</p>
								)}
							</div>
							{/* Footer: Cancel discards the draft (and closes — the mobile
							    sheet's way out, since there's no backdrop to tap); OK applies
							    it to the scope. Buttons stretch full-width on mobile for easy
							    tapping, compact + right-aligned from md up. */}
							<div className="flex items-center gap-2 border-t px-3 py-2 max-md:py-3 md:justify-end">
								<button
									type="button"
									onClick={() => setShowTree(false)}
									className="flex-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-foreground max-md:py-2 md:flex-none"
								>
									{t('cancel')}
								</button>
								<button
									type="button"
									onClick={() => {
										commitDir(treeDraft)
										setShowTree(false)
										inputRef.current?.focus()
									}}
									className="flex-1 rounded-md border border-transparent bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 max-md:py-2 md:flex-none"
								>
									{t('ok')}
								</button>
							</div>
						</div>
					</div>,
					document.body,
				)}
		</>
	)
}
