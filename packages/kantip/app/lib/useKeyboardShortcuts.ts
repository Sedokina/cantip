import { useEffect } from 'react'

/**
 * App-wide keyboard shortcuts: single keys (Gmail/GitHub-style — `l`, `w`) and
 * two-key sequences (Gmail-style `g` then `c`). These live alongside the
 * existing Cmd/Ctrl chords (Cmd+K search, Cmd+P file-open); those keep their own
 * listeners and pass straight through this one untouched.
 *
 * Why single keys are safe: browsers reserve almost nothing for bare letters as
 * long as focus isn't in a text field. The handler's first job is to bail when
 * the user is typing (input/textarea/contenteditable) or when any modifier is
 * held — that lets Cmd+K et al. fall through and stops shortcuts from firing
 * mid-typing. Sequences never collide with the browser at all (it has no notion
 * of "g then c").
 */

export type ShortcutGroup = 'Дерево' | 'Вкладки' | 'Навигация'

/** A binding the caller wires to behavior, plus the metadata the `?` overlay shows. */
export type Shortcut = {
	/** Single key (e.g. 'l') OR a two-key sequence (e.g. ['g', 'c']). Compared case-insensitively. */
	keys: string | [string, string]
	/** What it does — shown in the cheatsheet. */
	label: string
	/** Cheatsheet section. */
	group: ShortcutGroup
	/** Handler. Only invoked when focus is outside text fields and no modifier is held. */
	run: () => void
}

/**
 * A display-only entry for shortcuts owned elsewhere (the existing Cmd+K / Cmd+P
 * chords, the Shift+Enter row action) so the `?` overlay can list everything in
 * one place without those handlers being re-registered here.
 */
export type ShortcutInfo = {
	/** Human-readable key hint, e.g. '⌘K', 'Shift+Enter'. */
	hint: string
	label: string
	group: ShortcutGroup
}

/**
 * The full cheatsheet, hand-maintained as the single source of truth for what the
 * `?` overlay shows. Handlers live with their components (Sidebar, TabBar) via
 * useKeyboardShortcuts; this list just describes every binding in one place,
 * including the Cmd/Ctrl chords and the Shift+Enter row action owned elsewhere.
 * Keep in sync when adding a binding.
 */
export const ALL_SHORTCUTS: ShortcutInfo[] = [
	{ hint: '⌘/Ctrl K', label: 'Поиск по содержимому', group: 'Навигация' },
	{ hint: '?', label: 'Показать список горячих клавиш', group: 'Навигация' },
	{ hint: '⌘/Ctrl P', label: 'Поиск файла по имени', group: 'Дерево' },
	{ hint: 'l', label: 'Найти текущую страницу в дереве', group: 'Дерево' },
	{ hint: 'c', label: 'Свернуть все папки', group: 'Дерево' },
	{ hint: 'w', label: 'Закрыть текущую вкладку', group: 'Вкладки' },
	{ hint: 'Shift+Enter', label: 'Файл — открыть в новой вкладке; папку — развернуть рекурсивно', group: 'Дерево' },
]

/** True when focus is in an editable surface — single-key shortcuts must not fire there. */
function isTypingTarget(el: EventTarget | null): boolean {
	if (!(el instanceof HTMLElement)) return false
	const tag = el.tagName
	return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

/** How long (ms) the first key of a sequence stays "armed" before the buffer clears. */
const SEQUENCE_WINDOW_MS = 1000

/**
 * Register the given shortcuts on `window`. Re-registers when `shortcuts`
 * changes identity, so callers should memoize or accept the (cheap) churn.
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[]): void {
	useEffect(() => {
		// Split into single-key and sequence bindings, keyed lowercase.
		const singles = new Map<string, Shortcut>()
		const sequences = new Map<string, Map<string, Shortcut>>() // firstKey -> (secondKey -> shortcut)
		for (const s of shortcuts) {
			if (typeof s.keys === 'string') {
				singles.set(s.keys.toLowerCase(), s)
			} else {
				const [a, b] = s.keys
				const branch = sequences.get(a.toLowerCase()) ?? new Map()
				branch.set(b.toLowerCase(), s)
				sequences.set(a.toLowerCase(), branch)
			}
		}

		let pending: string | null = null
		let timer: ReturnType<typeof setTimeout> | null = null
		const clearPending = () => {
			pending = null
			if (timer) {
				clearTimeout(timer)
				timer = null
			}
		}

		const onKey = (e: KeyboardEvent) => {
			// Let Cmd/Ctrl/Alt chords (search, file-open, browser shortcuts) pass through,
			// and never fire while the user is typing. Checked first, always.
			if (e.metaKey || e.ctrlKey || e.altKey) {
				clearPending()
				return
			}
			if (isTypingTarget(e.target)) {
				clearPending()
				return
			}

			const key = e.key.toLowerCase()

			// Resolving the second key of an armed sequence takes priority.
			if (pending) {
				const branch = sequences.get(pending)
				clearPending()
				const match = branch?.get(key)
				if (match) {
					e.preventDefault()
					match.run()
					return
				}
				// Not a valid continuation — fall through so this key can still be a
				// single-key shortcut on its own.
			}

			// Arm a new sequence if this key starts one.
			if (sequences.has(key)) {
				pending = key
				timer = setTimeout(clearPending, SEQUENCE_WINDOW_MS)
				return
			}

			// Single-key shortcut.
			const single = singles.get(key)
			if (single) {
				e.preventDefault()
				single.run()
			}
		}

		window.addEventListener('keydown', onKey)
		return () => {
			window.removeEventListener('keydown', onKey)
			clearPending()
		}
	}, [shortcuts])
}
