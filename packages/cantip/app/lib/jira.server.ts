/**
 * Jira Cloud integration (server-only).
 *
 * Cantip is a read-only, build-time engine: the running server only ever READS
 * generated content. Publishing to Jira is the one place it reaches OUT to a
 * live, authenticated, write-capable service — so it lives behind a resource
 * route (`routes/api.jira`) and never runs in the browser (credentials must stay
 * server-side, and Jira's REST API blocks browser CORS anyway).
 *
 * Configuration is ENV-ONLY (no `docs.config.ts` surface): a single shared Jira
 * service-account identity. There is no per-user auth — the cantip user is
 * irrelevant; identity matters only inside Jira.
 *
 *   JIRA_BASE_URL            https://your-org.atlassian.net   (required)
 *   JIRA_EMAIL               service-account@your-org.com     (required)
 *   JIRA_API_TOKEN           <Atlassian API token>            (required)
 *   JIRA_DEFAULT_PROJECT     PROJ                             (optional)
 *   JIRA_DEFAULT_ISSUE_TYPE  Task                             (optional, default "Task")
 *
 * The feature is "enabled" iff the three required vars are present. When any is
 * missing every export degrades gracefully (config is null; the button hides).
 */
import type { AdfDoc } from '~/lib/adf.server'

// Re-export the HTML→ADF helpers so callers have one Jira entry point.
export { htmlToAdf, textToAdf } from '~/lib/adf.server'
export type { AdfDoc } from '~/lib/adf.server'

/** Resolved, validated Jira connection config (null when not configured). */
export interface JiraConfig {
	baseUrl: string
	email: string
	token: string
	defaultProject: string | null
	defaultIssueType: string
}

/** Non-secret subset safe to send to the browser (drives the Publish button). */
export interface JiraClientConfig {
	enabled: boolean
	defaultProject: string | null
	defaultIssueType: string
}

/**
 * Read + validate Jira env config. Returns null unless all three required vars
 * are set, so callers can treat null as "feature off". A trailing slash on the
 * base URL is trimmed so REST paths concatenate safely.
 */
export function getJiraConfig(): JiraConfig | null {
	const baseUrl = process.env.JIRA_BASE_URL?.trim().replace(/\/+$/, '')
	const email = process.env.JIRA_EMAIL?.trim()
	const token = process.env.JIRA_API_TOKEN?.trim()
	if (!baseUrl || !email || !token) return null
	return {
		baseUrl,
		email,
		token,
		defaultProject: process.env.JIRA_DEFAULT_PROJECT?.trim() || null,
		defaultIssueType: process.env.JIRA_DEFAULT_ISSUE_TYPE?.trim() || 'Task',
	}
}

/** Project the env config down to the non-secret bits the client needs. */
export function getJiraClientConfig(): JiraClientConfig {
	const config = getJiraConfig()
	return {
		enabled: config !== null,
		defaultProject: config?.defaultProject ?? null,
		defaultIssueType: config?.defaultIssueType ?? 'Task',
	}
}

/** The Basic auth header value for Jira Cloud: base64("email:token"). */
function authHeader(config: JiraConfig): string {
	const basic = Buffer.from(`${config.email}:${config.token}`).toString('base64')
	return `Basic ${basic}`
}

// ── REST calls ──────────────────────────────────────────────────────────────

/** A created/updated issue, projected to what the client needs. */
export interface JiraIssueRef {
	key: string
	url: string
}

/** Raised for any non-2xx Jira response, carrying a human-readable reason. */
export class JiraError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message)
		this.name = 'JiraError'
	}
}

/** Extract a useful message from Jira's (inconsistent) error response body. */
function jiraErrorMessage(status: number, body: unknown): string {
	if (body && typeof body === 'object') {
		const b = body as { errorMessages?: string[]; errors?: Record<string, string> }
		if (b.errorMessages?.length) return b.errorMessages.join('; ')
		if (b.errors && Object.keys(b.errors).length) {
			return Object.entries(b.errors)
				.map(([k, v]) => `${k}: ${v}`)
				.join('; ')
		}
	}
	return `Jira request failed (HTTP ${status})`
}

/** REST helper: sets auth + JSON headers, parses Jira's errors uniformly. */
async function jiraFetch(
	config: JiraConfig,
	path: string,
	init: { method: string; body?: unknown },
): Promise<unknown> {
	const res = await fetch(`${config.baseUrl}${path}`, {
		method: init.method,
		headers: {
			Authorization: authHeader(config),
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	})
	const text = await res.text()
	const parsed = text ? (JSON.parse(text) as unknown) : null
	if (!res.ok) throw new JiraError(jiraErrorMessage(res.status, parsed), res.status)
	return parsed
}

/** Build the human-facing browse URL for an issue key. */
function browseUrl(config: JiraConfig, key: string): string {
	return `${config.baseUrl}/browse/${key}`
}

/**
 * Create a Jira issue. `summary` is truncated to Jira's 255-char limit; the
 * description is sent as ADF. Returns the new issue's key + browse URL.
 */
export async function createIssue(
	config: JiraConfig,
	input: { projectKey: string; issueType: string; summary: string; description: AdfDoc },
): Promise<JiraIssueRef> {
	const body = {
		fields: {
			project: { key: input.projectKey },
			issuetype: { name: input.issueType },
			summary: input.summary.slice(0, 255) || '(untitled)',
			description: input.description,
		},
	}
	const result = (await jiraFetch(config, '/rest/api/3/issue', { method: 'POST', body })) as { key: string }
	return { key: result.key, url: browseUrl(config, result.key) }
}

/** A project the user can publish into (for the dialog's project picker). */
export interface JiraProject {
	key: string
	name: string
}

/** List the projects visible to the configured account (capped at 100). */
export async function listProjects(config: JiraConfig): Promise<JiraProject[]> {
	const res = (await jiraFetch(config, '/rest/api/3/project/search?maxResults=100&orderBy=key', {
		method: 'GET',
	})) as { values?: Array<{ key: string; name: string }> }
	return (res.values ?? []).map((p) => ({ key: p.key, name: p.name }))
}

/** An issue type valid for a given project (for the dialog's type picker). */
export interface JiraIssueType {
	id: string
	name: string
}

/**
 * List the issue types creatable in a project. Subtasks are excluded — they
 * can't be created standalone (they need a parent), so they'd only error.
 */
export async function listIssueTypes(config: JiraConfig, projectKey: string): Promise<JiraIssueType[]> {
	const path = `/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes`
	const res = (await jiraFetch(config, path, { method: 'GET' })) as {
		values?: Array<{ id: string; name: string; subtask?: boolean }>
	}
	return (res.values ?? []).filter((t) => !t.subtask).map((t) => ({ id: t.id, name: t.name }))
}
