import { Home, FolderTree, LayoutGrid, Search as SearchIcon } from 'lucide-react'
import { Link } from '@remix-run/react'

import { Search } from '~/components/Search'
import { t } from '~/lib/site'
import { cn } from '~/lib/utils'

interface Props {
	/** Whether the directory (sidebar) overlay is open — drives the tab's active state. */
	dirsOpen: boolean
	/** Whether the fullscreen projects panel is open. */
	projectsOpen: boolean
	/** Whether there's a file tree to open. False with no active project (e.g. `/`),
	 *  where the Files tab is disabled since there's nothing to show. */
	filesEnabled: boolean
	onToggleDirs: () => void
	onToggleProjects: () => void
}

/** Shared classes for a tab: stacked icon + label, active = foreground colour. */
const tab =
	'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[0.625rem] font-medium text-muted-foreground transition-colors'
const tabActive = 'text-foreground'

/**
 * Classic mobile floating bottom navigation: a detached, rounded pill anchored
 * above the bottom safe area. Four tabs, in order — Home (link to `/`), Projects
 * (the fullscreen project switcher, which also houses the theme toggle), Files
 * (the desktop sidebar tree, opened as a mobile overlay), and Search (reuses the
 * Pagefind Search modal). No standalone theme button — theme lives inside Projects.
 *
 * Only the floating-bar chrome lives here; the panels it toggles (sidebar overlay,
 * projects panel) are rendered by the root so they can sit behind this bar.
 */
export default function MobileBottomBar({
	dirsOpen,
	projectsOpen,
	filesEnabled,
	onToggleDirs,
	onToggleProjects,
}: Props) {
	return (
		<nav
			className={cn(
				'fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-100 md:hidden',
				'flex items-stretch gap-1 rounded-2xl border bg-sidebar/95 px-1.5 py-1 shadow-lg backdrop-blur',
			)}
			aria-label={t('navigation')}
		>
			<Link to="/" className={tab} aria-label={t('home')}>
				<Home className="size-5" />
				<span>{t('home')}</span>
			</Link>

			<button
				type="button"
				onClick={onToggleProjects}
				className={cn(tab, projectsOpen && tabActive)}
				aria-label={t('projects')}
				aria-expanded={projectsOpen}
			>
				<LayoutGrid className="size-5" />
				<span>{t('projects')}</span>
			</button>

			<button
				type="button"
				onClick={onToggleDirs}
				disabled={!filesEnabled}
				className={cn(tab, dirsOpen && tabActive, 'disabled:pointer-events-none disabled:opacity-40')}
				aria-label={t('files')}
				aria-expanded={dirsOpen}
			>
				<FolderTree className="size-5" />
				<span>{t('files')}</span>
			</button>

			{/* Reuse the Pagefind Search modal, but render our own stacked tab as its
			    trigger so it matches the other tabs (icon over label). The desktop
			    TopBar's instance owns ⌘K, so disable the shortcut here to avoid
			    double-opening. */}
			<Search
				enableShortcut={false}
				trigger={(open) => (
					<button type="button" onClick={open} className={tab} aria-label={t('search')}>
						<SearchIcon className="size-5" />
						<span>{t('search')}</span>
					</button>
				)}
			/>
		</nav>
	)
}
