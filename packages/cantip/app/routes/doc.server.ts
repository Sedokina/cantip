/**
 * Doc route loader (server-only). Split out of `$.tsx` so the route COMPONENT
 * module carries no server-only imports — lets a consumer re-export the route
 * cleanly (Remix strips this `.server` loader from the client bundle).
 */
import { json, redirect } from '@remix-run/node'
import type { LoaderFunctionArgs } from '@remix-run/node'

import { getDoc, resolvePermalink, getPermalinkForId } from '~/lib/content.server'
import { getSiteData, getProjectIdForDoc } from '~/lib/site.server'
import { GENERAL_PROJECT_ID } from '~/lib/projects-core'
import { collectLinkedTickets } from '~/lib/jira-links'

/**
 * Build the "edit this page" URL for a doc from its project's `editUrl` template
 * (`site.json`), or null when no template is configured / the source path is
 * unknown. `{path}` is filled with the source-relative file path, each segment
 * percent-encoded so spaces/Cyrillic produce a valid URL (the repo decodes them).
 */
function editUrlFor(docId: string, sourcePath: string | undefined): string | null {
	if (!sourcePath) return null
	const projectId = getProjectIdForDoc(docId)
	const site = getSiteData()
	const template =
		projectId === GENERAL_PROJECT_ID
			? site.general.editUrl
			: site.projects.find((p) => p.id === projectId)?.editUrl
	if (!template) return null
	const encoded = sourcePath.split('/').map(encodeURIComponent).join('/')
	return template.replace('{path}', encoded)
}

export const loader = async ({ params }: LoaderFunctionArgs) => {
	// The splat param holds the full doc path, e.g. "krista/глоссарий/коллекция".
	const slug = (params['*'] ?? '').replace(/\/$/, '')

	// Permalinks make a doc's URL independent of its file name. The permalink is
	// the canonical URL: if `slug` is a permalink we serve the doc in place; if it
	// is the file-path URL of a doc that has a permalink, we 301 to the permalink
	// so there is a single canonical address that survives renames.
	const permalinkTarget = await resolvePermalink(slug)
	const docId = permalinkTarget ?? slug
	if (!permalinkTarget) {
		const canonical = await getPermalinkForId(slug)
		if (canonical && canonical !== slug) {
			return redirect(`/${canonical}/`, 301)
		}
	}

	const doc = await getDoc(docId)
	if (!doc || doc.frontmatter.draft === true) {
		throw new Response('Not Found', { status: 404 })
	}
	const title =
		(doc.frontmatter.title as string | undefined) ??
		slug.split('/').pop()?.replace(/-/g, ' ') ??
		slug
	// Scan the body's hast for linked Jira tickets server-side, so the result ships
	// to the client without the body needing to exist as an HTML string anywhere.
	const linkedTickets = collectLinkedTickets(doc.frontmatter, doc.hast)
	return json({ doc, title, editUrl: editUrlFor(docId, doc.sourcePath), linkedTickets })
}
