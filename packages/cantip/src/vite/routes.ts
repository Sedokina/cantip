/**
 * `cantipRoutes()` — `import { cantipRoutes } from 'cantip/vite'`.
 *
 * Registers the routes cantip owns (print view, Jira endpoints) with the Remix
 * plugin, so a site gets them, and any route a later version adds, without a stub
 * file per route in its `app/routes/`:
 *
 *   remix({ routes: cantipRoutes() })
 *
 * The doc page, the home page and the root layout stay files in the site's
 * `app/`, because sites edit them.
 */
import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import type { VitePluginConfig } from '@remix-run/dev'

import { findPkgDir } from './package-dir'

export interface CantipRoutesOptions {
	/** The Remix app directory, relative to the current directory. Default `app`. */
	appDirectory?: string
	/** URL paths not to register, e.g. `['/api/jira']`. */
	exclude?: string[]
}

interface CantipRoute {
	/** URL path without the leading slash. */
	path: string
	/** Route module, relative to the cantip package. */
	file: string
	/** The name of the stub file a site may already have for this route in `app/routes/`. */
	stub: string
}

const ROUTES: CantipRoute[] = [
	{ path: '_print', file: 'app/routes/print.route.tsx', stub: '[_print]' },
	{ path: 'api/jira', file: 'app/routes/api.jira.ts', stub: 'api.jira' },
	{ path: 'jira/connect', file: 'app/routes/jira.connect.ts', stub: 'jira.connect' },
	{ path: 'jira/callback', file: 'app/routes/jira.callback.ts', stub: 'jira.callback' },
	{ path: 'jira/disconnect', file: 'app/routes/jira.disconnect.ts', stub: 'jira.disconnect' },
]

const ROUTE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']

/**
 * Remix serves either of two routes with the same path without a warning, and
 * which one wins depends on its internal order. A site's own file for the path
 * must always win, so cantip skips the path then.
 */
function siteHasRoute(routesDir: string, stub: string): boolean {
	return ROUTE_EXTENSIONS.some(
		(ext) =>
			existsSync(path.join(routesDir, stub + ext)) || existsSync(path.join(routesDir, stub, 'route' + ext)),
	)
}

export function cantipRoutes(options: CantipRoutesOptions = {}): NonNullable<VitePluginConfig['routes']> {
	const appDir = path.resolve(process.cwd(), options.appDirectory ?? 'app')
	// Remix recognises a route module by the path it registers. Vite resolves
	// symlinks (workspaces, pnpm), so a symlinked path makes Remix miss the route
	// module and leave its `.server` loader import in the browser build.
	const pkgDir = realpathSync(findPkgDir())
	const excluded = new Set((options.exclude ?? []).map((p) => p.replace(/^\/+|\/+$/g, '')))

	return (defineRoutes) =>
		defineRoutes((route) => {
			for (const r of ROUTES) {
				if (excluded.has(r.path) || siteHasRoute(path.join(appDir, 'routes'), r.stub)) continue
				route(r.path, path.relative(appDir, path.join(pkgDir, r.file)), { id: `cantip/${r.path}` })
			}
		})
}
