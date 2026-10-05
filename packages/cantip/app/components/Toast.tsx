import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { useT } from '~/lib/site-context'

/**
 * A short confirmation at the bottom of the screen, e.g. after adding pages to
 * the print list from a menu that closes on click. One toast at a time: a new
 * one replaces the current one. Shown by dispatching an event, so callers need
 * no provider; `<Toaster />` is mounted once in the root layout.
 */

export interface ToastOptions {
	message: string
	action?: { label: string; run: () => void }
}

const TOAST_EVENT = 'docs:toast'
const DURATION_MS = 4000

export function showToast(options: ToastOptions): void {
	window.dispatchEvent(new CustomEvent<ToastOptions>(TOAST_EVENT, { detail: options }))
}

export function Toaster() {
	const t = useT()
	const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null)

	useEffect(() => {
		let id = 0
		const onToast = (e: Event) => setToast({ ...(e as CustomEvent<ToastOptions>).detail, id: ++id })
		window.addEventListener(TOAST_EVENT, onToast)
		return () => window.removeEventListener(TOAST_EVENT, onToast)
	}, [])

	// Keyed on the toast id, so a replacing toast gets its own full duration.
	useEffect(() => {
		if (!toast) return
		const timer = setTimeout(() => setToast(null), DURATION_MS)
		return () => clearTimeout(timer)
	}, [toast?.id])

	if (!toast) return null

	return createPortal(
		<div
			role="status"
			className="fixed inset-x-0 bottom-6 z-[150] flex justify-center px-4 max-md:bottom-[calc(var(--mobile-bar-height)+env(safe-area-inset-bottom)+1.5rem)]"
		>
			<div className="flex max-w-full items-center gap-3 rounded-lg border bg-popover py-2 pl-4 pr-2 text-sm text-popover-foreground shadow-lg">
				<span className="min-w-0 truncate">{toast.message}</span>
				{toast.action && (
					<button
						type="button"
						onClick={() => {
							toast.action?.run()
							setToast(null)
						}}
						className="shrink-0 rounded-md px-2 py-1 font-medium text-primary hover:bg-accent"
					>
						{toast.action.label}
					</button>
				)}
				<button
					type="button"
					onClick={() => setToast(null)}
					aria-label={t('close')}
					className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
				>
					<X className="size-4" />
				</button>
			</div>
		</div>,
		document.body,
	)
}
