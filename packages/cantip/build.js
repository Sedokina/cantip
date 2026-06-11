#!/usr/bin/env node
/**
 * Engine build step (run before publish).
 *
 * Node's `--experimental-strip-types` refuses to run `.ts` files under
 * `node_modules`, so the standalone build scripts (run directly by Node, not by
 * Vite) must ship as `.js`. We bundle them to `dist/` with esbuild, inlining the
 * shared `app/lib/config/*` modules and externalizing real npm deps (resolved
 * from the installed engine's node_modules at runtime).
 *
 * Outputs:
 *   dist/generate-content.mjs  — the content generator the plugin/CLI runs
 *   dist/config.mjs            — the `cantip/config` entry (defineConfig + schema)
 *   dist/vite.mjs              — the `cantip/vite` plugin entry
 *
 * The user's own `docs.config.ts` is NOT bundled: it lives in their cwd (where
 * type-stripping is allowed) and imports `cantip/config` → dist/config.mjs (JS),
 * so the chain no longer hits a `.ts` file under node_modules.
 */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** Resolve a local bin, walking up to an ancestor node_modules/.bin (workspaces). */
function findBin(name) {
	let dir = HERE
	while (true) {
		const candidate = path.join(dir, 'node_modules', '.bin', name)
		if (existsSync(candidate)) return candidate
		const parent = path.dirname(dir)
		if (parent === dir) return name
		dir = parent
	}
}

/** Run a bin and reject on non-zero exit. */
function run(bin, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(findBin(bin), args, { cwd: HERE, stdio: 'inherit' })
		child.on('error', reject)
		child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${bin} exited with ${code}`))))
	})
}

/**
 * Bundle one entry.
 * @param {string} entry  source path
 * @param {string} outfile  output path
 * @param {object} [opts]
 * @param {boolean} [opts.inlineDeps]  bundle npm deps INTO the output instead of
 *   leaving them external. Used for the generator so its markdown pipeline
 *   (remark/rehype/…) ships self-contained in dist/ — consumers then don't need
 *   those deps at runtime (they become cantip's devDependencies).
 * @param {string[]} [opts.external]  packages to keep external even when inlining
 *   (optional/native deps loaded dynamically, e.g. pagefind).
 */
async function bundle(entry, outfile, opts = {}) {
	await build({
		entryPoints: [path.join(HERE, entry)],
		outfile: path.join(HERE, outfile),
		bundle: true,
		platform: 'node',
		format: 'esm',
		target: 'node20',
		// Either keep ALL npm deps external (small entries that resolve from the
		// engine's deps) or inline them (the generator → self-contained).
		...(opts.inlineDeps
			? {
					external: opts.external ?? [],
					// Bundled CJS deps may call `require`/`__dirname`; in an ESM output
					// those aren't defined. Recreate them from import.meta so the
					// self-contained generator runs under plain `node`.
					banner: {
						js: [
							"import { createRequire as __cr } from 'node:module';",
							"import { fileURLToPath as __ftp } from 'node:url';",
							"import { dirname as __dn } from 'node:path';",
							'const require = __cr(import.meta.url);',
							'const __filename = __ftp(import.meta.url);',
							'const __dirname = __dn(__filename);',
						].join('\n'),
					},
				}
			: { packages: 'external' }),
		logLevel: 'info',
	})
}

// The generator ships SELF-CONTAINED: its lightweight markdown pipeline
// (remark/rehype/mdast/unist/unified/vfile/hast/github-slugger/yaml/katex) is
// bundled in, so the consumer needs none of those at runtime (cantip devDeps).
// A few HEAVY/native deps stay external and remain real (optional) deps, resolved
// from node_modules when actually used:
//   - pagefind        native search-index binary, dynamic-imported
//   - rehype-mermaid  pulls in playwright/chromium-bidi (only for mermaid diagrams)
await bundle('scripts/generate-content.ts', 'dist/generate-content.mjs', {
	inlineDeps: true,
	external: ['pagefind', 'rehype-mermaid'],
})
await bundle('app/lib/config/schema.ts', 'dist/config.mjs')
await bundle('src/vite/plugin.ts', 'dist/vite.mjs')

// Emit type declarations for the package's exports, then rewrite the internal
// `~/*` import aliases to real relative paths so CONSUMERS get clean types and
// never see cantip's internal alias. Without this, a consumer's `tsc` follows the
// re-export stubs into cantip's `.tsx` source and trips on `~/...` imports.
console.log('▶ Emitting type declarations…')
await run('tsc', ['-p', 'tsconfig.build.json'])
await run('tsc-alias', ['-p', 'tsconfig.build.json'])

console.log('✔ Engine build complete → dist/')
