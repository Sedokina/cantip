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

type Viewer = {
	changeTheme: (theme?: 'dark' | 'light') => void
	zoom: (factor: number, origin: { x: number; y: number }) => void
	pan: (delta: { x: number; y: number }) => void
}

// One mouse-wheel notch (deltaY 100) zooms by 1.2×.
const ZOOM_PER_PIXEL = Math.log(1.2) / 100
const PIXELS_PER_LINE = 40

/**
 * Replaces the viewer's wheel handling. pointeract, the viewer's input library,
 * switches for good to a touchpad scheme after the first wheel event with Shift
 * or Ctrl held. From then on the wheel pans instead of zooming, and Ctrl+wheel
 * multiplies the scale by `1 - 0.1 * deltaY`, so one mouse notch jumps to the
 * scale limit. Here the wheel always zooms, Shift+wheel pans horizontally,
 * Alt+wheel pans vertically, and the zoom factor is exponential in deltaY, so a mouse notch and a touchpad pinch
 * both zoom by a proportionate step.
 */
function handleWheel(event: WheelEvent, viewer: Viewer, container: HTMLElement) {
	event.preventDefault()
	event.stopPropagation()
	// Firefox can report deltas in lines instead of pixels.
	const pixels = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? PIXELS_PER_LINE : 1
	if (event.shiftKey) {
		// Most browsers turn Shift+wheel into deltaX, but not all of them.
		viewer.pan({ x: -(event.deltaX || event.deltaY) * pixels, y: 0 })
		return
	}
	if (event.altKey) {
		viewer.pan({ x: 0, y: -(event.deltaY || event.deltaX) * pixels })
		return
	}
	const rect = container.getBoundingClientRect()
	viewer.zoom(Math.exp(-event.deltaY * pixels * ZOOM_PER_PIXEL), {
		x: event.clientX - rect.left,
		y: event.clientY - rect.top,
	})
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
		let viewer: Viewer | undefined
		const observer = new MutationObserver(() => {
			viewer?.changeTheme(isDark() ? 'dark' : 'light')
		})
		const onWheel = (event: WheelEvent) => {
			if (viewer) handleWheel(event, viewer, container)
		}
		// Capture on the outer container runs before pointeract's listener on the
		// viewer's inner element, so stopPropagation keeps the event from it.
		container.addEventListener('wheel', onWheel, { capture: true, passive: false })

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
			container.removeEventListener('wheel', onWheel, { capture: true })
			container.innerHTML = ''
		}
	}, [canvas])

	return <div ref={ref} className="canvas-container not-content" />
}
