import path from 'node:path'

import { slug } from 'github-slugger'

export function getExtension(filePath: string) {
  return path.parse(filePath).ext
}

export function stripExtension(filePath: string) {
  return path.parse(filePath).name
}

// Obsidian resolves `note#A#B` to heading B; the earlier headings only say where B sits.
export function extractPathAndAnchor(filePathAndAnchor: string): [string, string | undefined] {
  const [filePath, ...headings] = filePathAndAnchor.split('#')
  return [filePath as string, headings.at(-1)]
}

export function isAnchor(filePath: string): filePath is `#${string}` {
  return filePath.startsWith('#')
}

export function slugifyPath(filePath: string) {
  const segments = filePath.split('/')
  return segments
    .map((segment, index) => {
      const isLastSegment = index === segments.length - 1
      if (!isLastSegment) {
        return slug(segment)
      }
      const parsedPath = path.parse(segment)
      return `${slug(parsedPath.name)}${parsedPath.ext}`
    })
    .join('/')
}

export function slashify(filePath: string) {
  const isExtendedLengthPath = filePath.startsWith('\\\\?\\')
  if (isExtendedLengthPath) {
    return filePath
  }
  return filePath.replaceAll('\\', '/')
}

export function osPath(filePath: string) {
  return filePath.replaceAll('/', path.sep)
}

function stripLeadingSlash(href: string) {
  if (href.startsWith('/')) href = href.slice(1)
  return href
}

function stripTrailingSlash(href: string) {
  if (href.endsWith('/')) href = href.slice(0, -1)
  return href
}

export function stripLeadingAndTrailingSlashes(href: string): string {
  return stripTrailingSlash(stripLeadingSlash(href))
}
