/**
 * The client-safe site shape.
 *
 * The build pipeline emits `app/generated/site.ts` (a plain-literal module)
 * conforming to `GeneratedSite`. Unlike `config.json` (read via `fs` in
 * `.server` code), this module is IMPORTED, so Vite bundles it into BOTH the
 * client and server bundles — letting client components (`ProjectSwitcher`,
 * `_index`, `Search`, `MobileProjectsPanel`) read projects/branding/ui strings
 * synchronously with no runtime file access.
 *
 * It intentionally carries only the serializable, non-sensitive subset of the
 * config (no theme CSS, no markdown plugins). The seed file shipped in the repo
 * is overwritten on every `generate`.
 */

export interface SiteProject {
	id: string
	name: string
	logo: string
	/** Landing URL; resolved to the project's first doc at generate time when unset. */
	landing: string
	description: string
}

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
	}
	ui: Record<string, string>
}
