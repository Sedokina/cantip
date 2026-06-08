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
 *   dist/generate-content.mjs  — the content generator the CLI runs
 *   dist/config.mjs            — the `kantip/config` entry (defineConfig + schema)
 *
 * The user's own `docs.config.ts` is NOT bundled: it lives in their cwd (where
 * type-stripping is allowed) and imports `kantip/config` → dist/config.mjs (JS),
 * so the chain no longer hits a `.ts` file under node_modules.
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** Bundle one entry, externalizing all bare-specifier (npm) imports. */
async function bundle(entry, outfile) {
	await build({
		entryPoints: [path.join(HERE, entry)],
		outfile: path.join(HERE, outfile),
		bundle: true,
		platform: 'node',
		format: 'esm',
		target: 'node20',
		// Keep npm deps external (resolved at runtime from the engine's
		// node_modules); only our own relative `.ts` sources get inlined. The user
		// docs.config import is dynamic (import(variable)) so esbuild leaves it
		// external automatically.
		packages: 'external',
		logLevel: 'info',
	})
}

await bundle('scripts/generate-content.ts', 'dist/generate-content.mjs')
await bundle('app/lib/config/schema.ts', 'dist/config.mjs')

console.log('✔ Engine build complete → dist/')
