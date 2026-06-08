import fs from 'node:fs'
import path from 'node:path'

import { toHtml } from 'hast-util-to-html'
import isAbsoluteUrl from 'is-absolute-url'
import type {
  BlockContent,
  Blockquote,
  Code,
  Html,
  Image,
  Link,
  Parent,
  PhrasingContent,
  Root,
  RootContent,
} from 'mdast'
import { findAndReplace } from 'mdast-util-find-and-replace'
import { toHast } from 'mdast-util-to-hast'
import { customAlphabet } from 'nanoid'
import { CONTINUE, EXIT, SKIP, visit } from 'unist-util-visit'
import type { VFile } from 'vfile'
import yaml from 'yaml'

import type { ObsidianConfig } from './types.ts'

import { transformHtmlToString } from './html.ts'
import { transformMarkdownToAST } from './markdown.ts'
import {
  getObsidianRelativePath,
  isObsidianFile,
  isObsidianBlockAnchor,
  parseObsidianFrontmatter,
  slugifyObsidianAnchor,
  slugifyObsidianPath,
  type ObsidianFrontmatter,
  type Vault,
  type VaultFile,
} from './obsidian.ts'
import { extractPathAndAnchor, getExtension, isAnchor } from './path.ts'
import { getCalloutType, isAssetFile } from './files.ts'

const generateAssetImportId = customAlphabet('abcdefghijklmnopqrstuvwxyz', 6)

const highlightReplacementRegex = /==(?<highlight>(?:(?!==).)+)==/g
const commentReplacementRegex = /%%(?<comment>(?:(?!%%).)+)%%/gs
const wikilinkReplacementRegex = /!?\[\[(?<url>(?:(?![[\]|]).)+)(?:\|(?<maybeText>(?:(?![[\]]).)+))?]]/g
const tagReplacementRegex = /(?:^|\s)#(?<tag>[\w/-]+)/g
const calloutRegex = /^\[!(?<type>\w+)][+-]? ?(?<title>.*)$/
const imageSizeRegex = /^(?:(?<altText>.*)\|)?(?:(?<widthOnly>\d+)|(?:(?<width>\d+)x(?<height>\d+)))$/
const mdxNonClosingVoidElementRegex = /<(?<tag>br|hr)(?<attrs>[^/>]*)>/g

export function remarkObsidian() {
  return async function transformer(tree: Root, file: VFile) {
    const obsidianFrontmatter = getObsidianFrontmatter(tree)

    if (obsidianFrontmatter && obsidianFrontmatter.publish === false) {
      file.data.skip = true
      return
    }

    // Record where the AUTHOR left blank lines between blocks, while mdast
    // positions still reflect the original source. This must run FIRST: the
    // handlers below mutate the tree (and remark-stringify, applied after this
    // whole transformer, renormalises blank-line spacing throughout — see the
    // 86%-of-files drift this caused). The markers it inserts survive stringify
    // and are the sole source of truth for `.has-blank-before` at compile time.
    markBlankGaps(tree)

    handleReplacements(tree, file)
    await handleMermaid(tree, file)
    await handleImagesAndNoteEmbeds(tree, file)

    visit(tree, (node, index, parent) => {
      const context: VisitorContext = { file, index, parent }

      switch (node.type) {
        case 'math':
        case 'inlineMath': {
          return handleMath(context)
        }
        case 'link': {
          return handleLinks(node, context)
        }
        case 'blockquote': {
          return handleBlockquotes(node, context)
        }
        default: {
          return CONTINUE
        }
      }
    })

    handleFrontmatter(tree, file, obsidianFrontmatter)
    handleImports(tree, file)

    if (file.data.isMdx) {
      closeVoidElements(tree)
    }
  }
}

/**
 * Marker comment emitted before any block the author separated from its previous
 * sibling with a blank line in the SOURCE. remark-stringify (run after this
 * transformer) rewrites blank-line spacing throughout the document — adding gaps
 * before lists, around html blocks, etc. — so source line positions can't be
 * read back at compile time. We capture the author's gaps HERE, where positions
 * are pristine, and `scripts/compile.ts` reads + strips this marker as the only
 * source of truth for `.has-blank-before`. The marker survives stringify before
 * every block type (heading/list/blockquote/code/table/hr/paragraph).
 */
export const BLANK_GAP_MARKER = '<!--blank-gap-->'

/**
 * Containers whose direct children are flow content, where inserting an `html`
 * comment sibling is valid markdown. We ONLY recurse into these. Crucially we do
 * NOT descend into `table`/`tableRow`/`tableCell` (an html node among table rows
 * corrupts the table and crashes remark-stringify) or `list` (its children are
 * `listItem`s, not flow content) — we step into each `listItem` instead.
 */
