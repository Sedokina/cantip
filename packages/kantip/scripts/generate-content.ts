import fs from 'node:fs/promises'
import path from 'node:path'
import { generateObsidian } from './obsidian/generate.ts'
import { generateCanvas } from './canvas-to-md.ts'
import { compileDir, type CompiledDoc } from './compile.ts'
import { buildSearchIndex } from './build-search-index.ts'
import { buildIdToCanonicalUrl } from './canonical.ts'
import type { Logger } from './obsidian/logger.ts'
import { loadConfig } from '../app/lib/config/load.ts'
import type { DocsConfig } from '../app/lib/config/schema.ts'
import { emitGeneratedConfig } from './emit-config.ts'

const logger: Logger = {
	info: (m) => console.log(`  ${m}`),
	warn: (m) => console.warn(`  ⚠ ${m}`),
	error: (m) => console.error(`  ✖ ${m}`),
}

// All build artifacts live under the USER's cwd (not inside the engine package),
// matching the runtime contract in `app/lib/content.server.ts` + `config.server.ts`.
const CWD = process.cwd()
const CONTENT_ROOT = path.resolve(CWD, 'content')
const PUBLIC_ROOT = path.resolve(CWD, 'public')
const MANIFEST_DIR = path.resolve(CWD, 'app/generated')
const OUTPUT_ROOTS = { content: CONTENT_ROOT, public: PUBLIC_ROOT }

/**
 * Derive the ingestion work-lists from the resolved config. Each project (and the
 * optional `general` bucket, when it has a `source`) becomes one vault; projects
 * flagged `canvas` additionally feed the canvas pass. `output` is the project id
 * — the first id segment of every doc it produces — except the general bucket,
 * whose docs sit at the root (output `.`).
 */
function buildWorkLists(config: DocsConfig) {
	const vaults = config.projects.map((p) => ({ vault: p.source, output: p.id, ignore: p.ignore }))
	const canvas = config.projects
		.filter((p) => p.canvas)
		.map((p) => ({ vault: p.source, output: p.id }))

	if (config.general.enabled && config.general.source) {
		// General docs live at the root: output '.' writes straight into content/.
		vaults.push({ vault: config.general.source, output: '.', ignore: config.general.ignore })
	}
	return { vaults, canvas }
}

/**
 * Rewrite internal links in every doc's HTML to canonical (permalink) URLs.
 *
 * Wikilink hrefs are emitted by the Obsidian pass as percent-encoded file-path
 * URLs without a trailing slash, e.g. `/krista/%D0%B3.../%D0%BA...`. We decode
 * each href, match it against a doc id, and if that doc's canonical URL differs
 * from its file-path URL (i.e. it has a permalink) we swap the href in place.
 * Any anchor (#heading) is preserved. Mutates `docs[].html`; returns the count.
 */
function rewriteContentLinks(docs: CompiledDoc[], canonicalUrl: Map<string, string>): number {
	let count = 0
	for (const d of docs) {
		d.html = d.html.replace(/href="(\/[^"#]+)(#[^"]*)?"/g, (whole, rawPath: string, anchor?: string) => {
			// Decode and normalize to an id (no leading/trailing slash) for lookup.
			let decoded: string
			try {
				decoded = decodeURIComponent(rawPath)
			} catch {
				return whole // malformed escape — leave untouched
			}
			const id = decoded.replace(/^\/+|\/+$/g, '')
			const canonical = canonicalUrl.get(id)
			// Only rewrite when the target is a known doc WITH a permalink (its
			// canonical URL differs from the default file-path form).
			if (!canonical || canonical === `/${id}/`) return whole
			count++
			return `href="${canonical}${anchor ?? ''}"`
		})
	}
	return count
}

