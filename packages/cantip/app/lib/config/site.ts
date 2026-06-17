/**
 * The generated site shapes — split into a RUNTIME-read part and a BUNDLED part.
 *
 * `GeneratedSite` (branding, projects, general, theme) is emitted as
 * `app/generated/site.json` and read via `fs` at runtime in `app/lib/site.server.ts`
 * (the same pattern as `content.json`). Keeping it OUT of the bundle makes the
 * Remix server build client-agnostic: the build can run once (e.g. in a Docker
 * image) and serve any client's branding/theme, and branding/theme can change
 * without rebuilding — only `site.json` is regenerated.
 *
 * `GeneratedUi` (localized UI strings) is emitted as `app/generated/ui.ts`, a
 * plain-literal module that IS imported (so Vite bundles it client + server),
 * which keeps `t()` synchronous + isomorphic. UI strings are translations keyed by
 * `lang` (engine data), not per-client visuals, so bundling them is fine.
 *
 * The seed files shipped in the repo are overwritten on every `generate`.
 */

export interface SiteProject {
	id: string
	name: string
	logo: string
	/** Landing URL; resolved to the project's first doc at generate time when unset. */
	landing: string
	description: string
	/** "Edit this page" URL template (`{path}` → source-relative file path), or omitted. */
	editUrl?: string
}

/** Resolved theme color token maps (CSS custom-property name → value). */
export interface ThemeColors {
	light: Record<string, string>
	dark: Record<string, string>
}

/** Runtime-read site data (`app/generated/site.json`) — everything per-client. */
export interface GeneratedSite {
	site: {
		title: string
		description: string
		lang: string
		favicon: string
		logo: { light: string; dark: string }
		defaultTheme: 'dark' | 'light'
	}
	projects: SiteProject[]
	general: {
		enabled: boolean
		id: string
		name: string
		logo: string
		description: string
		/** Where the general card / switcher navigates — its first doc, else `/`. */
		landing: string
		/** "Edit this page" URL template (`{path}` → source-relative file path), or omitted. */
		editUrl?: string
	}
	/** Theme color tokens, rendered into an inline `:root`/`.dark` style at runtime. */
	theme: ThemeColors
	/**
	 * Localized UI strings (`defaultUiFor(lang)` + overrides). Read at runtime, not
	 * bundled — they depend on `lang`, which the build doesn't know. Consumed via
	 * the `useT()` hook (client) / the `SiteProvider` context.
	 */
	ui: Record<string, string>
}
