/**
 * `cantip/components` — the React components, for consumers who want to compose
 * their own layouts/routes instead of using the default `cantip/root` layout.
 *
 * These are the same components the default layout uses. They assume a Remix
 * context (some use `Link`/`useNavigate`/`useLocation` from `@remix-run/react`,
 * resolved from the consumer's peer dep) and the generated artifacts (resolved
 * via the `~/generated/*` Vite alias the `cantip()` plugin registers).
 */
export { default as Sidebar, sidebarWidthInitScript } from './Sidebar'
export { default as TopBar } from './TopBar'
export { default as Toc } from './Toc'
export { default as TabBar } from './TabBar'
export { default as ProjectSwitcher } from './ProjectSwitcher'
export { default as MobileBottomBar } from './MobileBottomBar'
export { default as MobileProjectsPanel } from './MobileProjectsPanel'
export { default as PageFloatingMenu } from './PageFloatingMenu'
export { default as CanvasMount } from './CanvasMount'
export { Search } from './Search'
export { ThemeToggle, buildThemeInitScript } from './theme-toggle'
export { ShortcutsHelp, openShortcutsHelp } from './ShortcutsHelp'
export { CodeWrapToggle } from './CodeWrapToggle'
export { default as FindOnPage } from './FindOnPage'
