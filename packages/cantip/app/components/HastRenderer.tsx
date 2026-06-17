import { Fragment } from 'react'
import { Link } from '@remix-run/react'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { jsx, jsxs } from 'react/jsx-runtime'
import type { Root as HastRoot } from 'hast'

import CodeBlock from '~/components/CodeBlock'
import CanvasView from '~/components/CanvasView'

/**
 * Render a compiled doc body (a hast tree) to a real React element tree.
 *
 * This replaces the old `dangerouslySetInnerHTML={{ __html }}` path. Because the
 * body is now a genuine React tree, elements can be mapped to components (the
 * `components` map below) — the MDX-style override power — while content stays
 * serialized data (the tree lives in `content.json`, read at runtime), so the
 * build-once / hot-swap / content-agnostic-engine properties are untouched.
 *
 * The pipeline runs `rehype-raw`, so there are no `raw` nodes left for the
 * runtime to choke on; every node here is a real hast element/text/comment.
 */

/**
 * Internal links (`/...`) become Remix `<Link>` for client-side navigation;
 * external links and bare anchors stay plain `<a>`.
 */
function Anchor({ href, children, ...rest }: { href?: string; children?: React.ReactNode }) {
	if (typeof href === 'string' && href.startsWith('/')) {
		return (
			<Link to={href} {...rest}>
				{children}
			</Link>
		)
	}
	return (
		<a href={href} {...rest}>
			{children}
		</a>
	)
}

const components = {
	a: Anchor,
	// Fenced code blocks → a component with a per-block "wrap lines" toggle.
	pre: CodeBlock,
	// The canvas generator emits `<canvas-mount canvas="…">`; render it as the
	// interactive viewer (the `canvas` attribute becomes the component's prop).
	'canvas-mount': CanvasView,
}

export default function HastRenderer({ tree }: { tree: HastRoot }) {
	return toJsxRuntime(tree, { Fragment, jsx, jsxs, components })
}
