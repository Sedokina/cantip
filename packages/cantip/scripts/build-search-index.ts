import type { CompiledDoc } from './compile.ts'

/**
 * Build a Pagefind search index from the compiled docs and write it to
 * `public/pagefind/` so it ships as a static asset served at `/pagefind/`.
 *
 * The app is SSR with no static HTML on disk (content lives as HTML strings in
 * the per-doc manifest), so Pagefind's directory-crawling mode has nothing to
 * index. Instead we feed each doc's stored HTML to the Node Indexing API via
 * `addHTMLFile`, which lets Pagefind extract headings, excerpts and apply its
 * heading-weighted ranking — far richer results than indexing plain text.
 *
 * `writeFiles` emits the whole Pagefind runtime here too: `pagefind.js` (search
 * API) plus `pagefind-ui.js` / `pagefind-ui.css` (the prebuilt UI used in the
 * top/bottom bars).
 */
export interface SearchIndexOptions {
	/** Absolute output dir for the Pagefind index, e.g. `<cwd>/public/pagefind`. */
	outputPath: string
	/** Site language for Pagefind tokenisation/stemming (`forceLanguage`). */
	lang: string
}

export async function buildSearchIndex(
	docs: CompiledDoc[],
	canonicalUrl: Map<string, string>,
	logger: { info(m: string): void; warn(m: string): void },
	options: SearchIndexOptions = { outputPath: 'public/pagefind', lang: 'ru' },
): Promise<void> {
	// Pagefind is an OPTIONAL peer (native binary). Imported lazily + guarded so a
	// project without it still builds — search is simply skipped with a warning.
	let createIndex
	try {
		;({ createIndex } = await import('pagefind'))
	} catch {
		logger.warn(
			'Search index skipped: the optional peer `pagefind` is not installed. ' +
				'Run `npm install pagefind` to enable full-text search.',
		)
		return
	}

	const { index, errors } = await createIndex({
		// Set the default site language so tokenisation and stemming are correct.
		// Pagefind still detects per-page `lang` if present.
		forceLanguage: options.lang,
	})
	if (!index) {
		logger.warn(`Pagefind index could not be created: ${errors.join('; ')}`)
		return
	}

	let indexed = 0
	let skipped = 0
	for (const doc of docs) {
		// Drafts are not routable; canvas pages have no prose (their "HTML" is a
		// JSON blob in a <script> mount) — nothing useful to search.
		if (doc.frontmatter.draft === true) {
			skipped++
			continue
		}
		if (doc.html.includes('data-canvas-mount')) {
			skipped++
			continue
		}

		const title =
			(doc.frontmatter.title as string | undefined) ??
			doc.id.split('/').pop()?.replace(/-/g, ' ') ??
			doc.id

		// Canonical URL: the doc's permalink when it has one, else its file-path
		// URL `/{id}/`. Indexing the canonical URL means a clicked search result
		// lands on the permalink directly (no file-path → permalink 301).
		const url = canonicalUrl.get(doc.id) ?? `/${doc.id}/`

		// Directory filters, derived from the slugified id (already matches URLs).
		// `project` is the top-level dir (e.g. "krista") used to default-scope the
		// search to the project the reader is currently in. `dir` is tagged with
		// EVERY ancestor directory prefix of the page, so a filter on any directory
		// — at any nesting depth — matches every page beneath it (WebStorm's
		// "search in directory" behaviour). e.g. "krista/требования/заказы/x" is
		// tagged dir: ["krista", "krista/требования", "krista/требования/заказы"].
		//
		// The Node API's addHTMLFile takes filters only via in-content HTML
		// attributes (data-pagefind-filter), not a `filters` field — so we emit
		// hidden tagging elements. Repeating the `dir` filter on several elements
		// records it as a multi-value filter (one value per ancestor directory).
		const segments = doc.id.split('/')
		const project = segments[0]
		const dirSegments = segments.slice(0, -1) // drop the file slug itself
		const dirPrefixes = dirSegments.map((_, i) => dirSegments.slice(0, i + 1).join('/'))
		const filterTags =
			`<span data-pagefind-filter="project" style="display:none">${escapeHtml(project)}</span>` +
			dirPrefixes
				.map(
					(d) =>
						`<span data-pagefind-filter="dir" style="display:none">${escapeHtml(d)}</span>`,
				)
				.join('')

		// Wrap the body so Pagefind sees a full document with a heading it can use
		// as the result title; `data-pagefind-body` scopes indexing to this region.
		const content = `<!DOCTYPE html><html lang="${escapeHtml(options.lang)}"><head><title>${escapeHtml(
			title,
		)}</title></head><body><main data-pagefind-body>${filterTags}<h1>${escapeHtml(
			title,
		)}</h1>${doc.html}</main></body></html>`

		const { errors: fileErrors } = await index.addHTMLFile({
			url,
			content,
		})
		if (fileErrors.length) {
			logger.warn(`Pagefind failed on ${doc.id}: ${fileErrors.join('; ')}`)
			continue
		}
		indexed++
	}

	const { errors: writeErrors } = await index.writeFiles({
		outputPath: options.outputPath,
	})
	if (writeErrors.length) {
		logger.warn(`Pagefind writeFiles errors: ${writeErrors.join('; ')}`)
	}

	await index.deleteIndex()
	logger.info(`Pagefind: indexed ${indexed} pages (skipped ${skipped}) → ${options.outputPath}`)
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}
