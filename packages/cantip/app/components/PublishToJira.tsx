import { useEffect } from 'react'
import { useFetcher } from '@remix-run/react'

/**
 * "Publish to Jira" button shown on a doc page.
 *
 * SLICE 1: creates a NEW Jira issue from the whole page — summary = page title,
 * description = the page content (flattened to plain-text paragraphs by the
 * server's `htmlToAdf`). Project + issue type come from the server's env config.
 *
 * The component is self-contained: on mount it GETs `/api/jira` to learn whether
 * publishing is configured, and renders NOTHING when it isn't. The actual create
 * is a POST to the same route (credentials stay server-side). Later slices add
 * project/type pickers, selection-based publishing, and updating linked tickets.
 */

/** Non-secret config the GET /api/jira loader returns. */
interface JiraClientConfig {
	enabled: boolean
	defaultProject: string | null
	defaultIssueType: string
}

/** What POST /api/jira returns. */
type PublishResult = { ok: true; key: string; url: string } | { ok: false; error: string }

export default function PublishToJira({ pageId, title }: { pageId: string; title: string }) {
	const config = useFetcher<JiraClientConfig>()
	const publish = useFetcher<PublishResult>()

	// Load the enablement config once. The condition is false again as soon as
	// `data` is set, so this can't loop.
	useEffect(() => {
		if (config.state === 'idle' && config.data == null) config.load('/api/jira')
	}, [config.state, config.data])

	if (!config.data?.enabled) return null

	const submitting = publish.state !== 'idle'
	const result = publish.data

	const onPublish = () => {
		publish.submit(
			{ intent: 'create', pageId, summary: title },
			{ method: 'POST', action: '/api/jira', encType: 'application/json' },
		)
	}

	return (
		<div className="my-4 flex flex-wrap items-center gap-3 text-sm">
			<button
				type="button"
				onClick={onPublish}
				disabled={submitting}
				className="inline-flex items-center gap-2 rounded-md border border-[var(--border,#d4d4d8)] px-3 py-1.5 font-medium hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/10"
			>
				{submitting ? 'Publishing…' : 'Publish to Jira'}
			</button>

			{result?.ok && (
				<span className="text-green-700 dark:text-green-400">
					Created{' '}
					<a href={result.url} target="_blank" rel="noreferrer" className="font-semibold underline">
						{result.key}
					</a>
				</span>
			)}
			{result && !result.ok && <span className="text-red-700 dark:text-red-400">{result.error}</span>}
		</div>
	)
}
