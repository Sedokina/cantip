import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from 'react'

/**
 * Editor-style tabs (VS Code feel) layered over Remix navigation. The URL stays
 * the source of truth for which doc is shown (route `$.tsx` renders it); this
 * context only tracks the *list* of open tabs and which actions add/remove them.
 *
 * Tabs are client-only state, persisted to localStorage **scoped per project**
 * (key `tabs:<projectId>`). The provider is mounted in `root.tsx` above the
 * `<Outlet/>` so both the sidebar (which opens tabs) and the `TabBar` (which
 * renders them) can read/update the same list.
 */

export interface Tab {
	/** Doc href, e.g. "/krista/глоссарий/коллекция/" — also the navigation target. */
	path: string
	/** Display label (the sidebar item name). */
	title: string
}

interface TabsContextValue {
	tabs: Tab[]
	/** Add a tab (de-duped by normalised path). No-op if already open. */
	openTab: (path: string, title: string) => void
	/** Remove a tab by path. Returns the neighbor to activate, or null if none/irrelevant. */
	closeTab: (path: string) => void
	/** Close every open tab. */
	closeAll: () => void
	/** Whether any tabs are open — drives the sidebar single-click rule + bar visibility. */
	hasTabs: boolean
}

const TabsContext = createContext<TabsContextValue | null>(null)

/** Normalise a path for comparison/de-dupe: decoded, no trailing slash. Mirrors Sidebar.normPath. */
export function normTabPath(p?: string): string {
	if (!p) return ''
	try {
		return decodeURIComponent(p).replace(/\/+$/, '')
	} catch {
		return p.replace(/\/+$/, '')
	}
}

const storageKey = (projectId: string) => `tabs:${projectId}`

export function TabsProvider({
	projectId,
	children,
}: {
	/** Active project, or null on pages with no project (e.g. `/`). */
	projectId: string | null
	children: React.ReactNode
}) {
	// Start empty so SSR and the first client render match; load from
	// localStorage after mount (same hydration-safe pattern as the sidebar tree).
	const [tabs, setTabs] = useState<Tab[]>([])
	const [loaded, setLoaded] = useState(false)

	// Load this project's tabs whenever the active project changes. With no active
	// project (e.g. `/`) there are no tabs — keep the list empty and skip storage.
	useEffect(() => {
		if (!projectId) {
			setTabs([])
			setLoaded(false)
			return
		}
		setLoaded(false)
		try {
			const raw = localStorage.getItem(storageKey(projectId))
			const parsed = raw ? (JSON.parse(raw) as Tab[]) : []
			setTabs(
				Array.isArray(parsed)
					? parsed.filter((t) => t && typeof t.path === 'string' && typeof t.title === 'string')
					: [],
			)
		} catch {
			setTabs([])
		}
		setLoaded(true)
	}, [projectId])

	// Persist on change (only after the initial load, so we don't clobber stored
	// tabs with the empty initial state before the load effect has run).
	useEffect(() => {
		if (!loaded || !projectId) return
		try {
			localStorage.setItem(storageKey(projectId), JSON.stringify(tabs))
		} catch {
			/* ignore quota/availability errors */
		}
	}, [tabs, projectId, loaded])

	const openTab = useCallback((path: string, title: string) => {
		setTabs((prev) => {
			const norm = normTabPath(path)
			if (prev.some((t) => normTabPath(t.path) === norm)) return prev
			return [...prev, { path, title }]
		})
	}, [])

	const closeTab = useCallback((path: string) => {
		const norm = normTabPath(path)
		setTabs((prev) => prev.filter((t) => normTabPath(t.path) !== norm))
	}, [])

	const closeAll = useCallback(() => setTabs([]), [])

	const value = useMemo<TabsContextValue>(
		() => ({ tabs, openTab, closeTab, closeAll, hasTabs: tabs.length > 0 }),
		[tabs, openTab, closeTab, closeAll],
	)

	return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>
}

export function useTabs(): TabsContextValue {
	const ctx = useContext(TabsContext)
	if (!ctx) throw new Error('useTabs must be used within a TabsProvider')
	return ctx
}
