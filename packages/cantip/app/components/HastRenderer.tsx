import { Fragment } from 'react'
import { Link } from '@remix-run/react'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { jsx, jsxs } from 'react/jsx-runtime'
import type { Root as HastRoot } from 'hast'

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

/**
 * Canvas pages embed their data as `<script type="application/json">{…}</script>`,
 * read later by CanvasMount. React would HTML-escape a string child, and since
 * `<script>` content is not entity-decoded by the browser, that would corrupt the
 * JSON — so inject the raw text via dangerouslySetInnerHTML instead.
 */
function ScriptTag({ children, ...rest }: { children?: React.ReactNode }) {
	if (typeof children === 'string') {
		return <script {...rest} dangerouslySetInnerHTML={{ __html: children }} />
	}
	return <script {...rest}>{children}</script>
}

const components = {
	a: Anchor,
	script: ScriptTag,
}

export default function HastRenderer({ tree }: { tree: HastRoot }) {
	return toJsxRuntime(tree, { Fragment, jsx, jsxs, components })
}
