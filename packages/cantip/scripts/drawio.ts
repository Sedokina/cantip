import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'
import { unzipSync } from 'fflate'

import { isFile } from './obsidian/fs.ts'
import type { Logger } from './obsidian/logger.ts'
import { DRAWIO_BASE_PATH, DRAWIO_VERSION } from '../app/lib/drawio.ts'

const drawioFileRegex = /\.drawio\.(?:png|svg)$/i

// draw.war is the full draw.io web app. The viewer needs only these parts of it;
// the rest is the editor.
const VIEWER_ENTRIES = [
	'js/viewer-static.min.js',
	'stencils/',
	'shapes/',
	'styles/',
	'img/',
	'images/',
	'mxgraph/',
	'math4/',
]

export function isDrawioFile(filePath: string) {
	return drawioFileRegex.test(filePath)
}

/**
 * The `<mxfile>` XML stored inside a `.drawio.svg` (the root `content` attribute)
 * or a `.drawio.png` (a `tEXt`/`zTXt` chunk with the `mxfile` keyword), with every
 * page uncompressed. Undefined when the file carries no diagram.
 */
export async function readDrawioXml(filePath: string): Promise<string | undefined> {
	const data = await fs.readFile(filePath)
	const xml = /\.svg$/i.test(filePath) ? readSvgContent(data.toString('utf8')) : readPngText(data, 'mxfile')
	if (xml === undefined) return undefined
	try {
		return uncompressPages(xml.startsWith('<') ? xml : inflate(xml))
	} catch {
		return undefined
	}
}

function readSvgContent(svg: string): string | undefined {
	const match = /^\s*(?:<\?xml[^>]*>\s*)?(?:<!DOCTYPE[^>]*>\s*)?<svg\b[^>]*?\scontent=(?:"([^"]*)"|'([^']*)')/i.exec(svg)
	const content = match?.[1] ?? match?.[2]
	return content === undefined ? undefined : decodeXmlEntities(content)
}

function readPngText(png: Buffer, keyword: string): string | undefined {
	let offset = 8
	while (offset + 8 <= png.length) {
		const length = png.readUInt32BE(offset)
		const type = png.toString('latin1', offset + 4, offset + 8)
		const body = png.subarray(offset + 8, offset + 8 + length)
		const separator = body.indexOf(0)
		if (separator !== -1 && body.toString('latin1', 0, separator) === keyword) {
			if (type === 'tEXt') return decodeURIComponent(body.toString('latin1', separator + 1))
			// zTXt: one compression-method byte, then zlib data.
			if (type === 'zTXt') return decodeURIComponent(zlib.inflateSync(body.subarray(separator + 2)).toString('latin1'))
		}
		offset += length + 12
	}
	return undefined
}

// The docs require uncompressed XML for the viewer's `xml` option, but draw.io
// saves each page as base64 of raw-deflated, URI-encoded XML by default.
function uncompressPages(mxfile: string) {
	return mxfile.replace(
		/(<diagram\b[^>]*>)\s*([^<\s][^<]*?)\s*(<\/diagram>)/g,
		(_match, open: string, compressed: string, close: string) => `${open}${inflate(compressed)}${close}`,
	)
}

function inflate(base64: string) {
	return decodeURIComponent(zlib.inflateRawSync(Buffer.from(base64, 'base64')).toString('latin1'))
}

function decodeXmlEntities(value: string) {
	const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
	return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_match, entity: string) => {
		if (entity[0] !== '#') return named[entity.toLowerCase()]!
		return String.fromCodePoint(entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)))
	})
}

/**
 * Make sure `public/_drawio/<version>/` holds the viewer. Downloads the pinned
 * draw.io release on first use. Returns false when the viewer is not available,
 * so diagrams fall back to static images.
 */
export async function ensureDrawioViewer(publicRoot: string, logger: Logger): Promise<boolean> {
	const viewerDir = path.join(publicRoot, DRAWIO_BASE_PATH)
	if (await isFile(path.join(viewerDir, 'js/viewer-static.min.js'))) return true

	const url = `https://github.com/jgraph/drawio/releases/download/v${DRAWIO_VERSION}/draw.war`
	logger.info(`Downloading the draw.io viewer v${DRAWIO_VERSION} from ${url}…`)
	try {
		const response = await fetch(url)
		if (!response.ok) throw new Error(`HTTP ${response.status}`)
		const entries = unzipSync(new Uint8Array(await response.arrayBuffer()), {
			filter: (file) => VIEWER_ENTRIES.some((entry) => file.name === entry || (entry.endsWith('/') && file.name.startsWith(entry))),
		})

		// Unpack next to the target and rename at the end, so an interrupted run
		// never leaves a half-written viewer that the check above would accept.
		const tempDir = `${path.dirname(viewerDir)}.tmp`
		await fs.rm(tempDir, { recursive: true, force: true })
		for (const [name, content] of Object.entries(entries)) {
			if (name.endsWith('/')) continue
			const target = path.join(tempDir, name)
			await fs.mkdir(path.dirname(target), { recursive: true })
			await fs.writeFile(target, content)
		}
		// Older viewer versions in the same folder are no longer referenced.
		await fs.rm(path.dirname(viewerDir), { recursive: true, force: true })
		await fs.mkdir(path.dirname(viewerDir), { recursive: true })
		await fs.rename(tempDir, viewerDir)
		logger.info(`Installed the draw.io viewer into ${viewerDir}.`)
		return true
	} catch (error) {
		logger.warn(
			`Could not download the draw.io viewer (${error instanceof Error ? error.message : String(error)}); diagrams are shown as static images.`,
		)
		return false
	}
}
