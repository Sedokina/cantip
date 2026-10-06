import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Directory of the installed cantip package (…/node_modules/cantip). Resolved by
 * walking up from this module to the dir containing cantip's package.json —
 * works whether this runs as the bundled `dist/vite.mjs` (1 level deep) or the
 * `src/vite/plugin.ts` source (3 levels) in monorepo dev.
 */
export function findPkgDir(): string {
	let dir = path.dirname(fileURLToPath(import.meta.url))
	while (!existsSync(path.join(dir, 'package.json'))) {
		const parent = path.dirname(dir)
		if (parent === dir) return dir // give up at fs root
		dir = parent
	}
	return dir
}