const FLOW_PARENTS = new Set(['root', 'blockquote', 'listItem'])

/**
 * Insert BLANK_GAP_MARKER before every block whose previous sibling was separated
 * by a blank line in source (gap >= 2). `html` targets are skipped to match the
 * compile-time policy: raw obsidian blocks (callouts/canvas/embeds) bring their
 * own margins. Recurses through flow-content containers (see FLOW_PARENTS) so
 * blocks nested in blockquotes/list items are covered too.
 */
function markBlankGaps(tree: Root) {
  function walk(parent: Parent) {
    const children = parent.children
    for (let i = 0; i < children.length; i++) {
      const node = children[i]
      const prev = children[i - 1]
      if (
        prev &&
        node.type !== 'html' &&
        prev.position &&
        node.position &&
        node.position.start.line - prev.position.end.line >= 2
      ) {
        children.splice(i, 0, { type: 'html', value: BLANK_GAP_MARKER } as Html)
        i++ // skip the marker we just inserted
      }
      // Recurse only into list items so we step over the `list` wrapper itself.
      if (node.type === 'list') {
        for (const item of (node as Parent).children) walk(item as Parent)
      } else if (FLOW_PARENTS.has(node.type) && 'children' in node) {
        walk(node as Parent)
      }
    }
  }
  walk(tree)
}

function getObsidianFrontmatter(tree: Root) {
  for (const node of tree.children) {
    if (node.type !== 'yaml') {
      continue
    }
    const obsidianFrontmatter = parseObsidianFrontmatter(node.value)
    if (obsidianFrontmatter) {
      return obsidianFrontmatter
    }
  }
  return
}

function handleFrontmatter(tree: Root, file: VFile, obsidianFrontmatter?: ObsidianFrontmatter) {
  if (file.data.embedded) {
    for (const [index, node] of tree.children.entries()) {
      if (node.type !== 'yaml') {
        continue
      }
      tree.children.splice(index, 1)
      break
    }
    return
  }

  let hasFrontmatter = false

  for (const node of tree.children) {
    if (node.type !== 'yaml') {
      continue
    }
    node.value = getFrontmatterNodeValue(file, obsidianFrontmatter)
    hasFrontmatter = true

    if (obsidianFrontmatter?.aliases && obsidianFrontmatter.aliases.length > 0) {
      file.data.aliases = obsidianFrontmatter.aliases
    }
    break
  }

  if (!hasFrontmatter) {
    tree.children.unshift({ type: 'yaml', value: getFrontmatterNodeValue(file) })
  }
}

function handleImports(_tree: Root, _file: VFile) {
  // No-op since the Astro migration: images are emitted as plain <img> tags
  // referencing assets copied to `public/`, so no MDX `import` statements
  // (previously `import { Image } from 'astro:assets'`) are ever needed.
}

function handleReplacements(tree: Root, file: VFile) {
  findAndReplace(tree, [
    [
      highlightReplacementRegex,
      (_match: string, highlight: string) => ({
        type: 'html',
        value: `<mark class="obs-highlight">${highlight}</mark>`,
      }),
    ],
    [commentReplacementRegex, null],
    [
      wikilinkReplacementRegex,
      (match: string, url: string, maybeText?: string) => {
        ensureTransformContext(file)

        let fileUrl: string
        let text = maybeText ?? url

        if (isAnchor(url)) {
          fileUrl = slugifyObsidianAnchor(url)
          text = maybeText ?? url.slice(isObsidianBlockAnchor(url) ? 2 : 1)
        } else {
          const [urlPath, urlAnchor] = extractPathAndAnchor(url)

          switch (file.data.vault.options.linkFormat) {
            case 'relative': {
              fileUrl = getFileUrl(file.data.output, getRelativeFilePath(file, urlPath), urlAnchor)
              break
            }
            case 'absolute':
            case 'shortest': {
              const matchingFile = file.data.files.find(
                (vaultFile) => vaultFile.isEqualStem(urlPath) || vaultFile.isEqualFileName(urlPath),
              )

              fileUrl = getFileUrl(
                file.data.output,
                matchingFile ? getFilePathFromVaultFile(matchingFile, urlPath) : urlPath,
                urlAnchor,
              )
              break
            }
          }
        }

        if (match.startsWith('!')) {
          const isMarkdown = isMarkdownFile(url, file)

          return {
            type: 'image',
            url: isMarkdown ? url : fileUrl,
            alt: text,
            data: { isAssetResolved: !isMarkdown },
          }
        }

        return {
          children: [{ type: 'text', value: text }],
          type: 'link',
          url: fileUrl,
        }
      },
    ],
    [
      tagReplacementRegex,
      (_match: string, tag: string) => {
        if (/^\d+$/.test(tag)) {
          return false
        }

        return {
          type: 'html',
          value: ` <span class="obs-tag">#${tag}</span>`,
        }
      },
    ],
  ])
}