async function main() {
	const start = performance.now()
	console.log('▶ Generating content from Obsidian vaults…')

	// 0. Load the user's docs.config.ts (resolved + validated) from cwd.
	const config = await loadConfig(CWD)
	const { vaults, canvas } = buildWorkLists(config)

	// 1. Clean previous content output (asset/public cleanup is handled per-vault).
	await fs.rm(CONTENT_ROOT, { recursive: true, force: true })

	// 2. Ingest each vault → content/<output>/*.md  (+ assets to public/<output>).
	//    Run the general bucket (output '.') first so its root-level write lands
	//    before project subdirs (it skips per-vault cleanup to avoid wiping them).
	const orderedVaults = [...vaults].sort((a, b) => (a.output === '.' ? -1 : b.output === '.' ? 1 : 0))
	for (const v of orderedVaults) {
		await generateObsidian(v, logger, OUTPUT_ROOTS)
	}

	// 3. Convert .canvas files → content/<output>/*.md
	for (const c of canvas) {
		await generateCanvas({ ...c, contentRoot: CONTENT_ROOT }, logger)
	}

	// 4. Compile every markdown page → HTML + headings + frontmatter
	const docs = await compileDir(CONTENT_ROOT, logger)

	// 4b. Rewrite in-content links to canonical URLs. Wikilinks are resolved to
	//     file-path hrefs (/{id}/) during the per-vault Obsidian pass, before the
	//     permalink map exists. Now that every doc is compiled we know which docs
	//     have permalinks, so we rewrite any internal href pointing at such a doc
	//     to its permalink — internal links then skip the file-path→permalink 301.
	const canonicalUrl = buildIdToCanonicalUrl(docs)
	const rewrites = rewriteContentLinks(docs, canonicalUrl)
	if (rewrites > 0) {
		logger.info(`Rewrote ${rewrites} in-content link(s) to permalinks.`)
	}

	// 5. Emit manifest. One index file (lightweight, for the sidebar/routing) and
	//    one HTML file per doc (loaded by the route loader on demand).
	await fs.rm(MANIFEST_DIR, { recursive: true, force: true })
	await fs.mkdir(path.join(MANIFEST_DIR, 'docs'), { recursive: true })

	const index = docs
		.map((d) => ({
			id: d.id,
			title: (d.frontmatter.title as string | undefined) ?? null,
			draft: d.frontmatter.draft === true,
			tableOfContents: d.frontmatter.tableOfContents !== false,
			tags: (d.frontmatter.tags as string[] | undefined) ?? [],
			isCanvas: d.html.includes('data-canvas-mount'),
		}))
		.sort((a, b) => a.id.localeCompare(b.id, config.site.lang))

	await fs.writeFile(path.join(MANIFEST_DIR, 'index.json'), JSON.stringify(index))

	// Permalink map: a doc may pin a stable URL via `permalink` in its Obsidian
	// frontmatter (carried through to the generated frontmatter under the same
	// key). This URL is independent of the file name, so renames never break it.
	// We store
	// permalink → id; the route loader serves the doc at the permalink and
	// redirects the file-path URL to it (the permalink is the canonical URL).
	//
	// Permalinks are PROJECT-SCOPED: the key is prefixed with the doc's project
	// (the first id segment, same rule as getProjectIdForDoc). So `permalink:
	// /abc/123` in a krista doc is served at /krista/abc/123/, and a same-named
	// permalink in another project (krista-partners/abc/123) never collides.
	const permalinks: Record<string, string> = {}
	for (const d of docs) {
		const raw = d.frontmatter.permalink
		if (typeof raw !== 'string' || raw.trim() === '') continue
		const rel = raw.trim().replace(/^\/+|\/+$/g, '') // normalize: no leading/trailing slashes
		if (!rel) continue
		const project = d.id.split('/')[0] // doc's project = first id segment
		const key = `${project}/${rel}`
		if (permalinks[key] && permalinks[key] !== d.id) {
			logger.warn(`Duplicate permalink "${raw}" in project "${project}" on ${d.id} (already used by ${permalinks[key]}); keeping the first.`)
			continue
		}
		permalinks[key] = d.id
	}
	await fs.writeFile(path.join(MANIFEST_DIR, 'permalinks.json'), JSON.stringify(permalinks))
	if (Object.keys(permalinks).length > 0) {
		logger.info(`Registered ${Object.keys(permalinks).length} permalink(s).`)
	}

	// One JSON per doc, mirroring the content directory structure so individual
	// path segments stay within the filesystem's 255-byte filename limit (the
	// Cyrillic ids percent-encode to very long single strings otherwise).
	await Promise.all(
		docs.map(async (d) => {
			const outPath = path.join(MANIFEST_DIR, 'docs', `${d.id}.json`)
			await fs.mkdir(path.dirname(outPath), { recursive: true })
			await fs.writeFile(
				outPath,
				JSON.stringify({ id: d.id, frontmatter: d.frontmatter, headings: d.headings, html: d.html }),
			)
		}),
	)

	// 6. Build the Pagefind search index from the compiled docs → public/pagefind
	await buildSearchIndex(docs, canonicalUrl, logger, {
		outputPath: path.join(PUBLIC_ROOT, 'pagefind'),
		lang: config.site.lang,
	})

	// 7. Emit the resolved config so the running app can read it without ever
	//    importing the user's TS config: `config.json` (full, read via fs in
	//    .server code) + `site.ts` (client-safe literals, bundled by Vite). The
	//    index drives per-project `landing` defaults (first doc of each project).
	await emitGeneratedConfig({ config, manifestDir: MANIFEST_DIR, index, logger })

	console.log(`✔ Done: ${docs.length} pages in ${Math.round(performance.now() - start)}ms`)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
