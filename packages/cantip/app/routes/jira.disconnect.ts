/**
 * POST /jira/disconnect — clear this browser's Jira session.
 *
 * Mounted by the consumer as `app/routes/jira.disconnect.ts`:
 *   export { action } from 'cantip/routes/jira.disconnect'
 *
 * Expires the session cookie and redirects back to `redirectTo` (a form field).
 * After this the browser falls back to the shared account (if configured) or to
 * "not connected".
 */
import { redirect } from '@remix-run/node'
import type { ActionFunctionArgs } from '@remix-run/node'

import { destroySession } from '~/lib/jira-auth.server'

function safePath(value: FormDataEntryValue | null): string {
	return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

export async function action({ request }: ActionFunctionArgs) {
	const form = await request.formData()
	const redirectTo = safePath(form.get('redirectTo'))
	const headers = new Headers()
	for (const cookie of destroySession()) headers.append('Set-Cookie', cookie)
	return redirect(redirectTo, { headers })
}
