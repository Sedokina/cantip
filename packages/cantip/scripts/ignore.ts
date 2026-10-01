import path from 'node:path'
import { readFile } from 'node:fs/promises'
import ignore, { type Ignore } from 'ignore'
import { glob } from 'tinyglobby'

export const IGNORE_FILE_NAME = '.cantipignore'

/** Whether a path relative to the source folder (posix separators) is excluded. */
export type IsIgnored = (relativePath: string) => boolean

/**
 * Read every `.cantipignore` under `sourceDir` and return a check with git's
 * semantics: patterns are relative to their file's folder, a deeper file can
 * re-include with `!`, and nothing inside an ignored folder can be re-included.
 */
export async function loadIgnore(sourceDir: string): Promise<IsIgnored> {
	const files = await glob(`**/${IGNORE_FILE_NAME}`, { cwd: sourceDir, dot: true })
	// Shallow folders first, so deeper files override them.
	const matchers: { base: string; ignore: Ignore }[] = await Promise.all(
		files
			.sort((a, b) => a.split('/').length - b.split('/').length)
			.map(async (file) => ({
				base: path.posix.dirname(file) === '.' ? '' : path.posix.dirname(file),
				ignore: ignore().add(await readFile(path.join(sourceDir, file), 'utf8')),
			})),
	)
	if (matchers.length === 0) return () => false

	// `ignore` marks a folder by a trailing slash.
	const matches = (relativePath: string) => {
		let ignored = false
		for (const matcher of matchers) {
			const local = matcher.base ? relativePath.slice(matcher.base.length + 1) : relativePath
			// Skips paths outside the file's folder, and the folder itself.
			if ((matcher.base && !relativePath.startsWith(`${matcher.base}/`)) || local === '' || local === '/') continue
			const result = matcher.ignore.test(local)
			if (result.ignored) ignored = true
			else if (result.unignored) ignored = false
		}
		return ignored
	}

	const folderCache = new Map<string, boolean>()
	const isFolderIgnored = (folder: string): boolean => {
		if (folder === '') return false
		let ignored = folderCache.get(folder)
		if (ignored === undefined) {
			const parent = path.posix.dirname(folder)
			ignored = isFolderIgnored(parent === '.' ? '' : parent) || matches(`${folder}/`)
			folderCache.set(folder, ignored)
		}
		return ignored
	}

	return (relativePath) => {
		const folder = path.posix.dirname(relativePath)
		return isFolderIgnored(folder === '.' ? '' : folder) || matches(relativePath)
	}
}
