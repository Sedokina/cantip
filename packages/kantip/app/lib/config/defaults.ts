/**
 * Shipped defaults: theme tokens + per-locale UI strings.
 *
 * These reproduce this project's ORIGINAL hardcoded values, so a config that
 * omits `theme`/`ui` (or omits individual keys) renders byte-for-byte as before.
 * `loadConfig` merges authored values over these.
 *
 * UI strings are keyed by `site.lang`. Only the chrome strings users typically
 * want to rebrand are externalized here; the keyboard-shortcut cheatsheet labels
 * (`useKeyboardShortcuts.ts`) remain in code as an advanced concern.
 */

/** Default OKLCH theme tokens — mirror of `app/styles/tailwind.css` :root/.dark. */
export const DEFAULT_THEME = {
	light: {
		'--brand': 'oklch(0.42 0.158 286)',
		'--background': 'oklch(1 0 0)',
		'--foreground': 'oklch(0.145 0 0)',
		'--card': 'oklch(1 0 0)',
		'--card-foreground': 'oklch(0.145 0 0)',
		'--popover': 'oklch(1 0 0)',
		'--popover-foreground': 'oklch(0.145 0 0)',
		'--primary': 'var(--brand)',
		'--primary-foreground': 'oklch(0.985 0 0)',
		'--secondary': 'oklch(0.97 0 0)',
		'--secondary-foreground': 'oklch(0.205 0 0)',
		'--muted': 'oklch(0.97 0 0)',
		'--muted-foreground': 'oklch(0.556 0 0)',
		'--accent': 'oklch(0.97 0 0)',
		'--accent-foreground': 'oklch(0.205 0 0)',
		'--destructive': 'oklch(0.577 0.245 27.325)',
		'--border': 'oklch(0.922 0 0)',
		'--input': 'oklch(0.922 0 0)',
		'--ring': 'oklch(0.708 0 0)',
		'--sidebar': 'oklch(0.985 0 0)',
		'--sidebar-foreground': 'oklch(0.145 0 0)',
		'--sidebar-primary': 'oklch(0.205 0 0)',
		'--sidebar-primary-foreground': 'oklch(0.985 0 0)',
		'--sidebar-accent': 'oklch(0.97 0 0)',
		'--sidebar-accent-foreground': 'oklch(0.205 0 0)',
		'--sidebar-border': 'oklch(0.922 0 0)',
		'--sidebar-ring': 'oklch(0.708 0 0)',
	} as Record<string, string>,
	dark: {
		'--brand': 'oklch(0.68 0.14 286)',
		'--background': 'oklch(0.145 0 0)',
		'--foreground': 'oklch(0.985 0 0)',
		'--card': 'oklch(0.205 0 0)',
		'--card-foreground': 'oklch(0.985 0 0)',
		'--popover': 'oklch(0.205 0 0)',
		'--popover-foreground': 'oklch(0.985 0 0)',
		'--primary': 'var(--brand)',
		'--primary-foreground': 'oklch(0.205 0 0)',
		'--secondary': 'oklch(0.269 0 0)',
		'--secondary-foreground': 'oklch(0.985 0 0)',
		'--muted': 'oklch(0.269 0 0)',
		'--muted-foreground': 'oklch(0.708 0 0)',
		'--accent': 'oklch(0.269 0 0)',
		'--accent-foreground': 'oklch(0.985 0 0)',
		'--destructive': 'oklch(0.704 0.191 22.216)',
		'--border': 'oklch(1 0 0 / 10%)',
		'--input': 'oklch(1 0 0 / 15%)',
		'--ring': 'oklch(0.556 0 0)',
		'--sidebar': 'oklch(0.205 0 0)',
		'--sidebar-foreground': 'oklch(0.985 0 0)',
		'--sidebar-primary': 'oklch(0.488 0.243 264.376)',
		'--sidebar-primary-foreground': 'oklch(0.985 0 0)',
		'--sidebar-accent': 'oklch(0.269 0 0)',
		'--sidebar-accent-foreground': 'oklch(0.985 0 0)',
		'--sidebar-border': 'oklch(1 0 0 / 10%)',
		'--sidebar-ring': 'oklch(0.556 0 0)',
	} as Record<string, string>,
}

/**
 * The UI string catalogue. Keys are stable identifiers used in components via
 * `getUi(config)`; values are the originals (ru). `en` is a best-effort fallback
 * for non-ru sites so an unset `ui` doesn't render Russian on an English site.
 */
export const UI_STRINGS: Record<string, Record<string, string>> = {
	ru: {
		projects: 'Проекты',
		selectProject: 'Выберите проект',
		noProject: 'Без проекта',
		onThisPage: 'На этой странице',
		properties: 'Свойства',
		shortcuts: 'Горячие клавиши',
		searchProjectFilter: 'Проект',
		close: 'Закрыть',
		closePanel: 'Закрыть панель',
		closeSearch: 'Закрыть поиск',
		closeTab: 'Закрыть вкладку',
		home: 'Главная',
		files: 'Файлы',
		search: 'Поиск',
		toggleTheme: 'Переключить тему',
	},
	en: {
		projects: 'Projects',
		selectProject: 'Select a project',
		noProject: 'No project',
		onThisPage: 'On this page',
		properties: 'Properties',
		shortcuts: 'Keyboard shortcuts',
		searchProjectFilter: 'Project',
		close: 'Close',
		closePanel: 'Close panel',
		closeSearch: 'Close search',
		closeTab: 'Close tab',
		home: 'Home',
		files: 'Files',
		search: 'Search',
		toggleTheme: 'Toggle theme',
	},
}

/** UI strings for a language, falling back to `en` then `ru`. */
export function defaultUiFor(lang: string): Record<string, string> {
	return UI_STRINGS[lang] ?? UI_STRINGS.en ?? UI_STRINGS.ru
}
