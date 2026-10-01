#!/usr/bin/env node
// Prints the CHANGELOG.md section for a version (`v0.9.0` or `0.9.0`) without
// its heading. Exits 1 when the section is missing or empty, so the release
// workflow fails before publishing a version that has no notes.
import { readFileSync } from 'node:fs'

const version = (process.argv[2] ?? '').replace(/^v/, '')
if (!version) {
	console.error('Usage: changelog-section.mjs <version>')
	process.exit(1)
}

const lines = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8').split('\n')
// Matches "## 0.9.0", "## [0.9.0]" and "## 0.9.0 — 2026-10-01".
const heading = new RegExp(`^## \\[?${version.replaceAll('.', '\\.')}\\]?(\\s|$)`)
const start = lines.findIndex((line) => heading.test(line))
const end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
const section = start === -1 ? '' : lines.slice(start + 1, end === -1 ? undefined : end).join('\n').trim()

if (!section) {
	console.error(`CHANGELOG.md has no notes for ${version}. Add a "## ${version}" section before tagging.`)
	process.exit(1)
}
console.log(section)
