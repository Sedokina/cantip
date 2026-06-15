/**
 * Root loader (server-only). Split out of root.tsx so the root COMPONENT module
 * carries no server-only imports — when a consumer re-exports `cantip/root`'s
 * component into their own `app/root.tsx`, Remix strips this `.server` loader from
 * the client bundle cleanly (it can't strip a top-level server import that sits in
 * the component module).
 */
import type { LoaderFunctionArgs } from '@remix-run/node'

import { buildSidebar, flattenSidebar } from '~/lib/sidebar.server'
import { isCanvasPath } from '~/lib/content.server'
import { getActiveProjectId, getSiteData, getProjects } from '~/lib/site.server'

// Runs on every navigation; the active project is derived from the request URL
// and only that project's sidebar tree is built, so the nav persists across
// client-side navigations and swaps to match the project being viewed.
// `isCanvas` lets the layout widen the tab strip across the TOC column on canvas
// pages (which span both content columns and have no on-page TOC).
//
// Site branding/projects/theme are read from disk here (runtime, not bundled) and
// handed to the client via useLoaderData → SiteProvider — that's what keeps the
// build client-agnostic. `site.title` lets routes derive `<title>` from match
// data, and `theme` is rendered into an inline <style> in root.tsx.
export async function loader({ request }: LoaderFunctionArgs) {
	const pathname = new URL(request.url).pathname
	const projectId = getActiveProjectId(pathname)
	const sidebar = projectId ? flattenSidebar(await buildSidebar(projectId)) : null
	const isCanvas = await isCanvasPath(pathname)
	const data = getSiteData()
	return {
		sidebar,
		projectId,
		isCanvas,
		site: data.site,
		projects: getProjects(),
		general: data.general,
		theme: data.theme,
	}
}
