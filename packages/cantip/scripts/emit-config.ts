/**
 * Serialize the resolved config for the running app.
 *
 * Emits two artifacts under the manifest dir (`app/generated`):
 * - `site.json` — branding, projects, general, theme. Read via `fs` at runtime in
 *   `app/lib/site.server.ts` (NOT imported), so it stays out of the bundle and the
 *   Remix build is client-agnostic. Theme tokens travel here too and are injected
 *   as an inline `<style>` at runtime (no more `theme.generated.css` asset).
 * - `ui.ts` — a plain-literal module of localized UI strings, IMPORTED so Vite
 *   bundles it client + server (keeps `t()` synchronous + isomorphic). UI strings
 *   are translations keyed by `lang` (engine data), so bundling is fine.
 *
 * Per-project `landing` is defaulted here (not in `loadConfig`) because it needs
 * the compiled doc index: when a project doesn't pin a landing URL, we use the
 * first doc under that project as its landing page.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

import type { DocsConfig } from '../app/lib/config/schema.ts'
import type { GeneratedSite, SiteProject } from '../app/lib/config/site.ts'

// Mirrors `GENERAL_PROJECT_ID` in app/lib/projects-core.ts. Inlined (not imported)
// so this build script never pulls in an app module that imports a Vite-only
// `~/generated/*` alias (unresolvable under the plain-Node runner).
const GENERAL_PROJECT_ID = 'general'

interface IndexEntry {
	id: string
}

interface EmitArgs {
	config: DocsConfig
	manifestDir: string
	/** The doc index (already sorted), used to derive default landing URLs. */
	index: IndexEntry[]
	logger: { info(m: string): void }
}

/** First doc id whose project (first segment) is `projectId`, or null. */
function firstDocOfProject(index: IndexEntry[], projectId: string): string | null {
	for (const e of index) {
		if ((e.id.split('/')[0] ?? '') === projectId) return e.id
	}
	return null
}

/** First doc id that belongs to no known project (the general bucket), or null. */
function firstGeneralDoc(index: IndexEntry[], projectIds: Set<string>): string | null {
	for (const e of index) {
		if (!projectIds.has(e.id.split('/')[0] ?? '')) return e.id
	}
	return null
}

export async function emitGeneratedConfig({ config, manifestDir, index, logger }: EmitArgs): Promise<void> {
	const projectIds = new Set(config.projects.map((p) => p.id))

	// Resolve each project's landing URL: the authored value, else its first doc.
	const projects: SiteProject[] = config.projects.map((p) => {
		const first = firstDocOfProject(index, p.id)
		const landing = p.landing ?? (first ? `/${first}/` : '/')
		return {
			id: p.id,
			name: p.name,
			logo: p.logo ?? `/projects/${p.id}.svg`,
			landing,
			description: p.description,
		}
	})

	const firstGeneral = firstGeneralDoc(index, projectIds)
	const generalHasDocs = config.general.enabled && firstGeneral !== null
	const site: GeneratedSite = {
		site: {
			title: config.site.title,
			description: config.site.description,
			lang: config.site.lang,
			favicon: config.site.favicon,
			logo: config.site.logo,
			defaultTheme: config.site.defaultTheme,
		},
		projects,
		general: {
			enabled: generalHasDocs,
			id: GENERAL_PROJECT_ID,
			name: config.general.name,
			logo: config.general.logo,
			description: config.general.description,
			// Land on the bucket's first doc (same default rule as named projects);
			// `/` when it somehow has none, so the card is never a dead end.
			landing: firstGeneral ? `/${firstGeneral}/` : '/',
		},
		// Theme tokens (defaults already merged with the user's overrides). Travels
		// in site.json and is rendered into an inline :root/.dark <style> at runtime
		// (see app/lib/theme-css.ts + root.tsx), ordered after tailwind.css so it wins.
		theme: config.theme.colors,
		// UI strings (translations: `defaultUiFor(lang)` merged with the user's
		// overrides). These depend on `lang`, which isn't known until runtime, so
		// they MUST travel in site.json (read at runtime) — NOT a bundled module, or
		// the build would bake in the seed language regardless of the client's lang.
		ui: config.ui,
	}

	// Runtime-read site data — NOT imported, so it's not bundled. Pretty-printed so
	// a human can diff it. Carries everything per-client incl. ui translations.
	await fs.writeFile(path.join(manifestDir, 'site.json'), JSON.stringify(site, null, '\t'))

	logger.info(`Emitted site.json (${projects.length} project(s)${generalHasDocs ? ' + general' : ''}).`)
}
