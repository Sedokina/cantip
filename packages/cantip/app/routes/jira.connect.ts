/**
 * GET /jira/connect — start the Jira OAuth flow.
 *
 * Mounted by the consumer as `app/routes/jira.connect.ts`:
 *   export { loader } from 'cantip/routes/jira.connect'
 *
 * Stashes a CSRF `state` (+ where to return) in a short-lived cookie and
 * redirects the browser to Atlassian's consent screen. The callback URL is
 * derived from the request origin, so it works in dev and prod without config —
 * just register `<origin>/jira/callback` on the Atlassian app.
 */
import { redirect } from '@remix-run/node'
import type { LoaderFunctionArgs } from '@remix-run/node'

import { authorizeUrl, commitState, getOAuthConfig, newState } from '~/lib/jira-auth.server'

/** Only allow returning to an in-app path (no open redirects). */
function safePath(value: string | null): string {
	return value && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

export async function loader({ request }: LoaderFunctionArgs) {
	const oauth = getOAuthConfig()
	if (!oauth) throw new Response('Jira OAuth is not configured', { status: 404 })

	const url = new URL(request.url)
	const redirectTo = safePath(url.searchParams.get('redirectTo'))
	const redirectUri = `${url.origin}/jira/callback`
	const state = newState()

	return redirect(authorizeUrl(oauth, redirectUri, state), {
		headers: { 'Set-Cookie': await commitState(state, redirectTo, oauth.sessionSecret) },
	})
}
