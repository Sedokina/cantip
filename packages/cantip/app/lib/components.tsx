/**
 * Runtime component overrides (replaces the old generated `slots.ts` codegen).
 *
 * Instead of generating an import module at build time, overrides are passed as a
 * prop on the layout and read through React context — so swapping a component
 * needs NO regenerate, can be conditional, and is idiomatic React (the Fumadocs
 * approach). The user wires overrides in their own `app/root.tsx`:
 *
 *   <CantipProvider components={{ TopBar: MyTopBar, Home: MyHome }}>
 *     …
 *   </CantipProvider>
 *
 * Call sites read a resolved component via `useComponent('TopBar')` (override or
 * engine default).
 */
import { createContext, useContext, type ComponentType, type ReactNode } from 'react'

import DefaultTopBar from '~/components/TopBar'
import DefaultToc from '~/components/Toc'

/** The overridable slots and their (default) component types. */
export interface ComponentOverrides {
	/** Top bar: logo + project switcher + search + theme toggle. */
	TopBar?: ComponentType<any>
	/** Right-column table of contents. */
	Toc?: ComponentType<any>
	/** Home page body (the landing/project-cards page). */
	Home?: ComponentType<any>
	/** Doc page body. */
	DocPage?: ComponentType<any>
}

const DEFAULTS = {
	TopBar: DefaultTopBar,
	Toc: DefaultToc,
} as const

const ComponentsContext = createContext<ComponentOverrides>({})

/** Provide component overrides to the cantip layout + routes. */
export function CantipProvider({
	components = {},
	children,
}: {
	components?: ComponentOverrides
	children: ReactNode
}) {
	return <ComponentsContext.Provider value={components}>{children}</ComponentsContext.Provider>
}

/**
 * Resolve a slot that has an engine default (TopBar, Toc): returns the user's
 * override if provided, else the built-in component.
 */
export function useComponent<K extends keyof typeof DEFAULTS>(slot: K): ComponentType<any> {
	const overrides = useContext(ComponentsContext)
	return overrides[slot] ?? DEFAULTS[slot]
}

/**
 * Resolve a route-body slot that has NO engine default here (Home, DocPage) —
 * the route file owns its own default body. Returns the override or `null`.
 */
export function useOverride(slot: 'Home' | 'DocPage'): ComponentType<any> | null {
	const overrides = useContext(ComponentsContext)
	return overrides[slot] ?? null
}
