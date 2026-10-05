/**
 * The `cantip` Vite plugin — `import { cantip } from 'cantip/vite'`.
 *
 * In the 0.2.x model the CONSUMER owns the Remix app (their own vite.config.ts +
 * app/ with re-export route stubs). This plugin supplies the docs engine to that
 * app:
 *  - runs the content generator (the markdown→HTML pipeline) before build and on
 *    source/config changes in dev, emitting `<cwd>/app/generated/*`, then reloads
 *    the browser;
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
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import type { Plugin, ViteDevServer } from 'vite'

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

const CONFIG_FILES = ['docs.config.ts', 'docs.config.js', 'docs.config.mjs']
// The generator writes into these. A source folder may contain them (e.g. `source: '.'`),
// and reacting to the generator's own output would regenerate forever.
const OUTPUT_DIRS = ['app/generated', 'content', 'public', 'build', 'node_modules', '.git']
const WATCH_EVENTS = ['add', 'change', 'unlink', 'addDir', 'unlinkDir'] as const
// Saving one note can fire several events, and editors often save in bursts.
const REGENERATE_DELAY_MS = 200

export interface CantipPluginOptions {
	/**
	 * Extra files or folders (relative to cwd) whose changes re-run the generator in
	 * dev. The config file and every source folder from `docs.config.ts` are always
	 * watched; use this for other inputs the generator reads.
	 */
	watch?: string[]
}

function isInside(file: string, dir: string) {
	return file === dir || file.startsWith(dir + path.sep)
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
	const outputDirs = OUTPUT_DIRS.map((dir) => path.join(cwd, dir))
	let didGenerate = false
	let isRemixChildCompiler = false
	let devServer: ViteDevServer | undefined
	let watchedPaths = new Set<string>()

	const isWatchedInput = (file: string) =>
		!outputDirs.some((dir) => isInside(file, dir)) && [...watchedPaths].some((p) => isInside(file, p))

	// The generator lists the source folders in watch.json, so the plugin never has
	// to load the TS config itself. Re-read after every run: the config may have
	// added or moved a source.
	function watchSources() {
		if (!devServer) return
		let sources: string[] = []
		try {
			sources = (JSON.parse(readFileSync(path.join(generatedDir, 'watch.json'), 'utf8')) as { sources: string[] }).sources
		} catch {
			// No watch.json yet: only the config and `options.watch` are watched until the first run.
		}
		const paths = [...CONFIG_FILES, ...(options.watch ?? [])].map((p) => path.resolve(cwd, p)).concat(sources)
		devServer.watcher.add(paths.filter((p) => !watchedPaths.has(p)))
		watchedPaths = new Set(paths)
	}

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
			if (didGenerate || isRemixChildCompiler) return
			didGenerate = true
			await runGenerate(cwd, true)
			watchSources()
		},

		// Dev: regenerate when the config or a source file changes, then reload the
		// browser. The server picks up the new data itself (see site.server.ts).
		configureServer(server) {
			// Remix starts a child Vite server with its own instance of this plugin and
			// every plugin except `remix`. Generating and watching there too would run
			// the generator twice in parallel on the same output folders.
			if (!server.config.plugins.some((plugin) => plugin.name === 'remix')) {
				isRemixChildCompiler = true
				return
			}
			devServer = server
			watchSources()

			let timer: NodeJS.Timeout | undefined
			let running = false
			let pending = false

			// One run at a time. Changes during a run trigger exactly one more run, so
			// no edit is lost and a burst of saves costs at most two runs.
			async function regenerate() {
				if (running) {
					pending = true
					return
				}
				running = true
				let anySucceeded = false
				try {
					do {
						pending = false
						try {
							await runGenerate(cwd)
							anySucceeded = true
						} catch (err) {
							server.config.logger.error(`cantip: regenerate failed — ${(err as Error).message}`)
						}
					} while (pending)
				} finally {
					running = false
				}
				if (anySucceeded) {
					watchSources()
					server.ws.send({ type: 'full-reload' })
				}
			}

			const onChange = (file: string) => {
				if (!isWatchedInput(file)) return
				clearTimeout(timer)
				timer = setTimeout(regenerate, REGENERATE_DELAY_MS)
			}
			for (const event of WATCH_EVENTS) server.watcher.on(event, onChange)
		},

		// Tailwind scans source files for class names, so Vite reloads the browser as
		// soon as a note changes, before the regenerate has finished. The reload after
		// the regenerate is the one that shows the new content.
		handleHotUpdate({ file }) {
			if (isWatchedInput(file)) return []
		},
	}
}

export default cantip