function handleMath({ file }: VisitorContext) {
  file.data.includeKatexStyles = true
  return SKIP
}

function handleLinks(node: Link, { file }: VisitorContext) {
  ensureTransformContext(file)

  if (file.data.vault.options.linkSyntax === 'wikilink' || isAbsoluteUrl(node.url) || !file.dirname) {
    return SKIP
  }

  if (isAnchor(node.url)) {
    node.url = slugifyObsidianAnchor(node.url)
    return SKIP
  }

  const url = path.basename(decodeURIComponent(node.url))
  const [urlPath, urlAnchor] = extractPathAndAnchor(url)
  const matchingFile = file.data.files.find((vaultFile) => vaultFile.isEqualFileName(urlPath))

  if (!matchingFile) {
    return SKIP
  }

  switch (file.data.vault.options.linkFormat) {
    case 'relative': {
      node.url = getFileUrl(file.data.output, getRelativeFilePath(file, node.url), urlAnchor)
      break
    }
    case 'absolute':
    case 'shortest': {
      node.url = getFileUrl(file.data.output, getFilePathFromVaultFile(matchingFile, node.url), urlAnchor)
      break
    }
  }

  return SKIP
}

async function handleImages(node: Image, context: VisitorContext) {
  const { file } = context

  ensureTransformContext(file)

  if (!file.dirname) {
    return SKIP
  }

  if (isAbsoluteUrl(node.url)) {
    if (isObsidianFile(node.url, 'image')) {
      handleImagesWithSize(node, context, 'external')
    }
    return SKIP
  }

  if (isMarkdownFile(node.url, file)) {
    replaceNode(context, await getMarkdownFileNode(file, node.url))
    return SKIP
  }

  let fileUrl = node.url

  if (!node.data?.isAssetResolved) {
    switch (file.data.vault.options.linkFormat) {
      case 'relative': {
        fileUrl = getFileUrl(file.data.output, getRelativeFilePath(file, node.url))
        break
      }
      case 'absolute': {
        fileUrl = getFileUrl(file.data.output, slugifyObsidianPath(node.url))
        break
      }
      case 'shortest': {
        const url = path.basename(decodeURIComponent(node.url))
        const [urlPath] = extractPathAndAnchor(url)
        const matchingFile = file.data.files.find((vaultFile) => vaultFile.isEqualFileName(urlPath))

        if (!matchingFile) {
          break
        }

        fileUrl = getFileUrl(file.data.output, getFilePathFromVaultFile(matchingFile, node.url))
        break
      }
    }
  }

  if (isCustomFile(node.url)) {
    replaceNode(context, getCustomFileNode(fileUrl))
    return SKIP
  }

  // Assets are copied to `public/<output>/<slug>` and served from the web root,
  // so the URL produced by getFileUrl (`/<output>/<slug>`) is already correct.
  // (Astro used getAssetPath to produce a relative `../../assets/...` path for its
  //  asset pipeline; with a plain static `public/` dir we keep the absolute URL.)
  node.url = fileUrl

  if (isAssetFile(node.url)) {
    handleImagesWithSize(node, context, 'asset')
  }

  return SKIP
}

function handleBlockquotes(node: Blockquote, context: VisitorContext) {
  const [firstChild, ...otherChildren] = node.children

  if (firstChild?.type !== 'paragraph') {
    return SKIP
  }

  const [firstGrandChild, ...otherGrandChildren] = firstChild.children

  if (firstGrandChild?.type !== 'text') {
    return SKIP
  }

  const [firstLine, ...otherLines] = firstGrandChild.value.split(/\r?\n/)

  if (!firstLine) {
    return SKIP
  }

  const match = calloutRegex.exec(firstLine)
  const { title, type } = match?.groups ?? {}

  if (!match || !type) {
    return SKIP
  }

  const calloutType = getCalloutType(type)
  const calloutTitle = title?.trim() || type.charAt(0).toUpperCase() + type.slice(1)
  const escapedTitle = calloutTitle.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const openTag = `<div class="callout callout-${calloutType}"><p class="callout-title">${escapedTitle}</p>`

  const contentChildren: PhrasingContent[] = []
  if (otherLines.length > 0) {
    contentChildren.push({ type: 'text', value: otherLines.join('\n') })
  }
  contentChildren.push(...otherGrandChildren)

  const aside: RootContent[] = [
    { type: 'html', value: openTag },
  ]

  if (contentChildren.length > 0) {
    aside.push({
      type: 'paragraph',
      children: contentChildren,
    })
  }

  aside.push(...otherChildren)
  aside.push({ type: 'html', value: '</div>' })

  replaceNode(context, aside)

  return CONTINUE
}

