/**
 * `DocsConfig` — the single source of truth a user authors in `docs.config.ts`.
 *
 * Both the build pipeline (`scripts/*`) and the running app (`app/lib/*.server`,
 * route loaders, components via `getConfig()`) read the SAME resolved config, so
 * a value defined once flows everywhere. Authored values are partial; every field
 * has a default (see `defaults.ts`) so omitting a key reproduces the original
 * hardcoded behavior of this project.
 *
 * Validated with zod (already a dependency). The exported `defineConfig` is just
 * an identity helper that gives users autocomplete + type-checking on the literal
 * they write; actual validation/defaulting happens in `loadConfig` (`load.ts`).
 */
import { z } from 'zod'

/** A theme color map: token name → CSS color value (typically OKLCH). */
const colorMap = z.record(z.string(), z.string())

/**
 * A content source = one project = one Obsidian-style vault directory. Maps onto
 * the first path segment of every doc id it produces (`output`/`id`), exactly as
 * before. `source` may be a git submodule path, a loose content folder, or any
 * relative/absolute path — the generator just globs it.
 */
export const projectSchema = z.object({
	/** First id segment + output dir name, e.g. `krista`. */
	id: z.string().min(1),
	/** Display name in the switcher / home cards. */
	name: z.string().min(1),
	/** Directory of markdown/canvas files. Submodule, loose folder, or any path. */
	source: z.string().min(1),
	/** Logo under the user's `/public`. Defaults to `/projects/<id>.svg`. */
	logo: z.string().optional(),
	/** Landing URL when switching to this project. Defaults to its first doc. */
	landing: z.string().optional(),
	/** Short blurb, reused on home cards. */
	description: z.string().default(''),
	/** Ingest `.canvas` files from this source too. */
	canvas: z.boolean().default(false),
	/** Globs (relative to `source`) to skip, e.g. `['CLAUDE.md']`. */
	ignore: z.array(z.string()).default([]),
})

/** The "no project" bucket: docs not under any named project, served at root. */
export const generalSchema = z.object({
	enabled: z.boolean().default(false),
	name: z.string().default('Без проекта'),
	/** Directory of loose docs. When unset, the bucket has no docs. */
	source: z.string().optional(),
	logo: z.string().default('/projects/general.svg'),
	description: z.string().default(''),
	/** Ingest `.canvas` files from this source too. */
	canvas: z.boolean().default(false),
	ignore: z.array(z.string()).default([]),
})

export const siteSchema = z.object({
	title: z.string().default('Docs'),
	/** Home-page blurb under the title. */
	description: z.string().default(''),
	/** BCP-47-ish tag; drives `localeCompare` sorting + Pagefind `forceLanguage`. */
	lang: z.string().default('ru'),
	favicon: z.string().default('/favicon.svg'),
	logo: z
		.object({
			light: z.string().default('/iti-logo-light.svg'),
			dark: z.string().default('/iti-logo-dark.svg'),
		})
		.prefault({}),
	defaultTheme: z.enum(['dark', 'light']).default('dark'),
})

export const themeSchema = z.object({
	/** OKLCH (or any CSS color) token overrides, merged OVER the shipped defaults. */
	colors: z
		.object({
			light: colorMap.default({}),
			dark: colorMap.default({}),
		})
		.prefault({}),
})

/**
 * UI string overrides. Keys mirror the catalogued in-app literals; defaults ship
 * per `site.lang` (see `defaults.ts`). Partial — unset keys fall back to defaults.
 */
export const uiSchema = z.record(z.string(), z.string()).default({})

export const docsConfigSchema = z.object({
	site: siteSchema.prefault({}),
	projects: z.array(projectSchema).default([]),
	general: generalSchema.prefault({}),
	theme: themeSchema.prefault({}),
	ui: uiSchema,
	/**
	 * Markdown pipeline customization (build-time, runs in the content generator —
	 * NOT in the browser).
	 *
	 * `pipeline` is a transform over the engine's default step list: it receives
	 * the ordered built-in steps and returns the chain to actually run, so you have
	 * FULL control — reorder, drop, replace, or insert remark/rehype plugins.
	 * Omitting it leaves the default pipeline byte-for-byte unchanged.
	 *
	 *   markdown: {
	 *     pipeline: (steps) => [
	 *       ...steps,
	 *       { name: 'rehype-external-links', plugin: rehypeExternalLinks, options: { target: '_blank' } },
	 *     ],
	 *   }
	 *
	 * Each step is `{ name, plugin, options? }`. cantip's own internal steps carry
	 * a `cantip:` name prefix (e.g. `cantip:blank-line-gaps`) and encode Obsidian
	 * rendering semantics — reorder around them, but dropping them changes output.
	 * Ordering rules still apply: remark steps must precede `remark-rehype`, rehype
	 * steps must follow it; cantip does not enforce this (full control = your call).
	 *
	 * Validated loosely (functions can't be deeply schema-checked); the generator
	 * applies it. Not part of the serialized runtime config — it never leaves the
	 * build process.
	 */
	markdown: z
		.object({
			pipeline: z
				.function()
				.optional() as unknown as z.ZodOptional<z.ZodType<MarkdownPipelineHook>>,
		})
		.optional(),
})

/** One step in the markdown `unified()` pipeline: a named plugin + its options. */
export interface MarkdownStep {
	/** Stable identifier for filter/reorder/replace. cantip internals use a `cantip:` prefix. */
	name: string
	/** The unified plugin (remark/rehype). */
	plugin: unknown
	/** Options passed as the plugin's second `.use()` argument. */
	options?: unknown
}

/** Transforms the default step list into the chain to run. See `markdown.pipeline`. */
export type MarkdownPipelineHook = (steps: MarkdownStep[]) => MarkdownStep[]

/** Authored (input) shape — what a user writes; most fields optional. */
export type DocsUserConfig = z.input<typeof docsConfigSchema>
/** Resolved (output) shape — every field present, used everywhere internally. */
export type DocsConfig = z.output<typeof docsConfigSchema>
export type ProjectConfig = z.output<typeof projectSchema>

/**
 * Identity helper for `docs.config.ts` authors: gives editor autocomplete and
 * type errors on the literal. Validation + defaulting happen in `loadConfig`.
 */
export function defineConfig(config: DocsUserConfig): DocsUserConfig {
	return config
}
