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

import type { Root as HastRoot } from 'hast'

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
	/**
	 * The page body as a serialized hast (HTML AST) tree — the canonical render
	 * form. The doc route renders it to a real React element tree via HastRenderer
	 * (component mapping, client-side links, no dangerouslySetInnerHTML).
	 */
	hast: HastRoot
	/**
	 * The body as an HTML string, derived from `hast`. Server/build-side only
	 * (Pagefind index, Jira ADF, ticket-link scan); the route loader strips it from
	 * the client payload, where `hast` is rendered instead.
	 */
	html: string
	/** True when the page is a rendered Obsidian canvas (no prose to index). */
	isCanvas: boolean
	/**
	 * Source file path relative to the project's `source` dir, incl. extension
	 * (e.g. `глоссарий/Коллекция.md`). Used to build "edit this page" links against
	 * a project's `editUrl` template. Optional — Sources from other backends may omit it.
	 */
	sourcePath?: string
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
 * Optional folder metadata (ordering, custom labels). Not required — when absent,
 * `loader()` orders a folder's children alphabetically and labels subfolders from
 * their slug. Sourced from per-folder `_meta.{yaml,yml,json}` files (see
 * `scripts/collect-meta.ts`).
 */
export interface VirtualMeta {
	type: 'meta'
	/** Folder path this meta applies to (no leading/trailing slash; '' = root). */
	path: string
	data: {
		/** This folder's own display label (used by its PARENT when listing it). */
		label?: string
		/**
		 * Explicit order of this folder's direct children, by slugified name (pages
		 * and subfolders share one namespace). Listed children come first in this
		 * order; anything unlisted appends after, alphabetically.
		 */
		order?: string[]
		/** Rename direct children: slugified child name → display label. */
		childLabels?: Record<string, string>
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
