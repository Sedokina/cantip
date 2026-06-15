/**
 * Site-data React context — carries branding, projects, the general bucket, and
 * theme to client components.
 *
 * The data is read from disk server-side (`site.server.ts`), returned by the root
 * loader, and provided here so client components read it from context instead of
 * importing a bundled module. That's what lets the server build stay
 * client-agnostic. `root.tsx`'s default layout wraps the tree in `<SiteProvider>`;
 * a consumer composing their own root must do the same (see `cantip/root`).
 */
import { createContext, useContext, type ReactNode } from 'react'

import type { GeneratedSite } from './config/site'
import { resolveProjects, findProject, type Project } from './projects-core'

/** Everything the loader hands the client. */
export interface SiteData {
	site: GeneratedSite['site']
	projects: Project[]
	general: GeneratedSite['general']
	theme: GeneratedSite['theme']
	ui: GeneratedSite['ui']
}

const SiteContext = createContext<SiteData | null>(null)

export function SiteProvider({ value, children }: { value: SiteData; children: ReactNode }) {
	return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>
}

/** The full site data. Throws if used outside a `<SiteProvider>` (a setup bug). */
export function useSiteData(): SiteData {
	const ctx = useContext(SiteContext)
	if (!ctx) {
		throw new Error('useSiteData must be used within a <SiteProvider> (wrap your app root).')
	}
	return ctx
}

/** Site branding/meta (title, description, lang, favicon, logos, default theme). */
export function useSite(): SiteData['site'] {
	return useSiteData().site
}

/** All projects shown in the switcher (named + general bucket when enabled). */
export function useProjects(): Project[] {
	return useSiteData().projects
}

/** Look up a single project by id (incl. `general`). */
export function useProject(id: string): Project | undefined {
	return findProject(useProjects(), id)
}

/**
 * The localized-string translator. `const t = useT()` then `t('projects')`. UI
 * strings are runtime data now (they depend on `lang`), so this reads them from
 * context rather than a bundled module. Falls back to the key when a string is
 * missing, so a typo renders visibly rather than blank.
 */
export function useT(): (key: string) => string {
	const { ui } = useSiteData()
	return (key: string) => ui[key] ?? key
}

/**
 * Build the `SiteData` provider value from raw loader data. The loader already
 * resolves `projects`, but this keeps a single place to derive the context value
 * (and re-resolve if a consumer passes only the raw `GeneratedSite`).
 */
export function siteDataFromLoader(data: {
	site: GeneratedSite['site']
	projects?: Project[]
	general: GeneratedSite['general']
	theme: GeneratedSite['theme']
	ui: GeneratedSite['ui']
}): SiteData {
	return {
		site: data.site,
		projects: data.projects ?? resolveProjects(data as unknown as GeneratedSite),
		general: data.general,
		theme: data.theme,
		ui: data.ui,
	}
}
