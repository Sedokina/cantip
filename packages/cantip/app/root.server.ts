/**
 * Root loader (server-only). Split out of root.tsx so the root COMPONENT module
 * carries no server-only imports — when a consumer re-exports `cantip/root`'s
 * component into their own `app/root.tsx`, Remix strips this `.server` loader from
 * the client bundle cleanly (it can't strip a top-level server import that sits in
 * the component module).
 */
import type { LoaderFunctionArgs } from '@remix-run/node'

import { buildSidebar, flattenSidebar } from '~/lib/sidebar.server'
import { getActiveProjectId } from '~/lib/projects'

// Runs on every navigation; the active project is derived from the request URL
// and only that project's sidebar tree is built, so the nav persists across
// client-side navigations and swaps to match the project being viewed.
export async function loader({ request }: LoaderFunctionArgs) {
	const projectId = getActiveProjectId(new URL(request.url).pathname)
	const sidebar = projectId ? flattenSidebar(await buildSidebar(projectId)) : null
	return { sidebar, projectId }
}
