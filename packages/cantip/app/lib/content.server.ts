import fs from 'node:fs/promises'
import path from 'node:path'

export interface DocIndexEntry {
	id: string
	title: string | null
	draft: boolean
	tableOfContents: boolean
	tags: string[]
	isCanvas: boolean
}

export interface Heading {
	depth: number
	slug: string
	text: string
}

export interface Doc {
	id: string
	frontmatter: Record<string, unknown>
	headings: Heading[]
	html: string
}

// The generated manifest lives at <project>/app/generated and is read at runtime
// from the working directory (it is not bundled into the server build, so we
// resolve it from cwd rather than relative to this compiled module).
const GENERATED_DIR = path.join(process.cwd(), 'app', 'generated')

let indexCache: DocIndexEntry[] | null = null
let permalinkCache: { toId: Record<string, string>; toPermalink: Record<string, string> } | null = null

/**
 * Load the permalink map (built at generate time from each doc's `permalink`
 * frontmatter). Keys and values are normalized id-style paths with no leading
 * or trailing slashes, matching how the route loader strips request paths.
 * Returns both directions: permalink→id (to serve) and id→permalink (so a
 * file-path request can redirect to its canonical permalink).
 */
async function getPermalinks() {
	if (!permalinkCache) {
		let toId: Record<string, string> = {}
		try {
			const raw = await fs.readFile(path.join(GENERATED_DIR, 'permalinks.json'), 'utf8')
			toId = JSON.parse(raw) as Record<string, string>
		} catch {
			toId = {} // no permalinks defined → empty map
		}
		const toPermalink: Record<string, string> = {}
		for (const [permalink, id] of Object.entries(toId)) {
			// If a doc has several permalinks, the first wins as its canonical URL.
			if (!toPermalink[id]) toPermalink[id] = permalink
		}
		permalinkCache = { toId, toPermalink }
	}
	return permalinkCache
}

/** The doc id a permalink points at, or null if the path is not a permalink. */
export async function resolvePermalink(pathSlug: string): Promise<string | null> {
	const { toId } = await getPermalinks()
	return toId[pathSlug] ?? null
}

/** The canonical permalink for a doc id, or null if the doc has none. */
export async function getPermalinkForId(id: string): Promise<string | null> {
	const { toPermalink } = await getPermalinks()
	return toPermalink[id] ?? null
}

/**
 * The canonical URL for a doc id: its permalink URL when it has one, else its
 * file-path URL `/{id}/`. Used by link emitters (e.g. the sidebar) so internal
 * links point straight at the permalink instead of taking a 301 redirect.
 */
export async function getCanonicalUrl(id: string): Promise<string> {
	const permalink = await getPermalinkForId(id)
	return permalink ? `/${permalink}/` : `/${id}/`
}

/** All non-draft docs from the generated index (cached for the process). */
export async function getAllDocs(): Promise<DocIndexEntry[]> {
	if (!indexCache) {
		const raw = await fs.readFile(path.join(GENERATED_DIR, 'index.json'), 'utf8')
		indexCache = JSON.parse(raw) as DocIndexEntry[]
	}
	return indexCache.filter((d) => !d.draft)
}

/** Load a single compiled doc by its route id (e.g. "krista/глоссарий/коллекция"). */
export async function getDoc(id: string): Promise<Doc | null> {
	// Guard against path traversal: ids are slugified, so no "." segments.
	const safe = id
		.split('/')
		.filter((s) => s && s !== '.' && s !== '..')
		.join('/')
	if (!safe) return null
	try {
		const raw = await fs.readFile(path.join(GENERATED_DIR, 'docs', `${safe}.json`), 'utf8')
		return JSON.parse(raw) as Doc
	} catch {
		return null
	}
}
