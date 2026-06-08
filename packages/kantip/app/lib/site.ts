/**
 * Isomorphic accessors for site branding + UI strings.
 *
 * Thin ergonomic layer over the generated `~/generated/site` module (plain
 * literals bundled by Vite, safe on client + server). Components import `site`
 * for branding (title, logos, favicon) and `t(key)` for localized UI strings
 * instead of reaching into the generated shape directly — so the generated
 * contract can evolve without touching call sites.
 */
import { SITE } from '~/generated/site'

/** Site branding/meta (title, description, lang, favicon, logos, default theme). */
export const site = SITE.site

/**
 * A localized UI string by key (see `app/lib/config/defaults.ts` for the
 * catalogue). Falls back to the key itself if missing, so a typo is visible
 * rather than rendering blank.
 */
export function t(key: string): string {
	return SITE.ui[key] ?? key
}

/** The page `<title>` for a doc: `"<docTitle> — <siteTitle>"`, or just the site title. */
export function pageTitle(docTitle?: string | null): string {
	return docTitle ? `${docTitle} — ${site.title}` : site.title
}
