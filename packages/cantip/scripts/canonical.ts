import type { CompiledDoc } from './compile.ts'

/**
 * Canonical-URL resolution shared by every place that emits a link to a doc
 * (in-content wikilinks, the sidebar, the search index). A doc's canonical URL
 * is its `permalink` (project-scoped, set in frontmatter) when it has one, else
 * its file-path URL `/{id}/`. Linking to the canonical URL means internal links
 * skip the file-path → permalink 301 redirect.
 */

/** Project a doc belongs to: its first id segment (mirrors getProjectIdForDoc). */
function projectOf(id: string): string {
	return id.split('/')[0] ?? ''
}

/**
 * Map every doc id to its canonical URL. Docs with a `permalink` frontmatter
 * field get the project-scoped permalink URL; all others map to `/{id}/`.
 */
export function buildIdToCanonicalUrl(docs: CompiledDoc[]): Map<string, string> {
	const map = new Map<string, string>()
	for (const d of docs) {
		const raw = d.frontmatter.permalink
		if (typeof raw === 'string' && raw.trim() !== '') {
			const rel = raw.trim().replace(/^\/+|\/+$/g, '')
			if (rel) {
				map.set(d.id, `/${projectOf(d.id)}/${rel}/`)
				continue
			}
		}
		map.set(d.id, `/${d.id}/`)
	}
	return map
}
