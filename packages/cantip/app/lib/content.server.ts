/**
 * Runtime content API — a thin wrapper over `loader()` (cantip/source) fed by the
 * generated content Source.
 *
 * The generator emits `app/generated/content.json` (a serialized `{ files,
 * permalinks }` Source) and this module reads it via `fs` at runtime, rather than
 * importing a bundled `content.ts`. That deliberately keeps the compiled content
 * OUT of the app's server bundle: the Remix build is content-agnostic (build once,
 * point at any content), and content can be regenerated/swapped without rebuilding
 * or restarting — call `resetContent()` to drop the in-memory cache so the next
 * request re-reads the file. The exported signatures are unchanged so route
 * loaders keep working.
 */
import fs from 'node:fs'
import path from 'node:path'

import { loader, type LoaderOutput, type Source } from 'cantip/source'
import { getProjectIdForDoc, getSiteData } from './site.server'

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
	html: string
}

// Build the loader once per process (reading content.json on first use). Project
// scoping uses the same rule as the sidebar/projects layer (first id segment,
// with the general bucket folded in).
let _loader: LoaderOutput | null = null
function L(): LoaderOutput {
	if (!_loader) {
		_loader = loader({ source: readSource(), lang: getSiteData().site.lang, projectOf: getProjectIdForDoc })
	}
	return _loader
}

/**
 * Drop the in-memory content cache. The next call rebuilds the loader from a fresh
 * read of `content.json`. Lets a long-lived server pick up regenerated content
 * (e.g. a "refresh" admin action / file watch) without a rebuild or restart.
 */
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
	return { id: page.id, frontmatter: page.data.frontmatter, headings: page.data.headings, html: page.data.html }
}

/**
 * Whether the doc at a URL pathname is a rendered canvas. Resolves permalinks the
 * same way the doc route does, then reads the page's `isCanvas` flag. Used by the
 * root layout to widen the tab strip over the (TOC-less) canvas column. Unknown
 * paths → false.
 */
export async function isCanvasPath(pathname: string): Promise<boolean> {
	const slug = decodeURIComponent(pathname).replace(/^\/+|\/+$/g, '')
	if (!slug) return false
	const id = L().resolvePermalink(slug) ?? slug
	return L().getPage(id)?.data.isCanvas ?? false
}

/** The loaded content API (used by the sidebar builder). */
export function content(): LoaderOutput {
	return L()
}
