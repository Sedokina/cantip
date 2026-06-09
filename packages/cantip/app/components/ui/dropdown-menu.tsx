import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '~/lib/utils'

/**
 * Lightweight dropdown menu — no extra dependency, mirrors the hand-rolled
 * pattern used across the app (ProjectSwitcher, Sidebar RowMenu). A trigger
 * button toggles a menu rendered in a portal with fixed positioning computed
 * from the trigger rect, so it's never clipped by an ancestor's `overflow`.
 *
 * Closes on outside click, Escape, scroll, or resize. The menu is anchored to a
 * corner of the trigger via `align`:
 *   - 'start' : menu's left edge aligns with the trigger's left edge
 *   - 'end'   : menu's right edge aligns with the trigger's right edge
 *
 * Compose menu contents with <DropdownMenuItem>. `onSelect` fires then the menu
 * closes automatically.
 */

interface MenuPos {
	top: number
	/** The CSS `left` for the menu box; combined with `translateX` for `end` align. */
	left: number
	align: 'start' | 'end'
}

/** Lets a <DropdownMenuItem> close its own parent menu after selecting. */
const MenuCloseContext = createContext<() => void>(() => {})

export function DropdownMenu({
	trigger,
	children,
	align = 'start',
	menuClassName,
	className,
	label,
}: {
	/** Render the trigger; receives the live open state for styling. */
	trigger: (state: { open: boolean }) => React.ReactNode
	children: React.ReactNode
	align?: 'start' | 'end'
	/** Extra classes for the menu box. */
	menuClassName?: string
	/** Classes for the trigger button; a function receives the live open state. */
	className?: string | ((state: { open: boolean }) => string)
	/** Accessible label for the trigger button. */
	label?: string
}) {
	const [open, setOpen] = useState(false)
	const [pos, setPos] = useState<MenuPos | null>(null)
	const btnRef = useRef<HTMLButtonElement>(null)
	const menuId = useId()

	useEffect(() => {
		if (!open) return
		const close = () => setOpen(false)
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false)
		}
		// Close on any outside interaction; also on scroll/resize, since the fixed
		// menu would otherwise drift away from its (scrolled) trigger.
		document.addEventListener('mousedown', close)
		document.addEventListener('keydown', onKey)
		window.addEventListener('scroll', close, true)
		window.addEventListener('resize', close)
		return () => {
			document.removeEventListener('mousedown', close)
			document.removeEventListener('keydown', onKey)
			window.removeEventListener('scroll', close, true)
			window.removeEventListener('resize', close)
		}
	}, [open])

	const toggle = (e: React.MouseEvent) => {
		// Don't let an ancestor's onClick (e.g. a row navigation) fire too.
		e.stopPropagation()
		e.preventDefault()
		if (!open && btnRef.current) {
			const r = btnRef.current.getBoundingClientRect()
			setPos({ top: r.bottom + 4, left: align === 'end' ? r.right : r.left, align })
		}
		setOpen((o) => !o)
	}

	return (
		<>
			<button
				ref={btnRef}
				type="button"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? menuId : undefined}
				aria-label={label}
				onClick={toggle}
				className={typeof className === 'function' ? className({ open }) : className}
			>
				{trigger({ open })}
			</button>
			{open &&
				pos &&
				createPortal(
					<div
						id={menuId}
						role="menu"
						// Block the document mousedown-to-close for clicks inside the menu.
						onMouseDown={(e) => e.stopPropagation()}
						onClick={(e) => e.stopPropagation()}
						style={{
							position: 'fixed',
							top: pos.top,
							left: pos.left,
							transform: pos.align === 'end' ? 'translateX(-100%)' : undefined,
						}}
						className={cn(
							'z-[200] min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
							menuClassName,
						)}
					>
						<MenuCloseContext.Provider value={() => setOpen(false)}>
							{children}
						</MenuCloseContext.Provider>
					</div>,
					document.body,
				)}
		</>
	)
}

export function DropdownMenuItem({
	onSelect,
	children,
	className,
}: {
	onSelect: () => void
	children: React.ReactNode
	className?: string
}) {
	const close = useContext(MenuCloseContext)
	return (
		<button
			type="button"
			role="menuitem"
			onClick={() => {
				close()
				onSelect()
			}}
			className={cn(
				'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent',
				className,
			)}
		>
			{children}
		</button>
	)
}
