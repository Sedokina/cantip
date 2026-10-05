import { Fragment } from 'react'
import { Link } from '@remix-run/react'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { jsx, jsxs } from 'react/jsx-runtime'
import type { Root as HastRoot } from 'hast'

import CodeBlock from '~/components/CodeBlock'
import CanvasView from '~/components/CanvasView'
import FileEmbed from '~/components/FileEmbed'
import { isFileHref } from '~/lib/files'
import { useHtmlComponents } from '~/lib/components'

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
 * Internal links (`/...`) and in-page anchors (`#...`) become Remix `<Link>`;
 * external links stay plain `<a>`. Links to files open in a new tab, where the
 * browser shows the file or downloads it.
 *
 * A plain `<a href="#...">` creates a history entry without a router key, so
 * ScrollRestoration restores the saved position for the "default" key and
 * cancels the browser's scroll to the anchor.
 */
function Anchor({ href, children, ...rest }: { href?: string; children?: React.ReactNode }) {
	if (typeof href === 'string' && isFileHref(href)) {
		return (
			<a href={href} target="_blank" rel="noopener" {...rest}>
				{children}
			</a>
		)
	}
	if (typeof href === 'string' && (href.startsWith('/') || href.startsWith('#'))) {
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

/** Engine defaults. Consumer `htmlComponents` are merged over these. */
const engineComponents = {
	a: Anchor,
	// Fenced code blocks → a component with a per-block "wrap lines" toggle.
	pre: CodeBlock,
	// The canvas generator emits `<canvas-mount canvas="…">`; render it as the
	// interactive viewer (the `canvas` attribute becomes the component's prop).
	'canvas-mount': CanvasView,
	// `![[file]]` of a file the browser can't preview inline; see getCustomFileNode.
	'file-embed': FileEmbed,
}

export default function HastRenderer({ tree }: { tree: HastRoot }) {
	const overrides = useHtmlComponents()
	const components = { ...engineComponents, ...overrides }
	return toJsxRuntime(tree, { Fragment, jsx, jsxs, components })
}