async function handleMermaid(tree: Root, file: VFile) {
  const mermaidNodes: [node: Code, context: VisitorContext][] = []

  visit(tree, 'code', (node, index, parent) => {
    if (node.lang === 'mermaid') {
      mermaidNodes.push([node, { file, index, parent }])
      return SKIP
    }
    return CONTINUE
  })

  await Promise.all(
    mermaidNodes.map(async ([node, context]) => {
      const html = toHtml(toHast(node))
      const processedHtml = await transformHtmlToString(html)
      replaceNode(context, { type: 'html', value: processedHtml })
    }),
  )
}

async function handleImagesAndNoteEmbeds(tree: Root, file: VFile) {
  const imageNodes: [node: Image, context: VisitorContext][] = []

  visit(tree, 'image', (node, index, parent) => {
    imageNodes.push([node, { file, index, parent }])
    return SKIP
  })

  await Promise.all(
    imageNodes.map(async ([node, context]) => {
      await handleImages(node, context)
    }),
  )
}

function getFrontmatterNodeValue(file: VFile, obsidianFrontmatter?: ObsidianFrontmatter) {
  let frontmatter: Record<string, unknown> = {
    title: file.stem,
  }

  if (obsidianFrontmatter && file.data.copyFrontmatter) {
    const { cover, image, description, permalink, tags, publish, aliases, ...restFrontmatter } =
      obsidianFrontmatter.raw
    frontmatter = { ...frontmatter, ...restFrontmatter }
  }

  if (obsidianFrontmatter?.description && obsidianFrontmatter.description.length > 0) {
    frontmatter.description = obsidianFrontmatter.description
  }

  if (obsidianFrontmatter?.permalink && obsidianFrontmatter.permalink.length > 0) {
    frontmatter.permalink = obsidianFrontmatter.permalink
  }

  if (obsidianFrontmatter?.tags && obsidianFrontmatter.tags.length > 0) {
    frontmatter.tags = obsidianFrontmatter.tags
  }

  const { title, ...frontmatterWithoutTitle } = frontmatter

  let result = yaml.stringify({ title }, { version: '1.1' })
  if (Object.keys(frontmatterWithoutTitle).length > 0) {
    result += yaml.stringify(frontmatterWithoutTitle)
  }
  return result.trim()
}

function getFileUrl(output: ObsidianConfig['output'], filePath: string, anchor?: string) {
  return `${path.posix.join(path.posix.sep, output, slugifyObsidianPath(filePath))}${slugifyObsidianAnchor(anchor ?? '')}`
}

function getRelativeFilePath(file: VFile, relativePath: string) {
  ensureTransformContext(file)
  return path.posix.join(getObsidianRelativePath(file.data.vault, file.dirname), relativePath)
}

function getAssetPath(file: VFile, relativePath: string) {
  ensureTransformContext(file)
  return path.posix.join('../../..', path.posix.relative(file.dirname, file.data.vault.path), 'assets', relativePath)
}

function getFilePathFromVaultFile(vaultFile: VaultFile, url: string) {
  return vaultFile.uniqueFileName ? vaultFile.slug : slugifyObsidianPath(url)
}

function isMarkdownFile(filePath: string, file: VFile) {
  return (
    (file.data.vault?.options.linkSyntax === 'markdown' && filePath.endsWith('.md')) ||
    getExtension(filePath).length === 0
  )
}

function handleImagesWithSize(node: Image, context: VisitorContext, type: 'asset' | 'external') {
  if (!node.alt) {
    return
  }

  const match = imageSizeRegex.exec(node.alt)
  const { altText, width, widthOnly, height } = match?.groups ?? {}

  if (widthOnly === undefined && width === undefined) {
    return
  }

  const imgAltText = altText ?? ''
  const imgWidth = widthOnly ?? width
  const imgHeight = height ?? 'auto'
  const imgStyle = height === undefined ? '' : ` style="height: ${height}px !important;"`

  // Both local (asset) and external images become a plain <img>. Local assets are
  // copied to `public/<output>/` and referenced by their absolute web URL, so there
  // is no longer any need for Astro's MDX `<Image>` import machinery.
  replaceNode(context, {
    type: 'html',
    value: `<img src="${node.url}" alt="${imgAltText}" width="${imgWidth}" height="${imgHeight}"${imgStyle} />`,
  })
}

