/**
 * Title helpers for route `meta()` functions.
 *
 * The site title is per-client runtime data (from the root loader), not a bundled
 * constant. `meta()` can't call `useLoaderData`, but it receives the route
 * `matches`, so it can read the root route's loader data. These helpers pull the
 * site title from there and format page titles — replacing the old bundled
 * `pageTitle()` in `~/lib/site`.
 */

/** Minimal shape of a route match carrying the root loader's `site`. */
interface RootMatch {
	id: string
	data?: unknown
}

/** The site title from the root route's loader data, or '' if unavailable. */
export function siteTitleFromMatches(matches: ReadonlyArray<RootMatch>): string {
	const root = matches.find((m) => m.id === 'root')
	const data = root?.data as { site?: { title?: string } } | undefined
	return data?.site?.title ?? ''
}

/**
 * A doc page `<title>`: `"<docTitle> — <siteTitle>"`, or just the site title when
 * there's no doc title. Mirrors the old `pageTitle()` but sources the site title
 * from route matches.
 */
export function pageTitleFromMatches(
	matches: ReadonlyArray<RootMatch>,
	docTitle?: string | null,
): string {
	const siteTitle = siteTitleFromMatches(matches)
	return docTitle ? `${docTitle} — ${siteTitle}` : siteTitle
}
