/**
 * `t(key)` — localized UI strings.
 *
 * UI strings are translations keyed by `lang` (engine data, not per-client
 * visuals), so they're emitted as a BUNDLED module (`~/generated/ui`) and read
 * synchronously here — isomorphic, no runtime file access. Per-client branding,
 * projects, and theme moved to runtime data (see `site.server.ts` / the
 * `SiteProvider` context in `site-context.tsx`); page titles moved to `meta.ts`.
 */
import { UI } from '~/generated/ui'

/**
 * A localized UI string by key (see `app/lib/config/defaults.ts` for the
 * catalogue). Falls back to the key itself if missing, so a typo is visible
 * rather than rendering blank.
 */
export function t(key: string): string {
	return UI.ui[key] ?? key
}
