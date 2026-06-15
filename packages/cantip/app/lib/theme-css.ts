/**
 * Render theme color tokens into a `:root`/`.dark` CSS block.
 *
 * Pure + dependency-free (no `~/generated`, no Node), so it's safe to import from
 * BOTH the content generator (Node) — historically `renderThemeCss` in
 * `scripts/emit-config.ts` — and the runtime app (`app/root.tsx`), which now
 * injects this as an inline `<style>` from loader data instead of importing a
 * built CSS asset. Both sides must agree on the output, so it lives here once.
 */
import type { ThemeColors } from './config/site'

/** A `selector { --k: v; … }` block from a token map. */
function block(selector: string, vars: Record<string, string>): string {
	const lines = Object.entries(vars).map(([k, v]) => `\t${k}: ${v};`)
	return `${selector} {\n${lines.join('\n')}\n}`
}

/**
 * The `:root` (light) + `.dark` token blocks for a resolved theme. Rendered into
 * an inline `<style>` at runtime; must be ordered AFTER the Tailwind stylesheet so
 * these custom properties win.
 */
export function renderThemeCss(colors: ThemeColors): string {
	return `${block(':root', colors.light)}\n\n${block('.dark', colors.dark)}\n`
}
