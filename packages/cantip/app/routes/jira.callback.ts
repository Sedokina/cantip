/**
 * GET /jira/callback — finish the Jira OAuth flow.
 *
 * Mounted by the consumer as `app/routes/jira.callback.ts`:
 *   export { loader } from 'cantip/routes/jira.callback'
 *
 * Verifies the CSRF `state`, exchanges the code for tokens, resolves the Jira
 * site + user, stores it all in the encrypted session cookie, and redirects
 * back to where the user started. On any failure it redirects back with
 * `?jira_connect=failed` (left disconnected) rather than erroring out.
 */
import { redirect } from '@remix-run/node'
import type { LoaderFunctionArgs } from '@remix-run/node'

import { clearState, commitSession, getOAuthConfig, readState, sessionFromCode } from '~/lib/jira-auth.server'

function safePath(value: string | undefined): string {
	return value && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

/** Append a query flag to a path (preserving any existing query). */
function withFlag(path: string, key: string, value: string): string {
	const [base, hash] = path.split('#')
	const sep = base.includes('?') ? '&' : '?'
	return `${base}${sep}${key}=${value}${hash ? `#${hash}` : ''}`
}

export async function loader({ request }: LoaderFunctionArgs) {
	const oauth = getOAuthConfig()
	if (!oauth) throw new Response('Jira OAuth is not configured', { status: 404 })

	const url = new URL(request.url)
	const code = url.searchParams.get('code')
	const state = url.searchParams.get('state')
	const oauthError = url.searchParams.get('error')

	const saved = await readState(request, oauth.sessionSecret)
	const clear = await clearState(oauth.sessionSecret)
	const redirectTo = safePath(saved?.redirectTo)

	const failBack = (reason: string) =>
		redirect(withFlag(redirectTo, 'jira_connect', reason), { headers: { 'Set-Cookie': clear } })

	if (oauthError) return failBack('denied')
	if (!code || !state || !saved || state !== saved.state) return failBack('failed')

	try {
		const session = await sessionFromCode(oauth, code, `${url.origin}/jira/callback`)
		const headers = new Headers()
		headers.append('Set-Cookie', clear)
		headers.append('Set-Cookie', await commitSession(session, oauth.sessionSecret))
		return redirect(redirectTo, { headers })
	} catch {
		return failBack('failed')
	}
}
