/**
 * Minimal logger interface used by the content-generation pipeline.
 * Replaces Astro's `AstroIntegrationLogger`. Satisfied by `console` or a
 * thin wrapper (see scripts/generate-content.ts).
 */
export interface Logger {
	info(message: string): void
	warn(message: string): void
	error(message: string): void
}
