import {
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useLoaderData,
	useLocation,
	useMatches,
} from '@remix-run/react'
import { useEffect, useState } from 'react'
import type { LinksFunction, SerializeFrom } from '@remix-run/node'

import type { loader } from './root.server'
import Sidebar from '~/components/Sidebar'
import { CantipProvider, useComponent } from '~/lib/components'
import { SiteProvider } from '~/lib/site-context'
import { renderThemeCss } from '~/lib/theme-css'
import TabBar from '~/components/TabBar'
import MobileBottomBar from '~/components/MobileBottomBar'
import MobileProjectsPanel from '~/components/MobileProjectsPanel'
import { ShortcutsHelp } from '~/components/ShortcutsHelp'
import { Toaster } from '~/components/Toast'
import { TabsProvider } from '~/lib/tabs'
import { cn } from '~/lib/utils'
import { buildThemeInitScript } from '~/components/theme-toggle'
import { sidebarWidthInitScript } from '~/components/Sidebar'

import tailwindStyles from '~/styles/tailwind.css?url'
import appStyles from '~/styles/app.css?url'
import katexStyles from 'katex/dist/katex.min.css?url'

// NOTE: branding (favicon) + theme are NOT in links() — that function has no
// loader access, and they're per-client runtime data now. The favicon <link> and
// the theme <style> are rendered inside Layout from loader data instead. The theme
// <style> is emitted AFTER <Links/> so its :root/.dark tokens win over tailwind.css.
export const links: LinksFunction = () => [
	{ rel: 'stylesheet', href: tailwindStyles },
	{ rel: 'stylesheet', href: appStyles },
	{ rel: 'stylesheet', href: katexStyles },
]

// NOTE: the root `loader` is NOT exported here — it lives in `./root.server`
// (exported as `cantip/root.server`). A consumer's `app/root.tsx` imports the
// loader from there and the component/links from here, so this module stays free
// of server-only imports and bundles cleanly into the client.

/**
 * The cantip layout (header, sidebar, tabs, content outlet). Reads component
 * overrides from `CantipProvider` context via `useComponent`. Exported so a
 * consumer can compose it with their own provider/overrides:
 *
 *   // app/root.tsx
 *   import { Layout, CantipProvider } from 'cantip/root'
 *   export function App() {
 *     return <CantipProvider components={{ TopBar: MyTopBar }}><Layout/></CantipProvider>
 *   }
 *   export default App
 *
 * The default export below wraps Layout in an empty provider, so the zero-config
 * `export { default } from 'cantip/root'` still works.
 */
/** Route `handle` fields the layout reads. */
interface LayoutHandle {
	/** Render the route without the sidebar, top bar and tabs. */
	bare?: boolean
	/** Ignore the reader's theme choice and render in this theme. */
	theme?: 'light'
}

export function Layout() {
	const { sidebar, projectId, spansToc, site, projects, general, theme, ui } =
		useLoaderData<typeof loader>()
	const handles = useMatches().map((m) => m.handle as LayoutHandle | undefined)
	const bare = handles.some((h) => h?.bare)
	const lightOnly = handles.some((h) => h?.theme === 'light')

	return (
		<SiteProvider value={{ site, projects, general, theme, ui }}>
			<html lang={site.lang} className={lightOnly || site.defaultTheme === 'light' ? undefined : 'dark'}>
				<head>
					<meta charSet="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					<Meta />
					<Links />
					{/* Per-client branding/theme, rendered from loader data (runtime, not
					    bundled). The theme <style> comes AFTER <Links/> so its :root/.dark
					    tokens override tailwind.css; SSR'd in <head> → present on first paint,
					    no flash. The favicon <link> moves here for the same reason. */}
					<link rel="icon" type="image/svg+xml" href={site.favicon} />
					<style dangerouslySetInnerHTML={{ __html: renderThemeCss(theme) }} />
					{/* Set the theme class before paint to avoid a flash of the wrong theme.
					    The init script needs site.defaultTheme (loader data), so it's built
					    here rather than as a module-level constant. */}
					{!lightOnly && (
						<script
							dangerouslySetInnerHTML={{ __html: buildThemeInitScript(site.defaultTheme) }}
						/>
					)}
					{/* Apply the persisted sidebar width before paint to avoid a layout shift. */}
					{!bare && <script dangerouslySetInnerHTML={{ __html: sidebarWidthInitScript }} />}
				</head>
				<body>
				{bare ? <Outlet /> : <SiteChrome sidebar={sidebar} projectId={projectId} spansToc={spansToc} />}

				<ScrollRestoration />
				<Scripts />
			</body>
			</html>
		</SiteProvider>
	)
}

type RootData = SerializeFrom<typeof loader>

