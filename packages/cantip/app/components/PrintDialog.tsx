import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from '@remix-run/react'
import { ArrowDown, ArrowUp, FilePlus, GripVertical, Printer, X } from 'lucide-react'
import {
	DndContext,
	KeyboardSensor,
	MouseSensor,
	TouchSensor,
	closestCenter,
	useSensor,
	useSensors,
	type Announcements,
	type DragEndEvent,
	type UniqueIdentifier,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'

import { Button } from '~/components/ui/button'
import {
	openPrint,
	readPrintOptions,
	usePrintList,
	writePrintOptions,
	type PrintListItem,
	type PrintOptions,
} from '~/lib/print-list'
import { useT } from '~/lib/site-context'
import { cn } from '~/lib/utils'

/** Title-row button that opens the print dialog. Shows how many pages the print list holds. */
export function PrintButton({ title }: { title: string }) {
	const { pathname } = useLocation()
	const t = useT()
	const { items } = usePrintList()
	const [open, setOpen] = useState(false)
	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-label={t('print')}
				title={t('print')}
				className="relative inline-flex size-8 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
			>
				<Printer className="size-4" />
				{items.length > 0 && (
					<span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold leading-none text-primary-foreground">
						{items.length}
					</span>
				)}
			</button>
			{open && <PrintDialog href={pathname} title={title} onClose={() => setOpen(false)} />}
		</>
	)
}

/**
 * Prints one page, or the reader's print list as one document. Both open
 * `/_print` in a new tab, which calls the browser's print dialog.
 */
