import { useEffect } from 'react'

/** True when the app is currently in dark mode (the `.dark` class on <html>). */
function isDark(): boolean {
	return document.documentElement.classList.contains('dark')
}

/**
 * Mounts any `[data-canvas-mount]` containers in the current page using the
 * json-canvas-viewer library (loaded lazily, client-only). Re-runs whenever the
 * given key changes (i.e. on each navigation) so freshly-rendered canvas pages
 * get initialised. Ported 1:1 from the inline script in the old DocsLayout.astro.
 *
 * The viewer ships its own built-in `light`/`dark` palettes (background, cards,
 * borders, dot grid, text) and defaults to `light`. We pass the current app
 * theme on init and keep each mounted viewer in sync with the `.dark` class via
 * a MutationObserver, so the canvas matches the rest of the site when the user
 * toggles the theme.
 */
export default function CanvasMount({ deps }: { deps: string }) {
	useEffect(() => {
		let cancelled = false
		const viewers: Array<{ changeTheme: (theme?: 'dark' | 'light') => void }> = []
		const containers = document.querySelectorAll<HTMLElement>('[data-canvas-mount]')
		if (containers.length === 0) return

		;(async () => {
			const { JSONCanvasViewer, parser, Minimap, Controls } = await import('json-canvas-viewer')
			if (cancelled) return
			const theme = isDark() ? 'dark' : 'light'
			containers.forEach((container) => {
				const dataEl = container.querySelector<HTMLScriptElement>('script[type="application/json"]')
				if (!dataEl) return
				const canvas = JSON.parse(dataEl.textContent || '{"nodes":[],"edges":[]}')
				container.removeAttribute('data-canvas-mount')
				container.innerHTML = ''
				const viewer = new JSONCanvasViewer({ container, canvas, parser, theme }, [
					Minimap,
					Controls,
				])
				viewers.push(viewer)
			})
		})()

		// Re-theme mounted viewers whenever the app toggles its `.dark` class.
		const observer = new MutationObserver(() => {
			const theme = isDark() ? 'dark' : 'light'
			viewers.forEach((viewer) => viewer.changeTheme(theme))
		})
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class'],
		})

		return () => {
			cancelled = true
			observer.disconnect()
		}
	}, [deps])

	return null
}
