import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { ALL_SHORTCUTS, groupLabelKey, type ShortcutGroup, type ShortcutInfo } from '~/lib/useKeyboardShortcuts'
import { useT } from '~/lib/site-context'

/**
 * The `?` cheatsheet. Single-key shortcuts are powerful but invisible, so — like
 * Gmail/GitHub/Linear — pressing `?` (Shift+/) reveals every binding. It owns its
 * own open/close: `?` toggles it, Escape and backdrop-click dismiss. It renders
 * ALL_SHORTCUTS, the hand-maintained list that names every binding (the handlers
 * themselves live with their components).
 *
 * Mounted once near the root. Desktop-only in spirit (needs a keyboard); harmless
 * on mobile since `?` and the modal simply never get triggered.
 */

const GROUP_ORDER: ShortcutGroup[] = ['nav', 'tree', 'tabs']

/**
 * Open the cheatsheet from anywhere (e.g. the TopBar button) by dispatching this
 * event — ShortcutsHelp listens for it. Keeps the overlay's open state owned here
 * rather than lifted into root, matching the codebase's component-owns-behavior
 * pattern. Use the helper so the event name stays in one place.
 */
export const OPEN_SHORTCUTS_EVENT = 'docs:open-shortcuts'
export function openShortcutsHelp() {
	window.dispatchEvent(new CustomEvent(OPEN_SHORTCUTS_EVENT))
}

export function ShortcutsHelp() {
	const t = useT()
	const [open, setOpen] = useState(false)

	// `?` toggles the overlay — but only outside text fields and with no other
	// modifier (mirrors useKeyboardShortcuts' guard so it won't fire mid-typing).
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return
			const el = e.target
			if (el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
				return
			if (e.key === '?') {
				e.preventDefault()
				setOpen((o) => !o)
			} else if (e.key === 'Escape') {
				setOpen(false)
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [])

	// Open on demand from elsewhere (the TopBar button).
	useEffect(() => {
		const onOpen = () => setOpen(true)
		window.addEventListener(OPEN_SHORTCUTS_EVENT, onOpen)
		return () => window.removeEventListener(OPEN_SHORTCUTS_EVENT, onOpen)
	}, [])

	if (!open) return null

	const byGroup = new Map<ShortcutGroup, ShortcutInfo[]>()
	for (const r of ALL_SHORTCUTS) {
		const list = byGroup.get(r.group) ?? []
		list.push(r)
		byGroup.set(r.group, list)
	}

	return createPortal(
		<div
			className="fixed inset-0 z-100 flex items-start justify-center bg-background/40 p-4 pt-[12vh] backdrop-blur-sm"
			onMouseDown={() => setOpen(false)}
		>
			<div
				role="dialog"
				aria-label={t('shortcuts')}
				className="w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-lg border bg-popover shadow-xl"
				onMouseDown={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between border-b px-4 py-3">
					<h2 className="text-sm font-semibold">{t('shortcuts')}</h2>
					<button
						type="button"
						onClick={() => setOpen(false)}
						className="text-xs text-muted-foreground hover:text-foreground"
					>
						Esc
					</button>
				</div>
				<div className="max-h-[60vh] overflow-y-auto px-4 py-3">
					{GROUP_ORDER.filter((g) => byGroup.has(g)).map((group) => (
						<div key={group} className="mb-4 last:mb-0">
							<div className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
								{t(groupLabelKey(group))}
							</div>
							<ul className="space-y-1">
								{byGroup.get(group)!.map((r, i) => (
									<li key={i} className="flex items-center justify-between gap-4 text-sm">
										<span className="text-foreground">{t(r.labelKey)}</span>
										<kbd className="shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
											{r.hint}
										</kbd>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			</div>
		</div>,
		document.body,
	)
}
