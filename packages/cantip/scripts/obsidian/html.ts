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
			// Harden the headless Chromium `rehype-mermaid` launches, so rendering is
			// reliable inside containers. `--disable-dev-shm-usage` makes Chromium use
			// /tmp instead of /dev/shm — without it, Docker's small default /dev/shm
			// (64MB) can make a multi-diagram render stall/hang non-deterministically.
			// `--no-sandbox` is required where the container can't grant the sandbox's
			// kernel capabilities (common on locked-down hosts). Override the whole arg
			// list via CANTIP_CHROMIUM_ARGS (space-separated) if needed.
			const chromiumArgs = process.env.CANTIP_CHROMIUM_ARGS
				? process.env.CANTIP_CHROMIUM_ARGS.split(/\s+/).filter(Boolean)
				: ['--no-sandbox', '--disable-dev-shm-usage']
			const processor = rehype()
				.data('settings', { fragment: true, closeSelfClosing: true })
				.use(rehypeMermaid, {
					dark: true,
					strategy: 'img-svg',
					launchOptions: { args: chromiumArgs },
				})
			return async (html: string) => String(await processor.process(html))
		})()
	}
	return transformPromise
}

// Bound how many mermaid diagrams render at once. `rehype-mermaid` (via
// `mermaid-isomorphic`) reuses a SINGLE headless Chromium, but opens one page
// per in-flight render — and the callers fan out without limit: the remark
// transform calls this once per diagram (Promise.all in handleMermaid) and the
// file pipeline processes every vault file at once (Promise.allSettled in
// files.ts). On small, swap-less containers, dozens of simultaneous Chromium
// pages exhaust memory and the build hangs non-deterministically. A global
// limiter caps how many pages are open in the shared browser at any moment.
// The default of 2 also keeps the browser warm between renders (the renderer
// closes Chromium whenever no render is in flight, so serializing fully would
// relaunch it per diagram). Tune with CANTIP_MERMAID_CONCURRENCY.
const renderConcurrency = Math.max(1, Number(process.env.CANTIP_MERMAID_CONCURRENCY) || 2)
let activeRenders = 0
const renderWaiters: Array<() => void> = []

async function withRenderLimit<T>(fn: () => Promise<T>): Promise<T> {
	while (activeRenders >= renderConcurrency) {
		await new Promise<void>((resolve) => renderWaiters.push(resolve))
	}
	activeRenders++
	try {
		return await fn()
	} finally {
		activeRenders--
		renderWaiters.shift()?.()
	}
}

export async function transformHtmlToString(html: string): Promise<string> {
	const transform = await getTransform()
	return withRenderLimit(() => transform(html))
}
