import { useEffect, useState } from 'react'
import { useFetcher } from '@remix-run/react'
import { X } from 'lucide-react'

/**
 * "Publish to Jira" button + dialog shown on a doc page.
 *
 * SLICE 4: publish from the WHOLE PAGE or just the CURRENT SELECTION, and either
 *   • Create a NEW issue — editable summary + live project/issue-type pickers
 *     (defaults from the server env config), or
 *   • Update an EXISTING linked ticket — pick one of the page's `jira:`
 *     frontmatter tickets and replace its description or add a comment.
 * The chosen content becomes the issue body, converted to rich ADF server-side
 * (see adf.server.ts). When the reader has text selected in the article, the
 * dialog offers that selection as the source (and seeds the summary from it).
 *
 * Self-contained: on mount it GETs `/api/jira` to learn whether publishing is
 * configured, and renders NOTHING when it isn't. All Jira calls go through the
 * `/api/jira` route so credentials never reach the browser.
 */

interface JiraClientConfig {
	enabled: boolean
	defaultProject: string | null
	defaultIssueType: string
}
interface JiraProject {
	key: string
	name: string
}
interface JiraIssueType {
	id: string
	name: string
}
interface JiraIssueSummary {
	key: string
	summary: string
}
type PublishResult = { ok: true; key: string; url: string } | { ok: false; error: string }

/** A captured text selection from the article body. */
interface Selection {
	html: string
	text: string
}

/**
 * Read the current text selection if it lies within the article body, returning
 * its HTML (for conversion) and plain text (for the char count + summary seed).
 * Called on the button's mousedown — BEFORE the click can collapse the range.
 */
function captureSelection(): Selection | null {
	const sel = window.getSelection()
	if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
	const range = sel.getRangeAt(0)
	const body = document.querySelector('article.content .body')
	if (!body || !body.contains(range.commonAncestorContainer)) return null
	const holder = document.createElement('div')
	holder.appendChild(range.cloneContents())
	const html = holder.innerHTML.trim()
	const text = sel.toString().trim()
	return html && text ? { html, text } : null
}

/** First non-empty line of a selection, for seeding the create summary. */
function firstLine(text: string): string {
	const line = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? text
	return line.slice(0, 120)
}

export default function PublishToJira({
	pageId,
	title,
	linkedTickets,
}: {
	pageId: string
	title: string
	linkedTickets: string[]
}) {
	const config = useFetcher<JiraClientConfig>()
	const [open, setOpen] = useState(false)
	const [selection, setSelection] = useState<Selection | null>(null)

	// Load enablement config once; the condition is false again once data is set.
	useEffect(() => {
		if (config.state === 'idle' && config.data == null) config.load('/api/jira')
	}, [config.state, config.data])

	if (!config.data?.enabled) return null

	return (
		<div className="my-4">
			<button
				type="button"
				// Capture on mousedown: the click that opens the dialog would otherwise
				// collapse the selection before we can read it.
				onMouseDown={() => setSelection(captureSelection())}
				onClick={() => setOpen(true)}
				className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
			>
				Publish to Jira
			</button>
			{open && (
				<PublishDialog
					pageId={pageId}
					title={title}
					linkedTickets={linkedTickets}
					selection={selection}
					defaults={{ project: config.data.defaultProject, issueType: config.data.defaultIssueType }}
					onClose={() => setOpen(false)}
				/>
			)}
		</div>
	)
}

