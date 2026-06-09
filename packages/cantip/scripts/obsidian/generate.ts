import { obsidianConfigSchema, type ObsidianUserConfig } from './types.ts'
import { getObsidianPaths, getVault } from './obsidian.ts'
import { addObsidianFiles, type OutputRoots } from './files.ts'
import type { Logger } from './logger.ts'

/**
 * Plain-Node replacement for the Astro `obsidian()` integration. Reads an
 * Obsidian vault, runs the remark transform pipeline over every note, and
 * writes the resulting markdown into `content/<output>` plus copies assets
 * and embedded files into `public/<output>`.
 *
 * (The Astro version wired remark/rehype plugins into Astro's markdown config
 *  via `updateConfig`; here the full markdown -> HTML compilation happens later
 *  in generate-content.ts, so this step only emits the transformed markdown.)
 */
export async function generateObsidian(userConfig: ObsidianUserConfig, logger: Logger, roots?: OutputRoots): Promise<void> {
	const parsed = obsidianConfigSchema.safeParse(userConfig)
	if (!parsed.success) {
		throw new Error(`Invalid obsidian configuration:\n\n${JSON.stringify(parsed.error.format(), null, 2)}`)
	}
	const config = parsed.data

	if (config.skipGeneration) {
		logger.warn(`Skipping generation for '${config.output}' (skipGeneration enabled).`)
		return
	}

	const start = performance.now()
	logger.info(`Generating pages from Obsidian vault '${config.vault}'…`)

	const vault = await getVault(config)
	const obsidianPaths = await getObsidianPaths(vault, config.ignore)
	await addObsidianFiles(config, vault, obsidianPaths, logger, roots)

	logger.info(`Generated '${config.output}' in ${Math.round(performance.now() - start)}ms.`)
}
