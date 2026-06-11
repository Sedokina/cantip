import { rehype } from 'rehype'

/**
 * Render embedded mermaid diagrams to inline SVG via `rehype-mermaid`.
 *
 * `rehype-mermaid` pulls in Playwright/Chromium, so it's an OPTIONAL peer
 * dependency — not bundled into the generator and only loaded the first time a
 * doc actually contains a mermaid diagram. If a project uses mermaid but hasn't
 * installed the peer, we throw a clear, actionable error rather than a cryptic
 * module-not-found.
 */
type Transform = (html: string) => Promise<string>

let transformPromise: Promise<Transform> | null = null

async function getTransform(): Promise<Transform> {
	if (!transformPromise) {
		transformPromise = (async () => {
			let rehypeMermaid
			try {
				rehypeMermaid = (await import('rehype-mermaid')).default
			} catch {
				throw new Error(
					'A document contains a `mermaid` diagram, but the optional peer ' +
						'`rehype-mermaid` is not installed. Run `npm install rehype-mermaid` to enable it.',
				)
			}
			const processor = rehype()
				.data('settings', { fragment: true, closeSelfClosing: true })
				.use(rehypeMermaid, { dark: true, strategy: 'img-svg' })
			return async (html: string) => String(await processor.process(html))
		})()
	}
	return transformPromise
}

export async function transformHtmlToString(html: string): Promise<string> {
	const transform = await getTransform()
	return transform(html)
}