export default function PrintDialog({
	href,
	title,
	onClose,
}: {
	/** The page "This page" prints and "Add this page" adds: a doc or image URL. Unset shows only the print list. */
	href?: string
	title?: string
	onClose: () => void
}) {
	const t = useT()
	const list = usePrintList()
	const [options, setOptions] = useState(readPrintOptions)
	const dragging = useRef(false)

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			// Escape during a drag cancels the drag. This listener runs before dnd-kit's.
			if (e.key === 'Escape' && !dragging.current) onClose()
		}
		document.addEventListener('keydown', onKey)
		const prev = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => {
			document.removeEventListener('keydown', onKey)
			document.body.style.overflow = prev
		}
	}, [onClose])

	const setOption = (key: keyof PrintOptions, value: boolean) => {
		const next = { ...options, [key]: value }
		setOptions(next)
		writePrintOptions(next)
	}

	const print = (pages: Pick<PrintListItem, 'href' | 'newSheet'>[]) => {
		openPrint(pages, options)
		onClose()
	}

	// The first page can start a new sheet only after the combined table of contents.
	const canStartSheet = (index: number) => index > 0 || (options.toc && list.items.length > 1)
	const sheetItems = list.items.filter((_, index) => canStartSheet(index))
	const allNewSheet = sheetItems.length > 0 && sheetItems.every((item) => item.newSheet)
	const someNewSheet = sheetItems.some((item) => item.newSheet)

	return createPortal(
		<div
			className="fixed inset-0 z-[200] flex items-start justify-center bg-background/40 p-4 pt-[10vh] backdrop-blur-sm max-md:items-end max-md:p-0"
			onMouseDown={onClose}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={t('print')}
				className="flex max-h-[80vh] w-[min(30rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border bg-popover text-sm shadow-xl max-md:w-full max-md:rounded-b-none max-md:pb-[env(safe-area-inset-bottom)]"
				onMouseDown={(e) => e.stopPropagation()}
			>
				<div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
					<span className="font-semibold text-foreground">{t('print')}</span>
					<button
						type="button"
						onClick={onClose}
						className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
						aria-label={t('close')}
					>
						<X className="size-5" />
					</button>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto">
					<div role="group" aria-labelledby="print-include" className="border-b px-4 py-3">
						<p id="print-include" className="m-0 mb-2 text-xs font-medium text-muted-foreground">
							{t('printInclude')}
						</p>
						<div className="flex flex-wrap gap-x-6 gap-y-2">
							<Checkbox label={t('toc')} checked={options.toc} onChange={(v) => setOption('toc', v)} />
							<Checkbox
								label={t('properties')}
								checked={options.props}
								onChange={(v) => setOption('props', v)}
							/>
							<Checkbox
								label={t('printExtensions')}
								checked={options.ext}
								onChange={(v) => setOption('ext', v)}
							/>
						</div>
					</div>

					{href && (
						<section className="border-b px-4 py-3">
							<h3 className="m-0 mb-2 text-xs font-medium text-muted-foreground">{t('printThisPage')}</h3>
							<div className="flex items-center justify-between gap-3">
								<span className="min-w-0 truncate text-foreground">{title}</span>
								<Button size="sm" onClick={() => print([{ href }])}>
									<Printer className="size-4" />
									{t('print')}
								</Button>
							</div>
						</section>
					)}

					<section className="px-4 py-3">
						<div className="mb-2 flex items-center gap-1">
							<h3 className="m-0 flex-1 text-xs font-medium text-muted-foreground">
								{t('printList')} ({list.items.length})
							</h3>
							{list.items.length > 0 && (
								<>
									<IconButton
										label={t('printPageBreaks')}
										pressed={allNewSheet || (someNewSheet && 'mixed')}
										disabled={sheetItems.length === 0}
										onClick={() => list.setAllNewSheet(!allNewSheet)}
									>
										<FilePlus className="size-4" />
									</IconButton>
									{/* Lines the button up with the rows' new-sheet buttons, which ↑, ↓ and × follow. */}
									<span className="w-20 shrink-0" />
								</>
							)}
						</div>
						{list.items.length === 0 ? (
							<p className="m-0 text-muted-foreground">{t('printListEmpty')}</p>
						) : (
							<PrintListItems list={list} dragging={dragging} canStartSheet={canStartSheet} />
						)}
						<div className="mt-3 flex flex-wrap items-center gap-2">
							{href && (
								<Button
									variant="outline"
									size="sm"
									disabled={list.has(href)}
									onClick={() => list.add(href, title ?? href)}
								>
									{t('addThisPage')}
								</Button>
							)}
							<Button
								variant="outline"
								size="sm"
								disabled={list.items.length === 0}
								onClick={list.clear}
							>
								{t('clear')}
							</Button>
							<Button
								size="sm"
								className="ml-auto"
								disabled={list.items.length === 0}
								onClick={() => print(list.items)}
							>
								<Printer className="size-4" />
								{t('print')}
							</Button>
						</div>
					</section>
				</div>
			</div>
		</div>,
		document.body,
	)
}

function PrintListItems({
	list,
	dragging,
	canStartSheet,
}: {
	list: ReturnType<typeof usePrintList>
	dragging: MutableRefObject<boolean>
	canStartSheet: (index: number) => boolean
}) {
	const sensors = useSensors(
		// The distance keeps a click on a row's buttons from starting a drag.
		useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
		// A long press starts a drag on touch screens, so a swipe still scrolls the dialog.
		useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	)
	const t = useT()
	const hrefs = list.items.map((item) => item.href)
	const lastOver = useRef<UniqueIdentifier | null>(null)
	const onDragEnd = ({ active, over }: DragEndEvent) => {
		dragging.current = false
		if (!over || active.id === over.id) return
		list.moveTo(hrefs.indexOf(String(active.id)), hrefs.indexOf(String(over.id)))
	}
	const announce = (key: string, id: UniqueIdentifier, at: UniqueIdentifier) =>
		t(key)
			.replace('{title}', list.items[hrefs.indexOf(String(id))]?.title ?? '')
			.replace('{position}', String(hrefs.indexOf(String(at)) + 1))
			.replace('{count}', String(hrefs.length))
	const announcements: Announcements = {
		onDragStart: ({ active }) => {
			lastOver.current = active.id
			return announce('dragStart', active.id, active.id)
		},
		// dnd-kit reports the row over itself right after the drag starts, which would replace "Picked up".
		onDragOver: ({ active, over }) => {
			if (!over || over.id === lastOver.current) return undefined
			lastOver.current = over.id
			return announce('dragOver', active.id, over.id)
		},
		onDragEnd: ({ active, over }) => announce('dragEnd', active.id, over?.id ?? active.id),
		onDragCancel: ({ active }) => announce('dragCancel', active.id, active.id),
	}
	return (
		<DndContext
			accessibility={{ announcements, screenReaderInstructions: { draggable: t('dragInstructions') } }}
			sensors={sensors}
			collisionDetection={closestCenter}
			modifiers={[restrictToVerticalAxis, restrictToParentElement]}
			onDragStart={() => (dragging.current = true)}
			onDragEnd={onDragEnd}
			onDragCancel={() => (dragging.current = false)}
		>
			<SortableContext items={hrefs} strategy={verticalListSortingStrategy}>
				<ol className="m-0 list-none space-y-1 p-0">
					{list.items.map((item, index) => (
						<PrintListRow
							key={item.href}
							item={item}
							index={index}
							list={list}
							canStartSheet={canStartSheet(index)}
						/>
					))}
				</ol>
			</SortableContext>
		</DndContext>
	)
}

