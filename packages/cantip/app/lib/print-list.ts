import { useSyncExternalStore } from 'react'

import { normTabPath } from '~/lib/tabs'

/**
 * The reader's print list: pages collected from anywhere in the site to print
 * into one PDF. Stored in localStorage under one key for all projects, so pages
 * from different projects can go into the same PDF.
 */

export interface PrintListItem {
	/** Doc href as the sidebar links it, e.g. "/guides/overview/". May be a permalink. */
	href: string
	title: string
}

const STORAGE_KEY = 'cantip:print-list'
const EMPTY: PrintListItem[] = []

const listeners = new Set<() => void>()
let cachedRaw: string | null = null
let cachedItems: PrintListItem[] = EMPTY

function readRaw(): string | null {
	try {
		return localStorage.getItem(STORAGE_KEY)
	} catch {
		return null
	}
}

function parse(raw: string | null): PrintListItem[] {
	if (!raw) return EMPTY
	try {
		const value: unknown = JSON.parse(raw)
		if (!Array.isArray(value)) return EMPTY
		return value.filter(
			(item): item is PrintListItem =>
				typeof item?.href === 'string' && typeof item?.title === 'string',
		)
	} catch {
		return EMPTY
	}
}

// useSyncExternalStore compares snapshots by identity, so the parsed array is
// reused until the stored string changes.
function getSnapshot(): PrintListItem[] {
	const raw = readRaw()
	if (raw !== cachedRaw) {
		cachedRaw = raw
		cachedItems = parse(raw)
	}
	return cachedItems
}

function getServerSnapshot(): PrintListItem[] {
	return EMPTY
}

function write(items: PrintListItem[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
	} catch {
		// Storage is unavailable (private window, blocked site data); the list stays as it was.
	}
	for (const listener of listeners) listener()
}

// The `storage` event fires only in other tabs, so writes in this tab notify
// `listeners` directly in `write`.
function subscribe(listener: () => void): () => void {
	listeners.add(listener)
	const onStorage = (e: StorageEvent) => {
		if (e.key === STORAGE_KEY || e.key === null) listener()
	}
	window.addEventListener('storage', onStorage)
	return () => {
		listeners.delete(listener)
		window.removeEventListener('storage', onStorage)
	}
}

const samePage = (a: string, b: string) => normTabPath(a) === normTabPath(b)

export function usePrintList() {
	const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

	return {
		items,
		has: (href: string) => items.some((item) => samePage(item.href, href)),
		add: (href: string, title: string) => {
			const current = getSnapshot()
			if (current.some((item) => samePage(item.href, href))) return
			write([...current, { href, title }])
		},
		remove: (href: string) => {
			write(getSnapshot().filter((item) => !samePage(item.href, href)))
		},
		move: (index: number, delta: -1 | 1) => {
			const next = [...getSnapshot()]
			const target = index + delta
			if (index < 0 || index >= next.length || target < 0 || target >= next.length) return
			;[next[index], next[target]] = [next[target], next[index]]
			write(next)
		},
		clear: () => write(EMPTY),
	}
}
