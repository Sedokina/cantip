import { useEffect } from 'react'
import { useNavigate } from '@remix-run/react'
import { Check, X } from 'lucide-react'

import { getProjects, getProject, type Project } from '~/lib/projects'
import { ThemeToggle } from '~/components/theme-toggle'
import { t } from '~/lib/site'
import { cn } from '~/lib/utils'

/** Logo sized via inline style to win the unlayered `img{height:auto}` cascade. */
function ProjectLogo({ project }: { project: Project }) {
	return (
		<img
			src={project.logo}
			alt=""
			aria-hidden
			width={24}
			height={24}
			style={{ height: 24, width: 24 }}
			className="shrink-0 rounded"
		/>
	)
}

interface Props {
	/** Id of the active project, or null when none is selected (e.g. `/`). */
	activeId: string | null
	open: boolean
	onClose: () => void
}

/**
 * Fullscreen mobile "side menu": the project list rendered as tappable items
 * (not a dropdown), the active one ticked, plus a theme-toggle row at the bottom.
 * Picking a project navigates to its landing doc — the root loader then re-derives
 * the active project and swaps the sidebar. Lives above the floating bottom bar
 * (which stays visible) so the Projects tab can re-tap to close. Self-contained
 * Escape + body-scroll-lock, mirroring the Search/ProjectSwitcher pattern.
 */
export default function MobileProjectsPanel({ activeId, open, onClose }: Props) {
	const navigate = useNavigate()
	const projects = getProjects()
	const active = activeId ? (getProject(activeId) ?? null) : null

	// Escape closes; lock background scroll while open.
	useEffect(() => {
		if (!open) return
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
	}, [open, onClose])

	if (!open) return null

	const select = (p: Project) => {
		onClose()
		if (p.id !== active?.id) navigate(p.landing)
	}

	return (
		// Sits below the floating bar (bottom inset clears it) so the bar's Projects
		// tab stays tappable to toggle the panel shut.
		<div className="fixed inset-x-0 bottom-0 top-0 z-90 flex flex-col bg-popover pb-[calc(var(--mobile-bar-height)+env(safe-area-inset-bottom)+3rem)] md:hidden">
			<div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
				<span className="text-sm font-semibold text-foreground">{t('projects')}</span>
				<button
					type="button"
					onClick={onClose}
					className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
					aria-label={t('close')}
				>
					<X className="size-5" />
				</button>
			</div>

			<ul className="min-h-0 flex-1 overflow-y-auto p-2">
				{projects.map((p) => {
					const isActive = p.id === active?.id
					return (
						<li key={p.id}>
							<button
								type="button"
								onClick={() => select(p)}
								className={cn(
									'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left',
									'transition-colors hover:bg-sidebar-accent',
									isActive && 'bg-sidebar-accent',
								)}
							>
								<ProjectLogo project={p} />
								<span className="min-w-0 flex-1 truncate text-base text-foreground">{p.name}</span>
								{isActive && <Check className="size-5 shrink-0 text-foreground" />}
							</button>
						</li>
					)
				})}
			</ul>

			{/* Theme toggle row — a normal "settings" row at the bottom of the menu. */}
			<div className="flex shrink-0 items-center justify-between border-t px-4 py-3">
				<span className="text-sm text-foreground">{t('theme')}</span>
				<ThemeToggle className="text-muted-foreground" />
			</div>
		</div>
	)
}
