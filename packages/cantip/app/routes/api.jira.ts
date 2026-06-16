/**
 * Jira publishing endpoint (resource route, server-only).
 *
 * Mounted by the consumer as `app/routes/api.jira.ts`:
 *
 *   export { loader, action } from 'cantip/routes/api.jira'
 *
 * GET  /api/jira  → non-secret config used to decide whether to show the button.
 * POST /api/jira  → perform a publish action (JSON body, see PublishRequest).
 *
 * This is the ONE place cantip writes to an external service. Credentials never
 * leave the server (see jira.server.ts). The browser talks only to this route.
 */
import { json } from '@remix-run/node'
import type { ActionFunctionArgs } from '@remix-run/node'

import { getDoc } from '~/lib/content.server'
import { createIssue, getJiraClientConfig, getJiraConfig, htmlToAdf, JiraError } from '~/lib/jira.server'

/** GET — the client reads this to know whether (and how) to offer publishing. */
export function loader() {
	return json(getJiraClientConfig())
}

/** Shape of the POST body (Slice 1 supports `intent: 'create'` only). */
interface PublishRequest {
	intent?: string
	/** The page id whose content seeds the issue, e.g. "krista/glossary/term". */
	pageId?: string
	/** Optional summary override; defaults to the page title. */
	summary?: string
	/** Optional project key override; defaults to JIRA_DEFAULT_PROJECT. */
	projectKey?: string
	/** Optional issue type override; defaults to JIRA_DEFAULT_ISSUE_TYPE. */
	issueType?: string
}

/** Uniform error envelope so the client can surface a message inline. */
function fail(message: string, status: number) {
	return json({ ok: false as const, error: message }, { status })
}

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== 'POST') return fail('Method not allowed', 405)

	const config = getJiraConfig()
	if (!config) return fail('Jira is not configured on this server', 503)

	let body: PublishRequest
	try {
		body = (await request.json()) as PublishRequest
	} catch {
		return fail('Expected a JSON request body', 400)
	}

	if (body.intent !== 'create') return fail(`Unsupported intent: ${body.intent ?? '(none)'}`, 400)

	const pageId = body.pageId?.trim()
	if (!pageId) return fail('Missing pageId', 400)

	const doc = await getDoc(pageId)
	if (!doc) return fail(`No such page: ${pageId}`, 404)

	const projectKey = body.projectKey?.trim() || config.defaultProject
	if (!projectKey) {
		return fail('No project key given and JIRA_DEFAULT_PROJECT is not set', 400)
	}
	const issueType = body.issueType?.trim() || config.defaultIssueType
	const summary =
		body.summary?.trim() ||
		(doc.frontmatter.title as string | undefined)?.trim() ||
		pageId.split('/').pop() ||
		pageId

	try {
		const issue = await createIssue(config, {
			projectKey,
			issueType,
			summary,
			description: htmlToAdf(doc.html),
		})
		return json({ ok: true as const, ...issue })
	} catch (err) {
		if (err instanceof JiraError) return fail(err.message, err.status >= 400 && err.status < 600 ? err.status : 502)
		return fail(err instanceof Error ? err.message : 'Unknown error talking to Jira', 502)
	}
}
