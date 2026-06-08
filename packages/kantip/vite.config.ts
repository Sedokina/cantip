import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { vitePlugin as remix } from '@remix-run/dev'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

declare module '@remix-run/node' {
	interface Future {
		v3_singleFetch: true
	}
}

// Engine root = this package dir (where `app/` and the engine's node_modules
// live). The Remix app is ALWAYS this package's `app/`, even when the CLI is
// invoked from a user's project: the app code ships with the engine, while the
// user's content/config/generated artifacts are read from `process.cwd()` by the
// `.server` modules. Public assets are served from the USER's `public/` so their
// logos/favicon/generated pagefind resolve.
const ENGINE_DIR = path.dirname(fileURLToPath(import.meta.url))
const USER_CWD = process.cwd()

export default defineConfig({
	// Resolve the app + engine deps from the package, not the user's cwd.
	root: ENGINE_DIR,
	// Serve the user's public/ (logos, favicon, generated /pagefind, project assets).
	publicDir: path.join(USER_CWD, 'public'),
	plugins: [
		tailwindcss(),
		remix({
			ssr: true,
			// The engine's app/ dir (absolute) — the single source of routes/components.
			appDirectory: path.join(ENGINE_DIR, 'app'),
			// Emit the build under the USER's cwd so `kantip start` finds it there.
			buildDirectory: path.join(USER_CWD, 'build'),
			future: {
				v3_fetcherPersist: true,
				v3_relativeSplatPath: true,
				v3_throwAbortReason: true,
				v3_singleFetch: true,
				v3_lazyRouteDiscovery: true,
			},
		}),
	],
	resolve: {
		alias: [
			// `~/generated/*` → the USER's generated dir. The generator writes the
			// importable modules (site.ts, slots.ts, theme.generated.css) under the
			// user's cwd, so the alias must resolve there — NOT the engine's stale
			// seed. Must precede the broader `~` alias (Vite matches in order).
			{ find: /^~\/generated\//, replacement: path.join(USER_CWD, 'app', 'generated') + '/' },
			// `~/*` → engine app dir (everything else: components, lib, styles, routes).
			{ find: /^~\//, replacement: path.join(ENGINE_DIR, 'app') + '/' },
		],
	},
})
