import { vitePlugin as remix } from '@remix-run/dev'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { cantip } from 'cantip/vite'

declare module '@remix-run/node' {
	interface Future {
		v3_singleFetch: true
	}
}

// This is YOUR Remix app — edit freely. `cantip()` runs the docs content
// pipeline (markdown → HTML) before build/dev and wires the `~/*` aliases its
// routes/components use; `remix()` and `tailwindcss()` are the standard plugins.
export default defineConfig({
	plugins: [
		cantip(),
		tailwindcss(),
		remix({
			ssr: true,
			future: {
				v3_fetcherPersist: true,
				v3_relativeSplatPath: true,
				v3_throwAbortReason: true,
				v3_singleFetch: true,
				v3_lazyRouteDiscovery: true,
			},
		}),
	],
})
