import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

import { Button } from '~/components/ui/button'
import { useSite, useT } from '~/lib/site-context'

const STORAGE_KEY = 'theme'

/**
 * Build the inline script injected into <head> (before paint) so the correct theme
 * class is on <html> before first render — avoids a flash of the wrong theme. Uses
 * the configured `defaultTheme` when nothing is stored. A factory (not a constant)
 * because `defaultTheme` is now runtime loader data, built in root.tsx.
 */
export function buildThemeInitScript(defaultTheme: 'dark' | 'light'): string {
	const defaultsDark = defaultTheme !== 'light'
	return `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');var d=t?t==='dark':${defaultsDark};document.documentElement.classList.toggle('dark',d);}catch(e){document.documentElement.classList.${defaultsDark ? 'add' : 'remove'}('dark');}})();`
}

function getInitialIsDark(defaultsDark: boolean): boolean {
	if (typeof document === 'undefined') return defaultsDark
	return document.documentElement.classList.contains('dark')
}

export function ThemeToggle({ className }: { className?: string }) {
	const t = useT()
	const defaultsDark = useSite().defaultTheme !== 'light'
	// Render a stable icon during SSR/first paint; sync to the real DOM state
	// after mount so the button reflects whatever the init script applied.
	const [isDark, setIsDark] = useState(defaultsDark)
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
		setIsDark(getInitialIsDark(defaultsDark))
	}, [defaultsDark])

	function toggle() {
		const next = !isDark
		setIsDark(next)
		// Suppress CSS transitions for the duration of the theme swap. Several
		// elements (search input, project switcher, home cards, buttons) carry a
		// `transition-colors`/`transition-all` for their hover states, which would
		// otherwise also animate the color change on theme toggle — making them lag
		// visibly behind the sidebar/content that have no transition. We add a
		// global override that zeroes transitions, flip the class, force a reflow,
		// then remove the override on the next frame so hovers animate normally again.
		const root = document.documentElement
		root.classList.add('theme-switching')
		root.classList.toggle('dark', next)
		// Force a synchronous style flush so the no-transition state is committed
		// with the new colors before transitions are restored.
		void root.offsetHeight
		requestAnimationFrame(() => root.classList.remove('theme-switching'))
		try {
			localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
		} catch {
			/* ignore */
		}
	}

	return (
		<Button
			variant="ghost"
			size="icon"
			className={className}
			onClick={toggle}
			aria-label={t('toggleTheme')}
			title={t('toggleTheme')}
		>
			{mounted && !isDark ? <Sun /> : <Moon />}
		</Button>
	)
}
