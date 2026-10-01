import {
	File,
	FileArchive,
	FileAudio,
	FileCode,
	FileImage,
	FileSpreadsheet,
	FileText,
	FileVideo,
	Presentation,
	type LucideIcon,
} from 'lucide-react'

const FILE_ICONS: [extensions: string[], icon: LucideIcon][] = [
	[['xls', 'xlsx', 'xlsm', 'xlsb', 'ods', 'csv', 'tsv', 'numbers'], FileSpreadsheet],
	[['doc', 'docx', 'odt', 'rtf', 'txt', 'pdf', 'pages', 'epub', 'md'], FileText],
	[['ppt', 'pptx', 'odp', 'key'], Presentation],
	[['zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz'], FileArchive],
	[['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac'], FileAudio],
	[['mp4', 'mov', 'mkv', 'webm', 'avi', 'ogv'], FileVideo],
	[['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg', 'psd', 'fig', 'sketch'], FileImage],
	[['json', 'xml', 'yaml', 'yml', 'sql', 'html', 'css', 'js', 'ts', 'py', 'sh', 'log'], FileCode],
]

/** The icon for a file, chosen by the extension of its name. */
export function fileIcon(name: string): LucideIcon {
	const extension = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase()
	if (!extension) return File
	return FILE_ICONS.find(([extensions]) => extensions.includes(extension))?.[1] ?? File
}

/**
 * Whether an internal href points at a file under `public/` rather than a page.
 * Page ids are slugified and never contain a dot, so a path ending in an
 * extension is a file.
 */
export function isFileHref(href: string): boolean {
	return href.startsWith('/') && /\.\w+$/.test(href.split(/[?#]/)[0] ?? '')
}

/** Open a file in a new tab, where the browser shows it or downloads it. */
export function openFileInNewTab(href: string) {
	window.open(href, '_blank', 'noopener')
}
