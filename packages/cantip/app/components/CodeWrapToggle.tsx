import { useEffect } from 'react'

import { t } from '~/lib/site'

/**
 * The document body HTML is rendered server-side and injected via
 * `dangerouslySetInnerHTML`, so code blocks aren't React elements we can give a
 * button declaratively. This component runs after each page render, wraps every
 * `<pre>` in `.body` in a positioning shell, and injects a per-block toggle.
 *
 * Code blocks default to no-wrap with horizontal scroll; the toggle adds
 * `.pre-wrap` to wrap long lines instead. The button lives on the shell (not
 * inside the `<pre>`) so it stays pinned to the block's top-right corner and
 * does not drift when the `<pre>` is scrolled horizontally.
 *
 * The preference is per-block and deliberately NOT persisted — it resets to
 * no-wrap on reload/navigation. Re-runs whenever `deps` changes (pass the doc
 * id) so freshly swapped-in content gets toggles too.
 */

const WRAP_ICON =
	'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><path d="M3 12h15a3 3 0 0 1 0 6h-4"/><polyline points="16 16 14 18 16 20"/><line x1="3" y1="18" x2="10" y2="18"/></svg>'
const NOWRAP_ICON =
	'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>'

const WRAP_LABEL = t('wrapLines')
const NOWRAP_LABEL = t('noWrapLines')

export function CodeWrapToggle({ deps }: { deps?: string }) {
	useEffect(() => {
		const blocks = document.querySelectorAll<HTMLPreElement>('.content .body pre')
		const cleanups: Array<() => void> = []

		blocks.forEach((pre) => {
			// Guard against double-wrapping if the effect re-runs over DOM that
			// React hasn't replaced (e.g. same content remounting).
			if (pre.parentElement?.classList.contains('pre-wrap-shell')) return

			const shell = document.createElement('div')
			shell.className = 'pre-wrap-shell'
			pre.replaceWith(shell)
			shell.appendChild(pre)

			const button = document.createElement('button')
			button.type = 'button'
			button.className = 'pre-wrap-toggle'

			const sync = () => {
				const wrapped = pre.classList.contains('pre-wrap')
				// Icon shows the action the click performs (the OTHER state).
				button.innerHTML = wrapped ? NOWRAP_ICON : WRAP_ICON
				const label = wrapped ? NOWRAP_LABEL : WRAP_LABEL
				button.setAttribute('aria-label', label)
				button.title = label
			}

			const onClick = () => {
				pre.classList.toggle('pre-wrap')
				sync()
			}

			button.addEventListener('click', onClick)
			sync()
			shell.appendChild(button)

			cleanups.push(() => {
				button.removeEventListener('click', onClick)
				// Unwrap: move the <pre> back out and drop the shell.
				if (shell.parentElement) {
					shell.replaceWith(pre)
				}
				button.remove()
			})
		})

		return () => cleanups.forEach((fn) => fn())
	}, [deps])

	return null
}
