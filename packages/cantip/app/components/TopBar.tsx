import { Keyboard } from 'lucide-react'

import { ThemeToggle } from '~/components/theme-toggle'
import { Search } from '~/components/Search'
import ProjectSwitcher from '~/components/ProjectSwitcher'
import { openShortcutsHelp } from '~/components/ShortcutsHelp'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import { t } from '~/lib/site'
import { useSite } from '~/lib/site-context'

interface Props {
	/** Active project id, or null when no project is selected (e.g. `/`). */
	projectId: string | null
}

/**
 * Slim top bar: logo + project switcher on the left, centered search, theme
 * toggle on the right. Full-width and sticky at the top of the page: stays
 * pinned while content scrolls beneath it, and the sidebar starts below it
 * (so the bar overlaps neither the content nor the menu).
 * Desktop only — mobile has its own bottom bar with the switcher and toggle.
 */
export default function TopBar({ projectId }: Props) {
	const site = useSite()
	return (
		<div
			className={cn(
				'sticky top-0 z-50 flex h-11 items-center justify-between px-3 max-md:hidden',
				'border-b bg-background',
			)}
		>
			<div className="flex shrink-0 items-center gap-3">
				<a href="/" className="flex shrink-0 items-center">
					{/* Theme is class-based (<html class="dark">), driven by the in-app toggle —
					    NOT prefers-color-scheme — so swap logos on the `dark` class, not the OS
					    setting. The *-dark.svg has white text (for dark bg); *-light.svg has
					    black text (for light bg). Inline height: app.css has an unlayered
					    `img { height: auto }` rule that otherwise beats Tailwind's h-* utility. */}
					<img
						src={site.logo.light}
						alt={site.title}
						style={{ height: 20, width: 'auto' }}
						className="block dark:hidden"
					/>
					<img
						src={site.logo.dark}
						alt={site.title}
						style={{ height: 20, width: 'auto' }}
						className="hidden dark:block"
					/>
				</a>
				{/* Project selector sits just right of the logo. */}
				<ProjectSwitcher activeId={projectId} />
			</div>
			{/* Centered search: absolutely positioned so it stays centered in the bar
			    regardless of the logo / toggle widths on either side. */}
			<div className="absolute left-1/2 -translate-x-1/2">
				<Search className="w-full max-w-md justify-start sm:w-80 md:w-96" />
			</div>
			<div className="flex shrink-0 items-center">
				{/* Opens the `?` cheatsheet — same overlay the `?` key toggles. */}
				<Button
					variant="ghost"
					size="icon"
					onClick={openShortcutsHelp}
					aria-label={t('shortcuts')}
					title={`${t('shortcuts')} (?)`}
				>
					<Keyboard />
				</Button>
				<ThemeToggle />
			</div>
		</div>
	)
}
