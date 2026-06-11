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

	// 5. Emit the content manifest as ONE importable TS module in the Source shape
	//    (`{ files: VirtualFile[], permalinks }`). The app imports it via the
	//    `~/generated` alias and feeds it to `loader()` — no runtime fs reads, no
	//    cwd fragility, fully typed. It's server-only (HTML is injected as a
	//    string), so a single module is fine — Remix never ships it to the client.
	await fs.rm(MANIFEST_DIR, { recursive: true, force: true })
	await fs.mkdir(MANIFEST_DIR, { recursive: true })

	// Permalink map: a doc may pin a stable URL via `permalink` frontmatter,
	// independent of the file name (renames never break it). Stored permalink→id;
	// the route serves the doc at the permalink and 301s the file-path URL to it.
	// PROJECT-SCOPED: keyed with the doc's project (first id segment) so a
	// same-named permalink in another project never collides.
	const permalinks: Record<string, string> = {}
	for (const d of docs) {
		const raw = d.frontmatter.permalink
		if (typeof raw !== 'string' || raw.trim() === '') continue
		const rel = raw.trim().replace(/^\/+|\/+$/g, '')
		if (!rel) continue
		const project = d.id.split('/')[0]
		const key = `${project}/${rel}`
		if (permalinks[key] && permalinks[key] !== d.id) {
			logger.warn(`Duplicate permalink "${raw}" in project "${project}" on ${d.id} (already used by ${permalinks[key]}); keeping the first.`)
			continue
		}
		permalinks[key] = d.id
	}
	if (Object.keys(permalinks).length > 0) {
		logger.info(`Registered ${Object.keys(permalinks).length} permalink(s).`)
	}

	// Build the VirtualFile[] (sorted for stable order) + serialize to a module.
	const files = docs
		.slice()
		.sort((a, b) => a.id.localeCompare(b.id, config.site.lang))
		.map((d) => ({
			type: 'page' as const,
			path: d.id,
			data: {
				title: (d.frontmatter.title as string | undefined) ?? d.id.split('/').pop()?.replace(/-/g, ' ') ?? d.id,
				frontmatter: d.frontmatter,
				headings: d.headings,
				html: d.html,
				isCanvas: d.html.includes('data-canvas-mount'),
			},
		}))

	const contentModule =
		`// AUTO-GENERATED by cantip. DO NOT EDIT.\n` +
		`import type { Source } from 'cantip/source'\n\n` +
		`export const source: Source = ${JSON.stringify({ files, permalinks })}\n`
	await fs.writeFile(path.join(MANIFEST_DIR, 'content.ts'), contentModule)

	// 6. Build the Pagefind search index from the compiled docs → public/pagefind
	await buildSearchIndex(docs, canonicalUrl, logger, {
		outputPath: path.join(PUBLIC_ROOT, 'pagefind'),
		lang: config.site.lang,
	})

	// 7. Emit the resolved config as importable modules (`site.ts` client-safe
	//    literals + `theme.generated.css` + `slots.ts`). Pass the doc ids so
	//    per-project `landing` defaults resolve to each project's first doc.
	await emitGeneratedConfig({
		config,
		manifestDir: MANIFEST_DIR,
		index: docs.map((d) => ({ id: d.id })),
		logger,
	})

	console.log(`✔ Done: ${docs.length} pages in ${Math.round(performance.now() - start)}ms`)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
