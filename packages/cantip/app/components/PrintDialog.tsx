import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from '@remix-run/react'
import { ArrowDown, ArrowUp, Printer, X } from 'lucide-react'

import { Button } from '~/components/ui/button'
import { openPrint, readPrintOptions, usePrintList, writePrintOptions, type PrintOptions } from '~/lib/print-list'
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
	/** The page "This page" prints and "Add this page" adds: a doc or image URL. */
	href: string
	title: string
	onClose: () => void
}) {
	const t = useT()
	const list = usePrintList()
	const [options, setOptions] = useState(readPrintOptions)

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
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

	const print = (hrefs: string[]) => {
		openPrint(hrefs, options)
		onClose()
	}

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
						</div>
					</div>

					<section className="border-b px-4 py-3">
						<h3 className="m-0 mb-2 text-xs font-medium text-muted-foreground">{t('printThisPage')}</h3>
						<div className="flex items-center justify-between gap-3">
							<span className="min-w-0 truncate text-foreground">{title}</span>
							<Button size="sm" onClick={() => print([href])}>
								<Printer className="size-4" />
								{t('print')}
							</Button>
						</div>
					</section>

					<section className="px-4 py-3">
						<h3 className="m-0 mb-2 text-xs font-medium text-muted-foreground">
							{t('printList')} ({list.items.length})
						</h3>
						{list.items.length === 0 ? (
							<p className="m-0 text-muted-foreground">{t('printListEmpty')}</p>
						) : (
							<ol className="m-0 list-none space-y-1 p-0">
								{list.items.map((item, index) => (
									<li key={item.href} className="flex items-center gap-1">
										<span className="w-5 shrink-0 text-right text-muted-foreground">{index + 1}.</span>
										<span className="min-w-0 flex-1 truncate pl-1 text-foreground" title={item.href}>
											{item.title}
										</span>
										<IconButton
											label={t('moveUp')}
											disabled={index === 0}
											onClick={() => list.move(index, -1)}
										>
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
								))}
							</ol>
						)}
						<div className="mt-3">
							<Checkbox
								label={t('printPageBreaks')}
								checked={options.breaks}
								onChange={(v) => setOption('breaks', v)}
							/>
						</div>
						<div className="mt-3 flex flex-wrap items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={list.has(href)}
								onClick={() => list.add(href, title)}
							>
								{t('addThisPage')}
							</Button>
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
								onClick={() => print(list.items.map((item) => item.href))}
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
	disabled,
	onClick,
	children,
}: {
	label: string
	disabled?: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={onClick}
			className={cn(
				'rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground',
				'disabled:pointer-events-none disabled:opacity-30',
			)}
		>
			{children}
		</button>
	)
}
