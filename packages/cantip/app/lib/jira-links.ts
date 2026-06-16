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
