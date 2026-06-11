/**
 * Runtime content API — now a thin wrapper over `loader()` (cantip/source) fed by
 * the generated `~/generated/content` module.
 *
 * Previously this read JSON manifests from `process.cwd()/app/generated` via fs;
 * now the generator emits ONE importable `content.ts` (a `{ files, permalinks }`
 * Source), Vite resolves it through the `~/generated` alias, and `loader()` builds
 * the lookups in memory. No fs, no cwd fragility, fully typed. The exported
 * signatures are unchanged so route loaders keep working.
 */
import { loader, type LoaderOutput } from 'cantip/source'
import { getProjectIdForDoc } from './projects'
import { site } from './site'
import { source } from '~/generated/content'

export type { Heading, PageData } from 'cantip/source'

/** The shape route loaders return for a single doc. */
export interface Doc {
	id: string
	frontmatter: Record<string, unknown>
	headings: import('cantip/source').Heading[]
	html: string
}

// Build the loader once per process. Project scoping uses the same rule as the
// sidebar/projects layer (first id segment, with the general bucket folded in).
let _loader: LoaderOutput | null = null
function L(): LoaderOutput {
	if (!_loader) {
		_loader = loader({ source, lang: site.lang, projectOf: getProjectIdForDoc })
	}
	return _loader
}

/** The doc id a permalink points at, or null. */
export async function resolvePermalink(pathSlug: string): Promise<string | null> {
	return L().resolvePermalink(pathSlug)
}

/** The canonical permalink for a doc id, or null. */
export async function getPermalinkForId(id: string): Promise<string | null> {
	return L().getPermalinkForId(id)
}

/** Canonical URL for an id: its permalink URL when set, else `/{id}/`. */
export async function getCanonicalUrl(id: string): Promise<string> {
	return L().getCanonicalUrl(id)
}

/** Load a single compiled doc by its route id, or null. */
export async function getDoc(id: string): Promise<Doc | null> {
	const safe = id
		.split('/')
		.filter((s) => s && s !== '.' && s !== '..')
		.join('/')
	if (!safe) return null
	const page = L().getPage(safe)
	if (!page) return null
	return { id: page.id, frontmatter: page.data.frontmatter, headings: page.data.headings, html: page.data.html }
}

/** The loaded content API (used by the sidebar builder). */
export function content(): LoaderOutput {
	return L()
}
