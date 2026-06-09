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

// The engine ships the Remix `app/` (routes/components/entries); the user's
// project (cwd) owns content, config, generated artifacts, public/, and build/.
//
// Vite `root` = the USER's cwd. This is what makes Remix compute a CORRECT,
// cwd-relative `assetsBuildDirectory` (`build/client`): remix-serve resolves that
// path with `express.static` from the serve cwd, so it MUST be relative to cwd,
// not the engine. (Setting root to the engine made it `../../build/client`
// relative to the engine — a path that 404s every asset at serve time.)
//
// Because the engine ships explicit `app/entry.{server,client}.tsx`, Remix skips
// its server-runtime auto-detection (which would otherwise demand
// `@remix-run/node` in the user's package.json) — so no REMIX_ROOT hack needed.
const ENGINE_DIR = path.dirname(fileURLToPath(import.meta.url))
const USER_CWD = process.cwd()

export default defineConfig({
	root: USER_CWD,
	// Serve the user's public/ (logos, favicon, generated /pagefind, project assets).
	publicDir: path.join(USER_CWD, 'public'),
	plugins: [
		tailwindcss(),
		remix({
			ssr: true,
			// The engine's app/ dir (absolute) — the single source of routes/components.
			appDirectory: path.join(ENGINE_DIR, 'app'),
			// Build under the user's cwd (relative to root=cwd) so `cantip start`
			// finds it AND the baked asset path stays cwd-relative.
			buildDirectory: 'build',
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