function isCustomFile(filePath: string) {
  return isObsidianFile(filePath) && !isObsidianFile(filePath, 'image')
}

function getCustomFileNode(filePath: string): RootContent {
  if (isObsidianFile(filePath, 'audio')) {
    return {
      type: 'html',
      value: `<audio class="obs-embed-audio" controls src="${filePath}"></audio>`,
    }
  } else if (isObsidianFile(filePath, 'video')) {
    return {
      type: 'html',
      value: `<video class="obs-embed-video" controls src="${filePath}"></video>`,
    }
  }

  return {
    type: 'html',
    value: `<iframe class="obs-embed-pdf" src="${filePath}"></iframe>`,
  }
}

async function getMarkdownFileNode(file: VFile, fileUrl: string): Promise<RootContent> {
  ensureTransformContext(file)

  const [fileName, ...anchorSegments] = fileUrl.split('#')
  const fileAnchor = anchorSegments.join('#')
  const fileExt = file.data.vault.options.linkSyntax === 'wikilink' ? '.md' : ''
  const filePath = decodeURIComponent(
    file.data.vault.options.linkFormat === 'relative'
      ? getRelativeFilePath(file, fileName ?? fileUrl)
      : (fileName ?? fileUrl),
  )
  const url = path.posix.join(path.posix.sep, `${filePath}${fileExt}`)
  const matchingFile = file.data.files.find(
    (vaultFile) => vaultFile.path === url || vaultFile.isEqualStem(filePath) || vaultFile.isEqualFileName(filePath),
  )

  if (!matchingFile) {
    return { type: 'text', value: '' }
  }

  const content = fs.readFileSync(matchingFile.fsPath, 'utf8')
  const root = await transformMarkdownToAST(matchingFile.fsPath, content, { ...file.data, embedded: true })

  if (fileAnchor) {
    root.children = extractMarkdownSection(root, fileAnchor)
  }

  return {
    type: 'blockquote',
    children: [
      {
        type: 'html',
        value: `<strong>${matchingFile.stem}</strong>`,
      },
      ...(root.children as BlockContent[]),
    ],
  }
}

function replaceNode({ index, parent }: VisitorContext, replacement: RootContent | RootContent[]) {
  if (!parent || index === undefined) {
    return
  }
  parent.children.splice(index, 1, ...(Array.isArray(replacement) ? replacement : [replacement]))
}

function extractMarkdownSection(root: Root, sectionAnchor: string) {
  const children: Root['children'] = []

  visit(root, (node, index, parent) => {
    switch (node.type) {
      case 'heading': {
        if (!parent || index === undefined) return CONTINUE
        const headingText = node.children.find((child) => child.type === 'text')?.value
        if (headingText !== sectionAnchor) return CONTINUE

        children.push(node)

        let nextNode = parent.children[index + 1]
        while (nextNode && (nextNode.type !== 'heading' || nextNode.depth > node.depth)) {
          children.push(nextNode)
          nextNode = parent.children[index + children.length]
        }

        return EXIT
      }
      default: {
        return CONTINUE
      }
    }
  })

  return children
}

function createMdxNode(value: string): Html {
  return { type: 'html', value }
}

function closeVoidElements(tree: Root) {
  visit(tree, 'html', (node) => {
    node.value = node.value.replaceAll(mdxNonClosingVoidElementRegex, '<$<tag>$<attrs>/>')
    return SKIP
  })
}

function ensureTransformContext(file: VFile): asserts file is VFile & { data: TransformContext; dirname: string } {
  if (!file.dirname || !file.data.files || file.data.output === undefined || !file.data.vault) {
    throw new Error('Invalid transform context.')
  }
}

export interface TransformContext {
  aliases?: string[]
  assetImports?: [id: string, path: string][]
  copyFrontmatter: boolean
  embedded?: boolean
  files: VaultFile[]
  includeKatexStyles?: boolean
  isMdx?: true
  output: ObsidianConfig['output']
  singleDollarTextMath: ObsidianConfig['math']['singleDollarTextMath']
  skip?: true
  vault: Vault
}

interface VisitorContext {
  file: VFile
  index: number | undefined
  parent: Parent | undefined
}

declare module 'vfile' {
  interface DataMap extends TransformContext {}
}

declare module 'unist' {
  interface Data {
    isAssetResolved?: boolean
  }
}
