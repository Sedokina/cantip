import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@remix-run/react'
import { Check, ChevronsUpDown } from 'lucide-react'

import { getProjects, getProject, type Project } from '~/lib/projects'
import { t } from '~/lib/site'
import { cn } from '~/lib/utils'

/** Logo + height tuned to dodge the unlayered `img{height:auto}` cascade (inline style wins). */
function ProjectLogo({ project, className }: { project: Project; className?: string }) {
	return (
		<img
			src={project.logo}
			alt=""
			aria-hidden
			width={20}
			height={20}
			style={{ height: 20, width: 20 }}
			className={cn('shrink-0 rounded', className)}
		/>
	)
}

interface Props {
	/** Id of the active project, or null when none is selected (e.g. `/`). */
	activeId: string | null
	className?: string
}

/**
 * Project selector shown in the top bar, just right of the logo. Displays the
 * current project (logo + name); clicking opens a dropdown of all projects, each
 * with its logo. Choosing one navigates to that project's landing doc — which
 * re-derives the active project and swaps the sidebar to its menu.
 */
export default function ProjectSwitcher({ activeId, className }: Props) {
	const navigate = useNavigate()
	const projects = getProjects()
	// null when no project is selected (e.g. on `/`) — the trigger shows a
	// neutral "choose a project" label instead of defaulting to the first.
	const active = activeId ? (getProject(activeId) ?? null) : null

	const [open, setOpen] = useState(false)
	const rootRef = useRef<HTMLDivElement>(null)

	// Close on outside click or Escape.
	useEffect(() => {
		if (!open) return
		const onDown = (e: MouseEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false)
		}
		document.addEventListener('mousedown', onDown)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', onDown)
			document.removeEventListener('keydown', onKey)
		}
	}, [open])

	const select = (p: Project) => {
		setOpen(false)
		if (p.id !== active?.id) navigate(p.landing)
	}

	return (
		<div ref={rootRef} className={cn('relative', className)}>
			<button
				type="button"
				aria-haspopup="listbox"
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
				className={cn(
					'flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm',
					'transition-colors hover:bg-sidebar-accent',
				)}
			>
				{active ? (
					<>
						<ProjectLogo project={active} />
						<span className="max-w-[10rem] truncate font-medium text-foreground">{active.name}</span>
					</>
				) : (
					<span className="max-w-[10rem] truncate font-medium text-muted-foreground">
						{t('selectProject')}
					</span>
				)}
				<ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
			</button>

			{open && (
				<ul
					role="listbox"
					className={cn(
						'absolute left-0 top-[calc(100%+4px)] z-50 min-w-[14rem] overflow-hidden rounded-md border bg-popover p-1 shadow-md',
					)}
				>
					{projects.map((p) => {
						const isActive = p.id === active?.id
						return (
							<li key={p.id} role="option" aria-selected={isActive}>
								<button
									type="button"
									onClick={() => select(p)}
									className={cn(
										'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
										'transition-colors hover:bg-sidebar-accent',
										isActive && 'bg-sidebar-accent',
									)}
								>
									<ProjectLogo project={p} />
									<span className="min-w-0 flex-1 truncate text-foreground">{p.name}</span>
									{isActive && <Check className="size-4 shrink-0 text-foreground" />}
								</button>
							</li>
						)
					})}
				</ul>
			)}
		</div>
	)
}