function PublishDialog({
	pageId,
	title,
	linkedTickets,
	selection,
	defaults,
	onClose,
}: {
	pageId: string
	title: string
	linkedTickets: string[]
	selection: Selection | null
	defaults: { project: string | null; issueType: string }
	onClose: () => void
}) {
	const projects = useFetcher<{ projects?: JiraProject[]; error?: string }>()
	const types = useFetcher<{ issueTypes?: JiraIssueType[]; error?: string }>()
	const issues = useFetcher<{ issues?: JiraIssueSummary[]; error?: string }>()
	const publish = useFetcher<PublishResult>()

	const hasLinks = linkedTickets.length > 0
	const [intent, setIntent] = useState<'create' | 'update'>('create')
	// Default to the selection when there is one — that's the deliberate act.
	const [source, setSource] = useState<'page' | 'selection'>(selection ? 'selection' : 'page')

	// create fields
	const defaultSummary = (src: 'page' | 'selection') =>
		src === 'selection' && selection ? firstLine(selection.text) : title
	const [summary, setSummary] = useState(() => defaultSummary(selection ? 'selection' : 'page'))
	const [summaryEdited, setSummaryEdited] = useState(false)
	const [project, setProject] = useState('')
	const [issueType, setIssueType] = useState('')

	// update fields
	const [issueKey, setIssueKey] = useState(linkedTickets[0] ?? '')
	const [updateMode, setUpdateMode] = useState<'replace' | 'comment'>('replace')

	// Escape closes the dialog.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [onClose])

	// Load the project list when the dialog opens.
	useEffect(() => {
		if (projects.state === 'idle' && projects.data == null) projects.load('/api/jira?resource=projects')
	}, [projects.state, projects.data])

	// Load summaries for the page's linked tickets (for the update picker labels).
	useEffect(() => {
		if (hasLinks && issues.state === 'idle' && issues.data == null) {
			issues.load(`/api/jira?resource=issues&keys=${encodeURIComponent(linkedTickets.join(','))}`)
		}
	}, [issues.state, issues.data, hasLinks])

	// Re-seed the summary from the source unless the user has edited it.
	useEffect(() => {
		if (!summaryEdited) setSummary(defaultSummary(source))
	}, [source])

	// Once projects arrive, preselect the configured default (or the first).
	const projectList = projects.data?.projects ?? []
	useEffect(() => {
		if (project || projectList.length === 0) return
		const preferred = defaults.project && projectList.some((p) => p.key === defaults.project) ? defaults.project : null
		setProject(preferred ?? projectList[0].key)
	}, [projectList, project, defaults.project])

	// Reload issue types whenever the chosen project changes.
	useEffect(() => {
		if (!project) return
		setIssueType('')
		types.load(`/api/jira?resource=issuetypes&project=${encodeURIComponent(project)}`)
	}, [project])

	// Once types arrive, preselect the configured default (or the first).
	const typeList = types.data?.issueTypes ?? []
	useEffect(() => {
		if (issueType || typeList.length === 0) return
		const preferred = typeList.some((t) => t.name === defaults.issueType) ? defaults.issueType : null
		setIssueType(preferred ?? typeList[0].name)
	}, [typeList, issueType, defaults.issueType])

	const summaryOf = (key: string) => issues.data?.issues?.find((i) => i.key === key)?.summary

	const result = publish.data
	const submitting = publish.state !== 'idle'
	const canSubmit =
		!submitting &&
		(intent === 'create' ? summary.trim() !== '' && project !== '' && issueType !== '' : issueKey !== '')

	const onPublish = () => {
		if (!canSubmit) return
		const payload: Record<string, string> =
			intent === 'create'
				? { intent: 'create', pageId, summary, projectKey: project, issueType }
				: { intent: 'update', pageId, issueKey, mode: updateMode }
		if (source === 'selection' && selection) payload.selectionHtml = selection.html
		publish.submit(payload, { method: 'POST', action: '/api/jira', encType: 'application/json' })
	}

	return (
		<div
			className="fixed inset-0 z-100 flex items-start justify-center bg-background/40 p-4 pt-[12vh] backdrop-blur-sm"
			onClick={onClose}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-label="Publish to Jira"
				className="w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-lg border bg-popover shadow-xl"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between border-b px-4 py-3">
					<h2 className="text-sm font-semibold">Publish to Jira</h2>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						className="text-muted-foreground hover:text-foreground"
					>
						<X className="size-4" />
					</button>
				</div>

				<div className="space-y-3 px-4 py-3">
					{/* Source toggle — only when the reader had text selected. */}
					{selection && (
						<div>
							<span className="mb-1 block text-xs font-medium text-muted-foreground">Content</span>
							<div className="inline-flex rounded-md border p-0.5 text-sm">
								{(
									[
										['page', 'Whole page'],
										['selection', `Selection (${selection.text.length} chars)`],
									] as const
								).map(([value, label]) => (
									<button
										key={value}
										type="button"
										onClick={() => setSource(value)}
										className={'rounded px-3 py-1 ' + (source === value ? 'bg-muted font-medium' : 'text-muted-foreground')}
									>
										{label}
									</button>
								))}
							</div>
						</div>
					)}

					{/* Create / Update mode toggle — only when the page has linked tickets. */}
					{hasLinks && (
						<div>
							<span className="mb-1 block text-xs font-medium text-muted-foreground">Action</span>
							<div className="inline-flex rounded-md border p-0.5 text-sm">
								{(['create', 'update'] as const).map((m) => (
									<button
										key={m}
										type="button"
										onClick={() => setIntent(m)}
										className={'rounded px-3 py-1 ' + (intent === m ? 'bg-muted font-medium' : 'text-muted-foreground')}
									>
										{m === 'create' ? 'Create new' : 'Update existing'}
									</button>
								))}
							</div>
						</div>
					)}

					{intent === 'create' ? (
						<>
							<label className="block">
								<span className="mb-1 block text-xs font-medium text-muted-foreground">Summary</span>
								<input
									type="text"
									value={summary}
									onChange={(e) => {
										setSummary(e.target.value)
										setSummaryEdited(true)
									}}
									maxLength={255}
									className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
								/>
							</label>

							<div className="grid grid-cols-2 gap-3">
								<label className="block">
									<span className="mb-1 block text-xs font-medium text-muted-foreground">Project</span>
									<select
										value={project}
										onChange={(e) => setProject(e.target.value)}
										disabled={projects.state !== 'idle' && projectList.length === 0}
										className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
									>
										{projectList.length === 0 && <option value="">Loading…</option>}
										{projectList.map((p) => (
											<option key={p.key} value={p.key}>
												{p.key} — {p.name}
											</option>
										))}
									</select>
								</label>

								<label className="block">
									<span className="mb-1 block text-xs font-medium text-muted-foreground">Issue type</span>
									<select
										value={issueType}
										onChange={(e) => setIssueType(e.target.value)}
										disabled={typeList.length === 0}
										className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
									>
										{typeList.length === 0 && <option value="">{project ? 'Loading…' : '—'}</option>}
										{typeList.map((t) => (
											<option key={t.id} value={t.name}>
												{t.name}
											</option>
										))}
									</select>
								</label>
							</div>
						</>
					) : (
						<>
							<label className="block">
								<span className="mb-1 block text-xs font-medium text-muted-foreground">Linked ticket</span>
								<select
									value={issueKey}
									onChange={(e) => setIssueKey(e.target.value)}
									className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
								>
									{linkedTickets.map((key) => {
										const s = summaryOf(key)
										return (
											<option key={key} value={key}>
												{s ? `${key} — ${s}` : key}
											</option>
										)
									})}
								</select>
							</label>

							<fieldset className="space-y-1.5">
								<legend className="mb-1 text-xs font-medium text-muted-foreground">What to update</legend>
								{(
									[
										['replace', 'Replace the description'],
										['comment', 'Add the content as a comment'],
									] as const
								).map(([value, label]) => (
									<label key={value} className="flex items-center gap-2 text-sm">
										<input
											type="radio"
											name="updateMode"
											value={value}
											checked={updateMode === value}
											onChange={() => setUpdateMode(value)}
										/>
										{label}
									</label>
								))}
							</fieldset>
						</>
					)}

					{(projects.data?.error || types.data?.error || issues.data?.error) && (
						<p className="text-xs text-red-700 dark:text-red-400">
							{projects.data?.error || types.data?.error || issues.data?.error}
						</p>
					)}

					{result?.ok && (
						<p className="text-sm text-green-700 dark:text-green-400">
							{intent === 'create' ? 'Created' : 'Updated'}{' '}
							<a href={result.url} target="_blank" rel="noreferrer" className="font-semibold underline">
								{result.key}
							</a>
						</p>
					)}
					{result && !result.ok && <p className="text-sm text-red-700 dark:text-red-400">{result.error}</p>}
				</div>

				<div className="flex justify-end gap-2 border-t px-4 py-3">
					<button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
						{result?.ok ? 'Close' : 'Cancel'}
					</button>
					<button
						type="button"
						onClick={onPublish}
						disabled={!canSubmit}
						className="rounded-md border bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
					>
						{submitting ? 'Publishing…' : intent === 'create' ? 'Create issue' : 'Update ticket'}
					</button>
				</div>
			</div>
		</div>
	)
}
