/**
 * Jira publishing endpoint (resource route, server-only).
 *
 * Mounted by the consumer as `app/routes/api.jira.ts`:
 *
 *   export { loader, action } from 'cantip/routes/api.jira'
 *
 * GET  /api/jira  → status (is publishing available, is this browser connected).
 * POST /api/jira  → perform a publish action (JSON body, see PublishRequest).
 *
 * Who the request publishes AS is resolved per-request by `getJiraAuth`: the
 * browser's own OAuth identity if connected, else the shared env account. When
 * a token refresh happens mid-request, the new session cookie rides back on the
 * response via `auth.commit`.
 */
import { json } from '@remix-run/node'
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node'

import { getDoc } from '~/lib/content.server'
import { getJiraAuth, getJiraStatus } from '~/lib/jira-auth.server'
import {
	addComment,
	createIssue,
	dropLeadingTitle,
	getIssueSummaries,
	getJiraDefaults,
	htmlToAdf,
	JiraError,
	listIssueTypes,
	listProjects,
	updateIssueDescription,
} from '~/lib/jira.server'

/** Set-Cookie header init for a refreshed/cleared session, if any. */
function cookieInit(commit?: string): ResponseInit {
	return commit ? { headers: { 'Set-Cookie': commit } } : {}
}

/**
 * GET — keyed by `?resource`:
 *   (none)                        → status (drives the button / connect prompt)
 *   ?resource=projects            → projects the identity can publish into
 *   ?resource=issuetypes&project= → issue types creatable in that project
 *   ?resource=issues&keys=A-1,B-2 → summary + status for the page's tickets
 */
export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url)
	const resource = url.searchParams.get('resource')

	if (!resource) {
		const { commit, ...status } = await getJiraStatus(request)
		return json({ ...status, ...getJiraDefaults() }, cookieInit(commit))
	}

	const auth = await getJiraAuth(request)
	const init = cookieInit(auth.commit)
	if (!auth.connection) return json({ error: 'Not connected to Jira' }, { ...init, status: 503 })
	const conn = auth.connection

	try {
		if (resource === 'projects') return json({ projects: await listProjects(conn) }, init)
		if (resource === 'issuetypes') {
			const project = url.searchParams.get('project')
			if (!project) return json({ error: 'Missing project' }, { ...init, status: 400 })
			return json({ issueTypes: await listIssueTypes(conn, project) }, init)
		}
		if (resource === 'issues') {
			const keys = (url.searchParams.get('keys') ?? '')
				.split(',')
				.map((k) => k.trim())
				.filter(Boolean)
			return json({ issues: keys.length ? await getIssueSummaries(conn, keys) : [] }, init)
		}
		return json({ error: `Unknown resource: ${resource}` }, { ...init, status: 400 })
	} catch (err) {
		if (err instanceof JiraError) return json({ error: err.message }, { ...init, status: err.status })
		return json({ error: 'Failed to reach Jira' }, { ...init, status: 502 })
	}
}

/** Shape of the POST body. `intent` selects create vs update. */
interface PublishRequest {
	intent?: string
	pageId?: string
	/** create: optional summary override; defaults to the page title. */
	summary?: string
	/** create: optional project key override; defaults to JIRA_DEFAULT_PROJECT. */
	projectKey?: string
	/** create: optional issue type override; defaults to JIRA_DEFAULT_ISSUE_TYPE. */
	issueType?: string
	/** update: the linked issue key to update, e.g. "PROJ-123". */
	issueKey?: string
	/** update: replace the description, or add the content as a new comment. */
	mode?: 'replace' | 'comment'
	/** When present, the body comes from this HTML fragment (a text selection). */
	selectionHtml?: string
}

/** Guard against a pathological selection payload (well above any real selection). */
const MAX_SELECTION_CHARS = 200_000

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== 'POST') return json({ ok: false as const, error: 'Method not allowed' }, { status: 405 })

	const auth = await getJiraAuth(request)
	const init = cookieInit(auth.commit)
	const fail = (message: string, status: number) => json({ ok: false as const, error: message }, { ...init, status })

	if (!auth.connection) return fail('Not connected to Jira', 503)
	const conn = auth.connection

	let body: PublishRequest
	try {
		body = (await request.json()) as PublishRequest
	} catch {
		return fail('Expected a JSON request body', 400)
	}

	if (body.intent !== 'create' && body.intent !== 'update') {
		return fail(`Unsupported intent: ${body.intent ?? '(none)'}`, 400)
	}

	const pageId = body.pageId?.trim()
	if (!pageId) return fail('Missing pageId', 400)
	const doc = await getDoc(pageId)
	if (!doc) return fail(`No such page: ${pageId}`, 404)

	const selection = body.selectionHtml?.trim()
	if (selection && selection.length > MAX_SELECTION_CHARS) return fail('Selection is too large', 413)
	// Whole-page: drop the leading `# Title` (it's already the summary). A
	// selection is published verbatim.
	const description = selection ? htmlToAdf(selection) : dropLeadingTitle(htmlToAdf(doc.html))

	try {
		if (body.intent === 'create') {
			const defaults = getJiraDefaults()
			const projectKey = body.projectKey?.trim() || defaults.defaultProject
			if (!projectKey) return fail('No project key given and JIRA_DEFAULT_PROJECT is not set', 400)
			const issueType = body.issueType?.trim() || defaults.defaultIssueType
			const summary =
				body.summary?.trim() ||
				(doc.frontmatter.title as string | undefined)?.trim() ||
				pageId.split('/').pop() ||
				pageId
			const issue = await createIssue(conn, { projectKey, issueType, summary, description })
			return json({ ok: true as const, ...issue }, init)
		}

		// intent === 'update'
		const issueKey = body.issueKey?.trim()
		if (!issueKey) return fail('Missing issueKey', 400)
		const issue =
			body.mode === 'comment'
				? await addComment(conn, issueKey, description)
				: await updateIssueDescription(conn, issueKey, description)
		return json({ ok: true as const, ...issue }, init)
	} catch (err) {
		if (err instanceof JiraError) return fail(err.message, err.status >= 400 && err.status < 600 ? err.status : 502)
		return fail(err instanceof Error ? err.message : 'Unknown error talking to Jira', 502)
	}
}
