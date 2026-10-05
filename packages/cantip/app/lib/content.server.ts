/**
 * Runtime content API — a thin wrapper over `loader()` (cantip/source) fed by the
 * generated content Source.
 *
 * The generator emits `app/generated/content.json` (a serialized `{ files,
 * permalinks }` Source) and this module reads it via `fs` at runtime, rather than
 * importing a bundled `content.ts`. That deliberately keeps the compiled content
 * OUT of the app's server bundle: the Remix build is content-agnostic (build once,
 * point at any content), and content can be regenerated/swapped without rebuilding
 * or restarting: the loader is rebuilt when `site.server.ts` reloads site.json,
 * which the generator writes after content.json.
 */
import fs from 'node:fs'
import path from 'node:path'

import { loader, type LoaderImage, type LoaderOutput, type Source } from 'cantip/source'
import { getProjectIdForDoc, getSiteData, getSiteGeneration } from './site.server'

export type { Heading, PageData } from 'cantip/source'

// The generated content data, read from the user's cwd (where `remix-serve` runs
// and where the generator writes). cwd-relative is safe here because the app is
// always launched from the project root; the generator uses the same root.
const CONTENT_FILE = path.resolve(process.cwd(), 'app/generated/content.json')

/** Read + parse the generated content Source from disk. Throws if missing. */
function readSource(): Source {
	const raw = fs.readFileSync(CONTENT_FILE, 'utf8')
	return JSON.parse(raw) as Source
}

/** The shape route loaders return for a single doc. */
export interface Doc {
	id: string
	frontmatter: Record<string, unknown>
	headings: import('cantip/source').Heading[]
	/** Render form: a hast tree the client renders via HastRenderer. */
	hast: import('hast').Root
	/** Whether this page is a rendered Obsidian canvas (widens the layout). */
	isCanvas: boolean
	/** Source-relative file path (incl. extension) for "edit this page" links; may be absent. */
	sourcePath?: string
}

// Project scoping uses the same rule as the sidebar/projects layer (first id
// segment, with the general bucket folded in).
let _loader: LoaderOutput | null = null
let _loaderGeneration = -1
function L(): LoaderOutput {
	const generation = getSiteGeneration()
	if (_loader && _loaderGeneration === generation) return _loader
	try {
		_loader = loader({ source: readSource(), lang: getSiteData().site.lang, projectOf: getProjectIdForDoc })
	} catch (error) {
		if (!_loader) throw error
		console.error(`cantip: could not reload ${CONTENT_FILE}; serving the previous content.`, error)
	}
	// Set on failure too, so a broken file is read once per regenerate, not on every call.
	_loaderGeneration = generation
	return _loader
}

/** Drop the in-memory content cache. The next call rebuilds the loader from `content.json`. */
export function resetContent(): void {
	_loader = null
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
	return {
		id: page.id,
		frontmatter: page.data.frontmatter,
		headings: page.data.headings,
		hast: page.data.hast,
		isCanvas: page.data.isCanvas,
		sourcePath: page.data.sourcePath,
	}
}

/** Load an image view by its route id, or null. */
export async function getImage(id: string): Promise<LoaderImage | null> {
	return L().getImage(id)
}

/**
 * Whether the URL pathname shows a canvas or an image. Those have no on-page TOC,
 * so the root layout widens the tab strip over the TOC column. Resolves permalinks
 * the same way the doc route does. Unknown paths → false.
 */
export async function spansTocColumn(pathname: string): Promise<boolean> {
	const id = resolvePathname(pathname)
	if (!id) return false
	return (L().getPage(id)?.data.isCanvas ?? false) || L().getImage(id) !== null
}

/** The id a URL pathname points at, following permalinks. Empty or malformed pathname → null. */
export function resolvePathname(pathname: string): string | null {
	let slug: string
	try {
		slug = decodeURIComponent(pathname).replace(/^\/+|\/+$/g, '')
	} catch {
		return null
	}
	if (!slug) return null
	return L().resolvePermalink(slug) ?? slug
}

/** A doc's display title: its `title` frontmatter, else the last slug segment. */
export function docTitle(doc: Doc, slug: string): string {
	return (
		(doc.frontmatter.title as string | undefined) ??
		slug.split('/').pop()?.replace(/-/g, ' ') ??
		slug
	)
}

/** The loaded content API (used by the sidebar builder). */
export function content(): LoaderOutput {
	return L()
}
