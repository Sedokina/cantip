#!/usr/bin/env node
/**
 * `create-kantip` — scaffold a new kantip docs site.
 *
 *   npm create kantip my-docs
 *   npm create kantip            # prompts/defaults to ./my-docs
 *
 * Copies the `template/` directory into the target, renaming `_package.json` →
 * `package.json` and `_gitignore` → `.gitignore`, and substituting the project
 * name + kantip version. Refuses to overwrite a non-empty target.
 */
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE_DIR = path.join(HERE, 'template')

/** kantip version to depend on — mirror create-kantip's own version. */
function kantipVersion() {
	try {
		const pkg = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'))
		// Pin to the same major.minor line so a fresh scaffold matches this CLI.
		return `^${pkg.version}`
	} catch {
		return 'latest'
	}
}

/** Files that need their leading underscore stripped (npm strips dotfiles from publishes). */
const RENAME = new Map([
	['_package.json', 'package.json'],
	['_gitignore', '.gitignore'],
])

/** Apply name/version substitutions to text files. */
function substitute(content, projectName) {
	return content
		.replaceAll('__PROJECT_NAME__', projectName)
		.replaceAll('__KANTIP_VERSION__', kantipVersion())
}

/** Files we run substitution on (others are copied verbatim — e.g. SVGs). */
const SUBSTITUTE_EXT = new Set(['.json', '.md', '.ts', '.tsx', ''])

function copyDir(srcDir, destDir, projectName) {
	fs.mkdirSync(destDir, { recursive: true })
	for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
		const srcPath = path.join(srcDir, entry.name)
		const outName = RENAME.get(entry.name) ?? entry.name
		const destPath = path.join(destDir, outName)
		if (entry.isDirectory()) {
			copyDir(srcPath, destPath, projectName)
		} else if (SUBSTITUTE_EXT.has(path.extname(entry.name))) {
			fs.writeFileSync(destPath, substitute(fs.readFileSync(srcPath, 'utf8'), projectName))
		} else {
			fs.copyFileSync(srcPath, destPath)
		}
	}
}

function main() {
	const targetArg = process.argv[2] || 'my-docs'
	const targetDir = path.resolve(process.cwd(), targetArg)
	const projectName = path.basename(targetDir)

	if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
		console.error(`✖ Target directory "${targetArg}" exists and is not empty. Aborting.`)
		process.exit(1)
	}

	console.log(`▶ Scaffolding a kantip docs site in ${targetDir}…`)
	copyDir(TEMPLATE_DIR, targetDir, projectName)

	console.log(
		`\n✔ Done. Next steps:\n\n` +
			`  cd ${targetArg}\n` +
			`  npm install\n` +
			`  npm run dev\n\n` +
			`Edit docs.config.ts to configure your site, and drop markdown into content/.\n`,
	)
}

main()
