import { useEffect, useRef } from 'react'

/** True when the app is currently in dark mode (the `.dark` class on <html>). */
function isDark(): boolean {
	return document.documentElement.classList.contains('dark')
}

/**
 * json-canvas-viewer clears the canvas and draws the grid dots over
 * `canvas.width × canvas.height` in CSS-pixel units, but those are backing-store
 * sizes. Below devicePixelRatio 1 (browser zoom under 100%) that covers only part
 * of the canvas, and the uncleared strip at the bottom and right keeps old frames.
 * Reporting the size in CSS pixels makes both reach the edges at any ratio.
 */
function reportSizeInCssPixels(canvas: HTMLCanvasElement) {
	for (const key of ['width', 'height'] as const) {
		const native = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, key)!
		Object.defineProperty(canvas, key, {
			get: () => native.get!.call(canvas) / window.devicePixelRatio,
			set: (value: number) => native.set!.call(canvas, value),
		})
	}
}

/**
 * Renders an Obsidian canvas inline using the json-canvas-viewer library.
 *
 * Mapped onto the `<canvas-mount>` element emitted by the canvas generator (see
 * scripts/canvas-to-md.ts), so it is a real, self-contained React component — the
 * canvas JSON arrives as the `canvas` prop and the viewer mounts into this
 * component's own ref. (Replaces the old CanvasMount, which scanned the whole
 * document for `[data-canvas-mount]` and read the JSON back out of the DOM.)
 *
 * The viewer is imperative and client-only: it is lazy-imported in an effect, so
 * the server renders just the empty container. Its built-in light/dark palettes
 * are kept in sync with the app theme via a MutationObserver on the `.dark` class.
 */
export default function CanvasView({ canvas }: { canvas?: string }) {
	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const container = ref.current
		if (!container || !canvas) return

		let data: unknown
		try {
			data = JSON.parse(canvas)
		} catch {
			return
		}

		let cancelled = false
		let viewer: { changeTheme: (theme?: 'dark' | 'light') => void } | undefined
		const observer = new MutationObserver(() => {
			viewer?.changeTheme(isDark() ? 'dark' : 'light')
		})

		;(async () => {
			const { JSONCanvasViewer, parser, Minimap, Controls } = await import('json-canvas-viewer')
			if (cancelled) return
			container.innerHTML = ''
			viewer = new JSONCanvasViewer(
				{
					container,
					canvas: data as ConstructorParameters<typeof JSONCanvasViewer>[0]['canvas'],
					parser,
					theme: isDark() ? 'dark' : 'light',
				},
				[Minimap, Controls],
			)
			const mainCanvas = container.querySelector<HTMLCanvasElement>('.JCV-main-canvas')
			if (mainCanvas) reportSizeInCssPixels(mainCanvas)
			observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
		})()

		return () => {
			cancelled = true
			observer.disconnect()
			container.innerHTML = ''
		}
	}, [canvas])

	return <div ref={ref} className="canvas-container not-content" />
}
