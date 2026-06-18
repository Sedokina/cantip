import path from 'node:path';
import fs from 'node:fs/promises';
import { glob } from 'tinyglobby';

import type { Logger } from './obsidian/logger.ts';

export interface CanvasToMdOptions {
	/** Absolute or cwd-relative path to the Obsidian vault. */
	vault: string;
	/** Output section name (e.g. 'krista'); files are written under `content/<output>`. */
	output: string;
	/** Directory that `content/<output>` lives under. Defaults to 'content'. */
	contentRoot?: string;
}

function escapeYamlString(s: string): string {
	if (/[:"'#\[\]{}&*!|>%@`]/.test(s) || s.includes('\n')) {
		return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
	}
	return s;
}

async function generateCanvasFile(
	vaultDir: string,
	outDir: string,
	relPath: string,
	log: (msg: string) => void,
): Promise<void> {
	const absPath = path.join(vaultDir, relPath);
	const contents = await fs.readFile(absPath, 'utf-8');

	let canvasObj: unknown;
	try {
		canvasObj = JSON.parse(contents);
	} catch (err) {
		log(`Invalid JSON in ${relPath}: ${(err as Error).message}`);
		return;
	}

	const title = path.basename(relPath, '.canvas');
	// Carry the canvas data on a `<canvas-mount>` custom element so the app can map
	// it to the CanvasView component (which parses `canvas` and renders the viewer).
	// HTML-attribute-escaped so it survives the markdown → rehype-raw round-trip.
	const canvasAttr = JSON.stringify(canvasObj)
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');

	const md = [
		'---',
		`title: ${escapeYamlString(title)}`,
		'tableOfContents: false',
		'---',
		'',
		`<canvas-mount canvas="${canvasAttr}"></canvas-mount>`,
		'',
	].join('\n');

	const mdRelPath = relPath.replace(/\.canvas$/, '.md');
	const outPath = path.join(outDir, mdRelPath);
	await fs.mkdir(path.dirname(outPath), { recursive: true });
	await fs.writeFile(outPath, md, 'utf-8');
}

/**
 * Convert every `.canvas` file in a vault to a markdown page containing a
 * client-mountable canvas container. Plain Node — no Astro integration hooks.
 */
export async function generateCanvas(options: CanvasToMdOptions, logger: Logger): Promise<void> {
	const { vault, output, contentRoot = 'content' } = options;
	const vaultDir = path.resolve(vault);
	const outDir = path.resolve(contentRoot, output);

	const entries = await glob('**/[^_]*.canvas', { cwd: vaultDir });
	await Promise.all(entries.map((relPath) => generateCanvasFile(vaultDir, outDir, relPath, (m) => logger.info(m))));
	if (entries.length > 0) {
		logger.info(`Generated ${entries.length} canvas page(s) for '${output}'`);
	}
}