function PrintListRow({
	item,
	index,
	list,
	canStartSheet,
}: {
	item: PrintListItem
	index: number
	list: ReturnType<typeof usePrintList>
	canStartSheet: boolean
}) {
	const t = useT()
	const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
		id: item.href,
	})
	return (
		<li
			ref={setNodeRef}
			{...listeners}
			style={{ transform: CSS.Translate.toString(transform), transition }}
			className={cn(
				'relative flex cursor-grab touch-manipulation select-none items-center gap-1 rounded-md',
				isDragging && 'z-10 cursor-grabbing bg-accent shadow-md',
			)}
		>
			{/* The grip is the keyboard handle: the keyboard sensor only starts a drag from the activator node. */}
			<button
				type="button"
				ref={setActivatorNodeRef}
				{...attributes}
				aria-label={t('dragToReorder')}
				title={t('dragToReorder')}
				className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
			>
				<GripVertical className="size-4" />
			</button>
			<span className="w-5 shrink-0 text-right text-muted-foreground">{index + 1}.</span>
			<span className="min-w-0 flex-1 truncate pl-1 text-foreground" title={item.href}>
				{item.title}
			</span>
			<IconButton
				label={t('printNewSheet')}
				pressed={item.newSheet === true}
				disabled={!canStartSheet}
				onClick={() => list.setNewSheet(item.href, !item.newSheet)}
			>
				<FilePlus className="size-4" />
			</IconButton>
			<IconButton label={t('moveUp')} disabled={index === 0} onClick={() => list.move(index, -1)}>
				<ArrowUp className="size-4" />
			</IconButton>
			<IconButton
				label={t('moveDown')}
				disabled={index === list.items.length - 1}
				onClick={() => list.move(index, 1)}
			>
				<ArrowDown className="size-4" />
			</IconButton>
			<IconButton label={t('remove')} onClick={() => list.remove(item.href)}>
				<X className="size-4" />
			</IconButton>
		</li>
	)
}

function Checkbox({
	label,
	checked,
	onChange,
}: {
	label: string
	checked: boolean
	onChange: (checked: boolean) => void
}) {
	return (
		<label className="flex cursor-pointer items-center gap-2 text-foreground">
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				className="size-4 accent-primary"
			/>
			{label}
		</label>
	)
}

function IconButton({
	label,
	pressed,
	disabled,
	onClick,
	children,
}: {
	label: string
	/** Set for a toggle button. */
	pressed?: boolean | 'mixed'
	disabled?: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={pressed}
			title={label}
			disabled={disabled}
			onClick={onClick}
			className={cn(
				'rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground',
				'disabled:pointer-events-none disabled:opacity-30',
				pressed && 'text-primary hover:text-primary',
				pressed === true && 'bg-primary/15 hover:bg-primary/25',
			)}
		>
			{children}
		</button>
	)
}
