/**
 * The `cantip` Vite plugin — `import { cantip } from 'cantip/vite'`.
 *
 * In the 0.2.x model the CONSUMER owns the Remix app (their own vite.config.ts +
 * app/ with re-export route stubs). This plugin supplies the docs engine to that
 * app:
 *  - runs the content generator (the markdown→HTML pipeline) before build and on
 *    content/config changes in dev, emitting `<cwd>/app/generated/*`;
 *  - registers the `~/*` and `~/generated/*` import aliases so cantip's
 *    re-exported routes/components (which live in node_modules/cantip/app and use
 *    `~/...` imports) resolve correctly inside the consumer's bundle.
 *
 * It deliberately does NOT touch `root`, `appDirectory`, `publicDir`, or the Remix
 * plugin — those belong to the consumer's own Remix setup. The consumer's `app/`
 * is the Remix app dir (holding the route stubs + entries); cantip's `app/` is
 * only an import target via the `~/*` alias.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import type { Plugin } from 'vite'

/**
 * Directory of the installed cantip package (…/node_modules/cantip). Resolved by
 * walking up from this module to the dir containing cantip's package.json —
 * works whether this runs as the bundled `dist/vite.mjs` (1 level deep) or the
 * `src/vite/plugin.ts` source (3 levels) in monorepo dev.
 */
function findPkgDir(): string {
	let dir = path.dirname(fileURLToPath(import.meta.url))
	while (!existsSync(path.join(dir, 'package.json'))) {
		const parent = path.dirname(dir)
		if (parent === dir) return dir // give up at fs root
		dir = parent
	}
	return dir
}
const PKG_DIR = findPkgDir()
const GENERATE_JS = path.join(PKG_DIR, 'dist', 'generate-content.mjs')
const GENERATE_TS = path.join(PKG_DIR, 'scripts', 'generate-content.ts')

export interface CantipPluginOptions {
	/**
	 * Re-run the generator on dev changes to these globs (relative to cwd).
	 * Defaults cover the config + common content dirs. The generator itself reads
	 * sources from `docs.config.ts`, so this only controls the dev watch trigger.
	 */
	watch?: string[]
}

/**
 * Run the content generator once, from the consumer's cwd. Resolves on success.
 *
 * `skipIfFresh` sets CANTIP_SKIP_IF_FRESH so the generator no-ops when its outputs
 * are already up-to-date. A `remix vite:build` runs two passes (client + SSR),
 * each with a fresh plugin instance; passing skipIfFresh collapses the redundant
 * second regen. The dev watcher passes false so an edit always regenerates.
 */
function runGenerate(cwd: string, skipIfFresh = false): Promise<void> {
	// Prefer the precompiled dist/ generator — Node won't strip TS types under
	// node_modules. Fall back to the .ts source (monorepo dev, symlinked).
	const args = existsSync(GENERATE_JS) ? [GENERATE_JS] : ['--experimental-strip-types', GENERATE_TS]
	const env = skipIfFresh ? { ...process.env, CANTIP_SKIP_IF_FRESH: '1' } : process.env
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, args, { cwd, stdio: 'inherit', env })
		child.on('error', reject)
		child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`cantip generate exited with ${code}`))))
	})
}

/**
 * The cantip Vite plugin. Add it to your `vite.config.ts` plugins array, before
 * the Remix plugin:
 *
 *   import { cantip } from 'cantip/vite'
 *   export default defineConfig({ plugins: [cantip(), remix()] })
 */
export function cantip(options: CantipPluginOptions = {}): Plugin {
	const cwd = process.cwd()
	const generatedDir = path.join(cwd, 'app', 'generated')
	const cantipApp = path.join(PKG_DIR, 'app')
	let didGenerate = false

	return {
		name: 'cantip',

		// Register the import aliases cantip's bundled routes/components rely on.
		// `~/generated/*` → the consumer's generated artifacts (ui.ts; content.json
		// + site.json are read via fs, not aliased); `~/*` → cantip's own app/.
		// `~/generated` must precede `~/` (Vite matches alias entries in order).
		config() {
			return {
				resolve: {
					alias: [
						{ find: /^~\/generated\//, replacement: generatedDir + '/' },
						{ find: /^~\//, replacement: cantipApp + '/' },
					],
				},
			}
		},

		// Generate before the build (and before the dev server's first request).
		// `buildStart` runs for both `vite build` and `vite dev`.
		//
		// CANTIP_SKIP_GENERATE: when set, skip generation entirely. The caller
		// guarantees `app/generated/*` is already up-to-date (e.g. a Docker
		// entrypoint that ran `cantip generate` once, then builds). Deterministic —
		// no mtime guessing — and avoids the redundant regen on each of a build's
		// client+SSR passes (separate plugin instances, so `didGenerate` can't span
		// them). For non-orchestrated builds, `skipIfFresh` still collapses the
		// repeated passes via the generator's freshness check.
		async buildStart() {
			// Honor the skip only when the generated content actually exists — guards
			// against a misconfigured CANTIP_SKIP_GENERATE producing an empty site.
			if (process.env.CANTIP_SKIP_GENERATE && existsSync(path.join(generatedDir, 'content.json'))) {
				return
			}
			if (didGenerate) return
			didGenerate = true
			await runGenerate(cwd, true)
		},

		// Dev: re-generate when the config or content changes, then let Remix's HMR
		// pick up the refreshed generated modules.
		configureServer(server) {
			const watch = options.watch ?? ['docs.config.ts', 'docs.config.js', 'docs.config.mjs']
			for (const w of watch) server.watcher.add(path.join(cwd, w))
			let regenerating = false
			const onChange = async (file: string) => {
				// Ignore writes to the generated dir itself (avoids a regenerate loop).
				if (file.startsWith(generatedDir)) return
				const rel = path.relative(cwd, file)
				const isConfig = /^docs\.config\.(ts|js|mjs)$/.test(rel)
				if (!isConfig) return
				if (regenerating) return
				regenerating = true
				try {
					await runGenerate(cwd)
				} catch (err) {
					server.config.logger.error(`cantip: regenerate failed — ${(err as Error).message}`)
				} finally {
					regenerating = false
				}
			}
			server.watcher.on('change', onChange)
			server.watcher.on('add', onChange)
		},
	}
}

export default cantip
