#!/usr/bin/env sh
# Generic cantip docs-host entrypoint.
#
# Wires the client's mounted /docs volume into the baked (create-cantip-scaffolded)
# app, builds, and serves. The volume is the single source of client specifics:
#
#   /docs/docs.config.ts   (required) — the cantip config
#   /docs/<content dirs>   (required) — sources referenced by docs.config.ts
#   /docs/public/          (optional) — favicon / logos / per-project svgs
#
# Content is split out of the app bundle (cantip >=0.5.0), so after the initial
# build a content refresh only needs `cantip generate` (no rebuild) — send SIGHUP
# to this process to regenerate. Branding/theme changes (anything bundled into
# site.ts at build time) still require a full restart.
set -eu

APP=/app
DOCS=${DOCS_DIR:-/docs}

log() { printf '▶ %s\n' "$1" >&2; }

if [ ! -f "$DOCS/docs.config.ts" ]; then
	echo "✖ No docs.config.ts found in $DOCS." >&2
	echo "  Mount your docs at $DOCS, e.g.:" >&2
	echo "    docker run -p 3000:3000 -v \$(pwd)/my-docs:/docs cantip-host" >&2
	exit 1
fi

# ── Link the client's docs into the app (replacing the scaffolded seed) ──────
# Symlink (not copy) so the app reads the live volume; content can be large.
cd "$APP"

rm -f "$APP/docs.config.ts"
ln -s "$DOCS/docs.config.ts" "$APP/docs.config.ts"
log "linked docs.config.ts from volume"

# Drop the seed content dir the scaffold shipped (template/docs) so it can't leak
# into the client's site; the volume provides the real sources.
rm -rf "$APP/docs"

# Link every top-level content dir / file the volume provides (except public/,
# handled below). Config `source:` paths resolve against the app root, so a config
# pointing at ./projects/foo needs /docs/projects present.
for entry in "$DOCS"/*; do
	name=$(basename "$entry")
	case "$name" in
		docs.config.ts|public|node_modules|build|app) continue ;;
	esac
	rm -rf "$APP/$name"
	ln -s "$entry" "$APP/$name"
	log "linked $name from volume"
done

# Merge client public/ assets over the scaffolded seed public/ (favicon, logos).
if [ -d "$DOCS/public" ]; then
	cp -a "$DOCS/public/." "$APP/public/" 2>/dev/null || true
	log "merged public/ assets from volume"
fi

# ── Generate + build ────────────────────────────────────────────────────────
# One explicit, forced generate up front (robust regardless of volume file
# mtimes). The build's two passes (client + SSR) then see up-to-date output and
# skip regeneration via the plugin's freshness guard — so content is generated
# exactly once per boot, not three times.
log "generating content from docs.config.ts…"
npx cantip generate

log "building the Remix app (per-client branding/theme is bundled here)…"
npm run build

# ── Serve, with SIGHUP = regenerate content (no rebuild) ────────────────────
log "starting server on ${HOST:-0.0.0.0}:${PORT:-3000}"
npm run start &
SERVER_PID=$!

# SIGHUP: regenerate content.json from the (possibly updated) volume, then bounce
# the server process so it re-reads content.json on next request — no rebuild.
refresh() {
	log "SIGHUP — regenerating content (no rebuild)…"
	npx cantip generate || log "regenerate failed; keeping current content"
	kill "$SERVER_PID" 2>/dev/null || true
	wait "$SERVER_PID" 2>/dev/null || true
	npm run start &
	SERVER_PID=$!
	log "content refreshed; server restarted (app NOT rebuilt)"
}
trap refresh HUP

# Forward termination for a clean shutdown.
trap 'kill "$SERVER_PID" 2>/dev/null || true; exit 0' INT TERM

wait "$SERVER_PID"
