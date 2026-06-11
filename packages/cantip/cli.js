#!/usr/bin/env node
/**
 * `cantip` CLI — now a thin wrapper around the content generator.
 *
 * In the 0.2.x model the consumer owns the Remix app and runs their OWN
 * `vite`/`remix` scripts; the `cantip()` Vite plugin runs the generator
 * automatically before build/dev. This CLI just exposes a manual `cantip
 * generate` for one-off runs (e.g. CI prebuild, or regenerating without starting
 * Vite). dev/build/start are the consumer's own npm scripts.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const PKG_DIR = path.dirname(fileURLToPath(import.meta.url))
const GENERATE_JS = path.join(PKG_DIR, 'dist', 'generate-content.mjs')
const GENERATE_TS = path.join(PKG_DIR, 'scripts', 'generate-content.ts')

function run(cmd, args, opts = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: 'inherit', shell: false, ...opts })
		child.on('error', reject)
		child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))))
	})
}

/** Run the content generator from the user's cwd: compiled dist/ if present, else .ts source. */
function generate() {
	const args = existsSync(GENERATE_JS) ? [GENERATE_JS] : ['--experimental-strip-types', GENERATE_TS]
	return run(process.execPath, args, { cwd: process.cwd() })
}

const command = process.argv[2]
if (command === 'generate') {
	generate().catch((err) => {
		console.error(err.message ?? err)
		process.exit(1)
	})
} else {
	console.error(
		`cantip — docs engine\n\n` +
			`Usage: cantip generate\n\n` +
			`  generate   Ingest sources + compile content from docs.config.ts.\n\n` +
			`dev / build / start are your project's own scripts (the cantip() Vite\n` +
			`plugin runs generate automatically before build & dev).\n`,
	)
	process.exit(command ? 1 : 0)
}
