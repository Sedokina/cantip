#!/usr/bin/env node
/**
 * `cantip` CLI — drives the docs engine from the USER's project directory.
 *
 * The engine (this package) ships the Remix `app/` + build `scripts/`. The CLI
 * runs them with `cwd = the user's project`, so all artifacts (content/,
 * app/generated/, public/, build/) land in the user's repo while the app code
 * stays in node_modules. Vite/Remix always load the engine's vite.config.ts
 * (which points `appDirectory` at the engine app/ and `publicDir`/build at cwd).
 *
 * Subcommands:
 *   cantip generate   — ingest vaults + compile + emit manifest/config (from docs.config.ts)
 *   cantip dev        — generate, then remix vite dev server
 *   cantip build      — generate, then remix vite production build
 *   cantip start      — serve the built server (build/server/index.js)
 *   cantip typecheck  — tsc --noEmit against the engine
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ENGINE_DIR = path.dirname(fileURLToPath(import.meta.url))
const VITE_CONFIG = path.join(ENGINE_DIR, 'vite.config.ts')
// Prefer the precompiled generator (dist/) — required when installed under
// node_modules, where Node won't strip types from `.ts`. Fall back to the `.ts`
// source via the strip-types runner in the monorepo dev setup (symlinked, where
// dist/ may be absent).
const GENERATE_JS = path.join(ENGINE_DIR, 'dist', 'generate-content.mjs')
const GENERATE_TS = path.join(ENGINE_DIR, 'scripts', 'generate-content.ts')

/** Run a command inheriting stdio; resolve on exit 0, reject otherwise. */
function run(cmd, args, opts = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: 'inherit', shell: false, ...opts })
		child.on('error', reject)
		child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`))))
	})
}

/**
 * Resolve a dependency's CLI binary. npm may install it in the engine's local
 * `node_modules/.bin` OR hoist it to an ancestor `node_modules/.bin` (workspaces).
 * Walk up from the engine dir to find the first `.bin/<name>` that exists; fall
 * back to the bare name so PATH resolution can still find it.
 */
function engineBin(name) {
	let dir = ENGINE_DIR
	while (true) {
		const candidate = path.join(dir, 'node_modules', '.bin', name)
		if (existsSync(candidate)) return candidate
		const parent = path.dirname(dir)
		if (parent === dir) break
		dir = parent
	}
	return name
}

/** Run the content generator from the user's cwd: compiled dist/ if present, else the .ts source. */
function generate() {
	const args = existsSync(GENERATE_JS)
		? [GENERATE_JS]
		: ['--experimental-strip-types', GENERATE_TS]
	return run(process.execPath, args, { cwd: process.cwd() })
}

/**
 * Run the Remix Vite CLI with the engine config from the user's cwd. The vite
 * config sets Vite `root` = cwd (so baked asset paths are cwd-relative and
 * remix-serve finds them) and `appDirectory` = the engine app/. The engine ships
 * explicit entry.server/.client, so Remix skips runtime auto-detection — no
 * REMIX_ROOT override needed.
 */
function remixVite(sub) {
	return run(engineBin('remix'), ['vite:' + sub, '--config', VITE_CONFIG], {
		cwd: process.cwd(),
	})
}

async function main() {
	const command = process.argv[2]
	switch (command) {
		case 'generate':
			await generate()
			break
		case 'dev':
			await generate()
			await remixVite('dev')
			break
		case 'build':
			await generate()
			await remixVite('build')
			break
		case 'start':
			await run(engineBin('remix-serve'), [path.join(process.cwd(), 'build', 'server', 'index.js')], { cwd: process.cwd() })
			break
		case 'typecheck':
			await run(engineBin('tsc'), ['--noEmit'], { cwd: ENGINE_DIR })
			break
		default:
			console.error(
				`cantip — config-driven Remix docs engine\n\n` +
					`Usage: cantip <command>\n\n` +
					`Commands:\n` +
					`  generate    Ingest vaults + compile content from docs.config.ts\n` +
					`  dev         Generate, then start the dev server\n` +
					`  build       Generate, then build for production\n` +
					`  start       Serve the production build\n` +
					`  typecheck   Type-check the engine\n`,
			)
			process.exit(command ? 1 : 0)
	}
}

main().catch((err) => {
	console.error(err.message ?? err)
	process.exit(1)
})
