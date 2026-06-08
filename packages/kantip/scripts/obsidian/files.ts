import fs from 'node:fs/promises'
import path from 'node:path'

import type { Logger } from './logger.ts'

import type { ObsidianConfig } from './types.ts'

import { copyFile, ensureDirectory, removeDirectory } from './fs.ts'
import { transformMarkdownToString } from './markdown.ts'
import { getObsidianVaultFiles, isObsidianFile, type ObsidianFrontmatter, type Vault, type VaultFile } from './obsidian.ts'
import { getExtension, stripLeadingAndTrailingSlashes } from './path.ts'

// Output roots. Assets and non-markdown files are served statically from the
// public dir; markdown pages live under the content dir and are compiled to HTML
// by the content-generation script. Defaults reproduce the original layout
// (`content/` + `public/` relative to cwd); the generator passes resolved,
// cwd-absolute roots via `OutputRoots` so the engine also works from node_modules.
export interface OutputRoots {
  /** Where compiled markdown lands, e.g. `<cwd>/content`. */
  content: string
  /** Where assets + non-markdown files land (served statically), e.g. `<cwd>/public`. */
  public: string
}

const DEFAULT_OUTPUT_ROOTS: OutputRoots = { content: 'content', public: 'public' }

const calloutTypeMap: Record<string, string> = {
  note: 'note',
  abstract: 'tip',
  summary: 'tip',
  tldr: 'tip',
  info: 'note',
  todo: 'note',
  tip: 'tip',
  hint: 'tip',
  important: 'tip',
  success: 'note',
  check: 'note',
  done: 'note',
  question: 'caution',
  help: 'caution',
  faq: 'caution',
  warning: 'caution',
  caution: 'caution',
  attention: 'caution',
  failure: 'danger',
  fail: 'danger',
  missing: 'danger',
  danger: 'danger',
  error: 'danger',
  bug: 'danger',
  example: 'tip',
  quote: 'note',
  cite: 'note',
}

export function getCalloutType(obsidianCalloutType: string): string {
  return calloutTypeMap[obsidianCalloutType] ?? 'note'
}

export function isAssetFile(filePath: string): boolean {
  return getExtension(filePath) !== '.bmp' && isObsidianFile(filePath, 'image')
}

export async function addObsidianFiles(
  config: ObsidianConfig,
  vault: Vault,
  obsidianPaths: string[],
  logger: Logger,
  roots: OutputRoots = DEFAULT_OUTPUT_ROOTS,
) {
  const outputPaths = getOutputPaths(config, roots)

  // The general/no-project bucket (output '.') writes into the content/public
  // ROOTS, intermixed with project subdirs. Cleaning those roots here would wipe
  // sibling projects' output, so skip per-vault cleanup for it — the orchestrator
  // clears the content root once upfront, and general's loose assets are few.
  if (stripLeadingAndTrailingSlashes(config.output) !== '.') {
    await cleanOutputPaths(outputPaths)
  }

  const vaultFiles = getObsidianVaultFiles(vault, obsidianPaths)

  const results = await Promise.allSettled(
    vaultFiles.map(async (vaultFile) => {
      await (vaultFile.type === 'asset'
        ? addAsset(outputPaths, vaultFile)
        : vaultFile.type === 'file'
          ? addFile(outputPaths, vaultFile)
          : addContent(config, vault, outputPaths, vaultFiles, vaultFile))
    }),
  )

  let didFail = false

  for (const result of results) {
    if (result.status === 'rejected') {
      didFail = true
      logger.error(result.reason instanceof Error ? result.reason.message : String(result.reason))
    }
  }

  if (didFail) {
    throw new Error('Failed to generate some pages. See the error(s) above for more information.')
  }
}

async function addContent(
  config: ObsidianConfig,
  vault: Vault,
  outputPaths: OutputPaths,
  vaultFiles: VaultFile[],
  vaultFile: VaultFile,
) {
  try {
    const obsidianContent = await fs.readFile(vaultFile.fsPath, 'utf8')
    const {
      content,
      aliases,
      skip,
      type,
    } = await transformMarkdownToString(vaultFile.fsPath, obsidianContent, {
      files: vaultFiles,
      copyFrontmatter: config.copyFrontmatter,
      output: config.output,
      singleDollarTextMath: config.math.singleDollarTextMath,
      vault,
    })

    if (skip) {
      return
    }

    const outputPath = path.join(
      outputPaths.content,
      type === 'markdown' ? vaultFile.path : vaultFile.path.replace(/\.md$/, '.mdx'),
    )
    const outputDirPath = path.dirname(outputPath)

    await ensureDirectory(outputDirPath)
    await fs.writeFile(outputPath, content)

    if (aliases) {
      for (const alias of aliases) {
        await addAlias(config, outputPaths, vaultFile, alias)
      }
    }
  } catch (error) {
    throwVaultFileError(error, vaultFile)
  }
}

async function addFile(outputPaths: OutputPaths, vaultFile: VaultFile) {
  try {
    await copyFile(vaultFile.fsPath, path.join(outputPaths.file, vaultFile.slug))
  } catch (error) {
    throwVaultFileError(error, vaultFile)
  }
}

async function addAsset(outputPaths: OutputPaths, vaultFile: VaultFile) {
  try {
    await copyFile(vaultFile.fsPath, path.join(outputPaths.asset, vaultFile.slug))
  } catch (error) {
    throwVaultFileError(error, vaultFile)
  }
}

async function addAlias(
  config: ObsidianConfig,
  outputPaths: OutputPaths,
  vaultFile: VaultFile,
  alias: string,
) {
  const htmlPath = path.join(outputPaths.file, path.dirname(vaultFile.path), alias, 'index.html')
  const htmlDirPath = path.dirname(htmlPath)

  const to = path.posix.join(path.posix.sep, config.output, vaultFile.slug)
  const from = path.posix.join(path.dirname(to), alias)

  await ensureDirectory(htmlDirPath)

  await fs.writeFile(
    htmlPath,
    `<!doctype html>
<html lang="en">
  <head>
    <title>${vaultFile.stem}</title>
    <meta http-equiv="refresh" content="0;url=${to}">
    <meta name="robots" content="noindex">
    <link rel="canonical" href="${to}">
  </head>
  <body>
    <a href="${to}">Redirecting from <code>${from}</code> to <code>${to}</code></a>
  </body>
</html>`,
  )
}

function getOutputPaths(config: ObsidianConfig, roots: OutputRoots): OutputPaths {
  return {
    asset: path.join(roots.public, config.output),
    content: path.join(roots.content, config.output),
    file: path.join(roots.public, config.output),
  }
}

async function cleanOutputPaths(outputPaths: OutputPaths) {
  await removeDirectory(outputPaths.asset)
  await removeDirectory(outputPaths.content)
  await removeDirectory(outputPaths.file)
}

function throwVaultFileError(error: unknown, vaultFile: VaultFile): never {
  throw new Error(`${vaultFile.path} — ${error instanceof Error ? error.message : String(error)}`, { cause: error })
}

interface OutputPaths {
  asset: string
  content: string
  file: string
}
