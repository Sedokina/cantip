/**
 * App-side config reader (runtime).
 *
 * Reads the RESOLVED config that the build pipeline serialized to
 * `app/generated/config.json` (under the user's cwd — same contract as the doc
 * manifest in `content.server.ts`). It never imports the user's TS config, so it
 * is safe to bundle into the Remix server.
 *
 * Read is synchronous + process-cached: `getConfig()` is called in server render
 * paths (loaders, `projects.ts` helpers) where async would be awkward, and the
 * config is tiny and immutable for the process lifetime.
 */
import fs from 'node:fs'
import path from 'node:path'

import { docsConfigSchema, type DocsConfig } from './schema'
import { DEFAULT_THEME, defaultUiFor } from './defaults'

const CONFIG_PATH = path.join(process.cwd(), 'app', 'generated', 'config.json')

let cache: DocsConfig | null = null

/** A fully-defaulted empty config, used when no config.json has been generated. */
function emptyConfig(): DocsConfig {
	const parsed = docsConfigSchema.parse({})
	return {
		...parsed,
		theme: { colors: { light: { ...DEFAULT_THEME.light }, dark: { ...DEFAULT_THEME.dark } } },
		ui: { ...defaultUiFor(parsed.site.lang) },
	}
}

/** The resolved docs config for this site (process-cached). */
export function getConfig(): DocsConfig {
	if (cache) return cache
	try {
		const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
		// Already resolved + validated at generate time; re-parse defensively so a
		// hand-edited file still can't violate the schema at runtime.
		cache = docsConfigSchema.parse(JSON.parse(raw))
	} catch {
		cache = emptyConfig()
	}
	return cache
}

/** Resolved UI strings for the current site (lang-defaulted, user-overridden). */
export function getUi(): Record<string, string> {
	return getConfig().ui
}
