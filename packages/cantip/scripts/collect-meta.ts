/**
 * `_meta` collection — turns per-folder `_meta.{yaml,yml,json}` files in each
 * content source into `VirtualMeta[]` for the generated Source.
 *
 * A folder's `_meta` controls how `loader()` orders that folder's children
 * (pages AND subfolders, by their slugged name) and renames subfolders. It is
 * NEVER rendered as a page — it lives only in the source vault and is read here.
 *
 *   # source/advanced/_meta.yaml
 *   order:                 # children in this order; unlisted append alphabetically
 *     - getting-started
 *     - installation
 *     - sub-folder
 *   label:                 # rename subfolders (files take their title from frontmatter)
 *     sub-folder: Sub Folder
 *
 * The emitted `VirtualMeta.path` is the folder's id in the same space as page ids
 * (project output prefix + slugified relative dir), so `loader()` matches it to
 * the folder nodes it synthesizes from page ids. `order` entries are slugified the
 * same way, so authors may write either the raw folder/file name or its slug.
 */
import path from 'node:path'
import { glob } from 'tinyglobby'
import { readFile } from 'node:fs/promises'
import yaml from 'yaml'
import { slug } from 'github-slugger'
import decodeUriComponent from 'decode-uri-component'

import type { VirtualMeta } from '../src/source/types.ts'

const META_NAMES = ['_meta.yaml', '_meta.yml', '_meta.json']

/** Slugify one path segment exactly as `slugifyObsidianPath` does for folders. */
function slugSegment(segment: string): string {
	return slug(decodeUriComponent(segment))
}

/** Join + slugify a relative dir into the id space (no leading/trailing slash). */
function toFolderId(output: string, relDir: string): string {
	const segments = [...output.split('/'), ...relDir.split('/')]
		.map((s) => s.trim())
		.filter((s) => s && s !== '.')
	return segments.map(slugSegment).join('/')
}

/** Parse a raw `_meta` document into the `VirtualMeta` data shape, or null. */
function parseMeta(raw: string, isJson: boolean): VirtualMeta['data'] | null {
	let parsed: unknown
	try {
		parsed = isJson ? JSON.parse(raw) : yaml.parse(raw)
	} catch {
		return null
	}
	if (!parsed || typeof parsed !== 'object') return null
	const obj = parsed as Record<string, unknown>

	const data: VirtualMeta['data'] = {}

	// `order`: a list of child names; slugify so authors can write either the raw
	// name ("Sub Folder") or the slug ("sub-folder").
	if (Array.isArray(obj.order)) {
		data.order = obj.order.filter((v): v is string => typeof v === 'string').map(slugSegment)
	}

	// `label`: child-name → display label. Keys are slugified to match node ids;
	// values are kept verbatim. (A bare string label applies to the folder itself.)
	if (typeof obj.label === 'string') {
		data.label = obj.label
	} else if (obj.label && typeof obj.label === 'object') {
		const labels: Record<string, string> = {}
		for (const [k, v] of Object.entries(obj.label as Record<string, unknown>)) {
			if (typeof v === 'string') labels[slugSegment(k)] = v
		}
		if (Object.keys(labels).length > 0) data.childLabels = labels
	}

	if (data.order === undefined && data.label === undefined && data.childLabels === undefined) {
		return null
	}
	return data
}

/**
 * Scan every content source for `_meta` files and return them as `VirtualMeta[]`.
 * `vaults` is the generator's work-list: `{ vault: sourceDir, output: projectId }`.
 */
export async function collectMeta(
	vaults: { vault: string; output: string; ignore?: string[] }[],
	cwd: string,
	logger: { warn(m: string): void },
): Promise<VirtualMeta[]> {
	const metas: VirtualMeta[] = []
	const seen = new Set<string>()

	for (const v of vaults) {
		const sourceRoot = path.resolve(cwd, v.vault)
		const hits = await glob(
			META_NAMES.map((n) => `**/${n}`),
			{ cwd: sourceRoot, absolute: true, ignore: v.ignore ?? [] },
		)
		for (const file of hits) {
			const relDir = path.relative(sourceRoot, path.dirname(file)).replace(/\\/g, '/')
			const id = toFolderId(v.output, relDir)
			if (seen.has(id)) {
				logger.warn(`Duplicate _meta for folder "${id || '(root)'}"; keeping the first.`)
				continue
			}
			const raw = await readFile(file, 'utf8')
			const data = parseMeta(raw, file.endsWith('.json'))
			if (!data) continue
			seen.add(id)
			metas.push({ type: 'meta', path: id, data })
		}
	}
	return metas
}
