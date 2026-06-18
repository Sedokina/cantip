/**
 * Extract linked Jira issue keys from a page's frontmatter (client-safe — no
 * server imports, so the doc route can call it during render).
 *
 * The `jira` frontmatter field is author-declared and may be:
 *   jira: PROJ-123                         (a bare key)
 *   jira: https://x.atlassian.net/browse/PROJ-123   (a browse URL)
 *   jira: [PROJ-123, PROJ-456]             (a list of either)
 *
 * Any value is scanned for issue-key patterns (UPPERCASE project + number), so
 * URLs, bare keys, and mixed lists all work. Duplicates are removed, order kept.
 */

/** Jira issue-key shape: a project key (letters/digits, leading letter) + number. */
const ISSUE_KEY = /[A-Z][A-Z0-9]+-\d+/g

export function parseLinkedTickets(frontmatter: Record<string, unknown>): string[] {
	const raw = frontmatter?.jira
	if (raw == null) return []
	const values = Array.isArray(raw) ? raw : [raw]
	const keys = new Set<string>()
	for (const value of values) {
		const matches = String(value).match(ISSUE_KEY)
		if (matches) for (const m of matches) keys.add(m)
	}
	return [...keys]
}

/** A Jira browse URL, e.g. `…/browse/PROJ-42`, captured to its issue key. */
const BROWSE_HREF = /\/browse\/([A-Z][A-Z0-9]+-\d+)/

/** Collect every anchor `href` in a hast tree (the rendered doc body). */
function anchorHrefs(node: { tagName?: string; properties?: Record<string, unknown>; children?: unknown[] }, out: string[]): void {
	if (node.tagName === 'a' && typeof node.properties?.href === 'string') out.push(node.properties.href)
	if (Array.isArray(node.children)) {
		for (const child of node.children) anchorHrefs(child as typeof node, out)
	}
}

/**
 * Extract issue keys from links in the rendered page body, where tickets are
 * markdown links like `[PROJ-42: …](…/browse/PROJ-42)`. Only anchor hrefs that
 * point at a `/browse/KEY` URL are matched, so prose like "UTF-8" or "COVID-19"
 * can't masquerade as a ticket. Walks the body's hast tree (the render form), so
 * no HTML string needs to exist at runtime.
 */
export function parseBodyTickets(hast: import('hast').Root): string[] {
	const keys = new Set<string>()
	const hrefs: string[] = []
	anchorHrefs(hast, hrefs)
	for (const href of hrefs) {
		const m = BROWSE_HREF.exec(href)
		if (m) keys.add(m[1])
	}
	return [...keys]
}

/**
 * All tickets a page links to: frontmatter `jira:` first, then body browse
 * links, deduped (order preserved) and capped so a page with many references
 * doesn't trigger a huge summary fetch.
 */
export function collectLinkedTickets(
	frontmatter: Record<string, unknown>,
	hast: import('hast').Root,
	limit = 50,
): string[] {
	const seen = new Set<string>()
	const out: string[] = []
	for (const key of [...parseLinkedTickets(frontmatter), ...parseBodyTickets(hast)]) {
		if (!seen.has(key)) {
			seen.add(key)
			out.push(key)
		}
	}
	return out.slice(0, limit)
}
