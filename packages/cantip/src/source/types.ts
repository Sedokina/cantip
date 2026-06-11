/**
 * The framework-agnostic content contract (inspired by Fumadocs' `source`).
 *
 * A **Source** is just `{ files: VirtualFile[] }` — an in-memory list of pages
 * (and optional folder-meta). It says NOTHING about where content came from
 * (Obsidian vaults, a CMS, generated API docs…), so `loader()` (loader.ts) can
 * build the nav tree + lookups over ANY backend without touching the filesystem
 * or a markdown processor.
 *
 * The built-in Obsidian backend (the generator) produces a Source; a user can
 * supply any object with this shape from `app/source.ts`.
 */

/** A heading collected from a compiled page, for the table of contents. */
export interface Heading {
	depth: number
	slug: string
	text: string
}

/** The rendered data for one documentation page. */
export interface PageData {
	/** Display title (frontmatter `title`, else derived from the slug). */
	title: string
	/** Raw frontmatter map (priority, tags, permalink, draft, …). */
	frontmatter: Record<string, unknown>
	/** Collected headings for the on-page TOC. */
	headings: Heading[]
	/** Pre-rendered HTML string (injected via dangerouslySetInnerHTML). */
	html: string
	/** True when the page is a rendered Obsidian canvas (no prose to index). */
	isCanvas: boolean
}

/** A single page in a Source. */
export interface VirtualPage {
	type: 'page'
	/**
	 * The page's id / route path with no leading or trailing slash, e.g.
	 * `krista/глоссарий/коллекция`. Its slug segments are `path.split('/')`.
	 */
	path: string
	data: PageData
}

/**
 * Optional folder metadata (ordering, custom label). Not required — when absent,
 * `loader()` derives folder labels from the segment and orders alphabetically.
 * Reserved for future explicit-ordering support.
 */
export interface VirtualMeta {
	type: 'meta'
	/** Folder path this meta applies to (no leading/trailing slash). */
	path: string
	data: {
		label?: string
		/** Explicit child order (page/folder names). */
		order?: string[]
	}
}

export type VirtualFile = VirtualPage | VirtualMeta

/** A content backend: just a list of virtual files. */
export interface Source {
	files: VirtualFile[]
	/**
	 * Permalink → page-id map (a page may pin a stable URL via frontmatter,
	 * independent of its filename). Optional; defaults to empty.
	 */
	permalinks?: Record<string, string>
}
