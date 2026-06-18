import { useState, type ComponentPropsWithoutRef } from 'react'

import { useT } from '~/lib/site-context'
import { cn } from '~/lib/utils'

/**
 * A fenced code block with a per-block "wrap long lines" toggle.
 *
 * Mapped onto `<pre>` by HastRenderer, so it is a real React component instead of
 * the old CodeWrapToggle, which ran after each render and reached into the DOM to
 * wrap every `<pre>` in a shell and inject a button.
 *
 * The toggle shell carries all of the original `<pre>`'s props/classes (incl. the
 * `.has-blank-before` inter-block-gap marker) on the inner `<pre>`, matching the
 * DOM the old client script produced — so spacing is unchanged. The preference is
 * per-block and intentionally not persisted: each navigation renders fresh blocks
 * that default back to no-wrap.
 */

/** Wrap icon: shown when the click will turn wrapping ON. */
function WrapIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<line x1="3" y1="6" x2="21" y2="6" />
			<path d="M3 12h15a3 3 0 0 1 0 6h-4" />
			<polyline points="16 16 14 18 16 20" />
			<line x1="3" y1="18" x2="10" y2="18" />
		</svg>
	)
}

/** No-wrap icon: shown when the click will turn wrapping OFF. */
function NoWrapIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<line x1="3" y1="6" x2="21" y2="6" />
			<line x1="3" y1="12" x2="21" y2="12" />
			<line x1="3" y1="18" x2="21" y2="18" />
		</svg>
	)
}

export default function CodeBlock({ className, children, ...rest }: ComponentPropsWithoutRef<'pre'>) {
	const t = useT()
	const [wrapped, setWrapped] = useState(false)
	// Icon + label describe the action the click performs (the OTHER state).
	const label = wrapped ? t('noWrapLines') : t('wrapLines')

	return (
		<div className="pre-wrap-shell">
			<pre {...rest} className={cn(className, wrapped && 'pre-wrap')}>
				{children}
			</pre>
			<button
				type="button"
				className="pre-wrap-toggle"
				aria-label={label}
				title={label}
				onClick={() => setWrapped((w) => !w)}
			>
				{wrapped ? <NoWrapIcon /> : <WrapIcon />}
			</button>
		</div>
	)
}
