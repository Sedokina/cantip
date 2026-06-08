/**
 * Build-side config loader (Node only — imports the user's TS config).
 *
 * Runs from the build pipeline (`scripts/*`), which executes under
 * `node --experimental-strip-types`, so it can `import()` the user's
 * `docs.config.ts` directly. It validates against `docsConfigSchema`, merges the
 * shipped theme/ui defaults, fills per-project derived defaults (logo, landing),
 * and returns a fully-resolved `DocsConfig`.
 *
 * The running APP must NOT call this (Vite can't bundle the user's cwd TS file);
 * the generator serializes the resolved config to `app/generated/config.json`,
 * and the app reads that JSON at runtime via `config.server.ts`. This module is
 * the single place the TS config is ever imported.
 */
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

import { docsConfigSchema, type DocsConfig } from './schema.ts'
import { DEFAULT_THEME, defaultUiFor } from './defaults.ts'

/** Candidate config filenames, in resolution order, relative to cwd. */
const CONFIG_NAMES = ['docs.config.ts', 'docs.config.js', 'docs.config.mjs']

/** Locate the user's config file in `cwd`, or null when none exists. */
function findConfigFile(cwd: string): string | null {
	for (const name of CONFIG_NAMES) {
		const p = path.join(cwd, name)
		if (fs.existsSync(p)) return p
	}
	return null
}

/**
 * Load + validate + fully resolve the docs config from `cwd` (defaults to
 * `process.cwd()`). With no config file, returns an all-defaults config so the
 * engine still runs (empty site, no projects) rather than throwing.
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<DocsConfig> {
	const file = findConfigFile(cwd)
	let authored: unknown = {}
	if (file) {
		// Cache-bust with the file mtime so repeated loads in one watch session
		// pick up edits (import() caches by URL otherwise).
		const mtime = fs.statSync(file).mtimeMs
		const mod = await import(`${pathToFileURL(file).href}?t=${mtime}`)
		authored = mod.default ?? mod.config ?? mod
	}

	const parsed = docsConfigSchema.safeParse(authored)
	if (!parsed.success) {
		throw new Error(
			`Invalid docs.config:\n\n${JSON.stringify(parsed.error.format(), null, 2)}`,
		)
	}
	return resolveDerived(parsed.data)
}

/**
 * Fill values that depend on other fields and merge shipped defaults:
 * - per-project `logo` → `/projects/<id>.svg`, `landing` → first-doc URL (left
 *   null here; the app derives it from the manifest when unset),
 * - theme colors merged OVER `DEFAULT_THEME`,
 * - `ui` merged OVER the per-`lang` default strings.
 */
function resolveDerived(config: DocsConfig): DocsConfig {
	const projects = config.projects.map((p) => ({
		...p,
		logo: p.logo ?? `/projects/${p.id}.svg`,
	}))

	const theme = {
		colors: {
			light: { ...DEFAULT_THEME.light, ...config.theme.colors.light },
			dark: { ...DEFAULT_THEME.dark, ...config.theme.colors.dark },
		},
	}

	const ui = { ...defaultUiFor(config.site.lang), ...config.ui }

	return { ...config, projects, theme, ui }
}