/** The site's top bar, sidebar, tabs and mobile bars around the route's content. */
function SiteChrome({
	sidebar,
	projectId,
	spansToc,
}: Pick<RootData, 'sidebar' | 'projectId' | 'spansToc'>) {
	const TopBar = useComponent('TopBar')
	const location = useLocation()
	const [menuOpen, setMenuOpen] = useState(false)
	const [projectsOpen, setProjectsOpen] = useState(false)

	// Close any open mobile overlay whenever navigation happens (link/row click).
	useEffect(() => {
		setMenuOpen(false)
		setProjectsOpen(false)
	}, [location.pathname])

	return (
		<>
			<TabsProvider projectId={projectId}>
				{/* Desktop top bar with theme toggle: in-flow at the top (takes layout
				    space), floats and hides on scroll-down / shows on scroll-up. */}
				<TopBar projectId={projectId} />

				{/* Two-row grid: row 1 holds the tab bar (over the content columns only),
				    row 2 holds the doc content + TOC. The sidebar spans both rows so it
				    stays full-height. When no tabs are open the TabBar renders nothing, so
				    its 0-height row collapses and the layout matches the no-tabs case.
				    With no active project (e.g. `/`) there's no sidebar, so the leading
				    sidebar column is dropped and content starts at the first column. */}
				<div
					className={cn(
						// min-height fills the viewport so short pages don't leave a gap, but
						// on desktop the in-flow TopBar (h-11 = 2.75rem) sits ABOVE this grid,
						// so a full 100dvh here would overflow by exactly the bar — a small
						// scroll on every page. Subtract the bar at md+ (it's hidden on mobile).
						'grid min-h-[100dvh] grid-cols-1 grid-rows-[auto_minmax(0,1fr)] md:min-h-[calc(100dvh-2.75rem)]',
						// No sidebar (e.g. `/`): a single full-width content column, no
						// reserved TOC column — the page has no TOC, so leaving that column
						// in place would push the centered content left of true center.
						sidebar
							? 'md:grid-cols-[var(--sidebar-width)_minmax(0,1fr)] xl:grid-cols-[var(--sidebar-width)_minmax(0,1fr)_var(--toc-width,250px)]'
							: 'md:grid-cols-[minmax(0,1fr)]',
					)}
				>
					{/* key on projectId: the headless-tree instance caches expanded/registered
					    items and won't re-sync to a new `data` map on its own, so switching
					    projects would leave the tree showing stale state. Remounting on
					    project change rebuilds it cleanly with the new data + initial expand. */}
					{sidebar && (
						<Sidebar
							key={projectId}
							data={sidebar}
							currentPath={location.pathname}
							open={menuOpen}
							className="md:col-start-1 md:row-span-2 md:row-start-1"
						/>
					)}
					{/* Tab strip: row 1, content column only (col-start-2) — not over the
					    sidebar (col 1) nor the TOC (col 3 at xl). The grid CELL is the
					    sticky element (top-11, just below the TopBar): a sticky grid item's
					    travel range is the whole grid container's box (tall), not its own
					    row — so it stays pinned while content scrolls. Making the inner
					    strip sticky instead would fail, since its parent cell is only as
					    tall as the strip.
					    On a canvas or image page the content <main> spans the content + TOC columns
					    (xl:col-span-2) and there's no on-page TOC, so the strip spans them
					    too — otherwise it would stop at the col-2/col-3 boundary, short of
					    the full-width content below it. */}
					<div
						className={cn(
							'sticky top-11 z-40 md:row-start-1',
							sidebar ? 'md:col-start-2' : 'md:col-start-1',
							spansToc && 'xl:col-span-2',
						)}
					>
						<TabBar />
					</div>
					{/* Content lands in row 2, right of the sidebar. The route ($.tsx) emits
					    <main> + <Toc> as two cells; pinning the wrapper here keeps them in the
					    content/TOC columns of row 2 regardless of grid auto-placement order. */}
					<div className="contents md:[&>*]:row-start-2">
						<Outlet />
					</div>
				</div>
			</TabsProvider>

			{/* Fullscreen mobile project switcher (also houses the theme toggle).
			    Rendered before the bar so the floating bar stacks above it and its
			    Projects tab stays tappable to toggle the panel shut. */}
			<MobileProjectsPanel
				activeId={projectId}
				open={projectsOpen}
				onClose={() => setProjectsOpen(false)}
			/>

			{/* Mobile-only floating bottom navigation: Home · Проекты · Файлы
			    (sidebar) · Поиск. No top navbar on mobile. The Files tab is
			    disabled with no active project (e.g. `/`), where there's no tree. */}
			<MobileBottomBar
				dirsOpen={menuOpen}
				projectsOpen={projectsOpen}
				filesEnabled={!!projectId}
				onToggleDirs={() => {
					setMenuOpen((o) => !o)
					setProjectsOpen(false)
				}}
				onToggleProjects={() => {
					setProjectsOpen((o) => !o)
					setMenuOpen(false)
				}}
			/>

			{/* `?` cheatsheet for all keyboard shortcuts (single source: ALL_SHORTCUTS).
			    Owns its own open/close; renders nothing until triggered. */}
			<ShortcutsHelp />
			<Toaster />
		</>
	)
}

// Re-export the providers so a consumer composing their own app/root.tsx can wrap
// the tree themselves. A custom root MUST include <SiteProvider value={…}> fed from
// the root loader data, or client components reading site/projects will throw.
export { CantipProvider } from '~/lib/components'
export { SiteProvider } from '~/lib/site-context'

/**
 * Default root: the layout wrapped in an empty provider (no overrides). Lets the
 * zero-config consumer do `export { default } from 'cantip/root'`. To add
 * overrides, compose `<CantipProvider components={…}><Layout/></CantipProvider>`
 * in your own app/root.tsx instead of using this default.
 */
export default function Root() {
	return (
		<CantipProvider>
			<Layout />
		</CantipProvider>
	)
}
