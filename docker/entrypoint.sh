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
# ALL per-client data — content AND branding/projects/theme — is read from disk at
# runtime (cantip >=0.6.0), so the app is built once at image-build time and boot
# is just `cantip generate` + serve. Any change (content or branding/theme) needs
# only a regenerate, no rebuild — send SIGHUP to this process to apply it.
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

# ── Bring the client's docs into the app (replacing the scaffolded seed) ─────
# Content dirs are symlinked (they can be large; we don't want to copy). But
# docs.config.ts is COPIED, not symlinked: it does `import 'cantip/config'`, and
# Node resolves a module's imports relative to the file's REAL path — a symlink
# would resolve `cantip` from the volume (/docs/node_modules), which a client
# volume won't have. Copying into /app makes it resolve from the image's
# node_modules. Find the config under whatever extension the client used.
cd "$APP"

rm -f "$APP"/docs.config.ts "$APP"/docs.config.js "$APP"/docs.config.mjs
for ext in ts js mjs; do
	if [ -f "$DOCS/docs.config.$ext" ]; then
		cp "$DOCS/docs.config.$ext" "$APP/docs.config.$ext"
		log "copied docs.config.$ext from volume"
		break
	fi
done

# Drop the seed content dir the scaffold shipped (template/docs) so it can't leak
# into the client's site; the volume provides the real sources.
rm -rf "$APP/docs"

# Link the volume's CONTENT into the app — and ONLY content. The image owns the
# Remix app shell (vite.config.ts, package.json, tsconfig.json, node_modules, the
# app/ stubs); a client volume must never override those, or module resolution +
# the build break (e.g. `import 'cantip'` in docs.config.ts resolving against the
# volume instead of the image). So we DENY app-shell names and link the rest —
# the content source dirs the config's `source:` paths reference (resolved against
# the app root, so a config pointing at ./projects/foo needs /docs/projects).
for entry in "$DOCS"/*; do
	name=$(basename "$entry")
	case "$name" in
		# already linked / handled, or app-shell files the image owns:
		docs.config.ts|docs.config.js|docs.config.mjs|public) continue ;;
		node_modules|build|app|vite.config.ts|vite.config.js|tsconfig.json) continue ;;
		package.json|package-lock.json|npm-shrinkwrap.json|yarn.lock|pnpm-lock.yaml) continue ;;
		.git|.gitignore|.dockerignore|README.md|Dockerfile|docker) continue ;;
	esac
	rm -rf "$APP/$name"
	ln -s "$entry" "$APP/$name"
	log "linked content '$name' from volume"
done

# Merge client public/ assets over the scaffolded seed public/ (favicon, logos).
if [ -d "$DOCS/public" ]; then
	cp -a "$DOCS/public/." "$APP/public/" 2>/dev/null || true
	log "merged public/ assets from volume"
fi

# ── Generate + serve (NO build) ─────────────────────────────────────────────
# The Remix app was already built at image-build time, and cantip >=0.6.0 reads
# ALL per-client data (content + branding/projects/theme) from disk at runtime —
# so the baked bundle is client-agnostic and we only need to regenerate the data
# for THIS client, then serve. No `remix vite:build` at boot.
log "generating content + site data from docs.config.ts…"
npx cantip generate

# ── Serve, with SIGHUP = regenerate (no rebuild) ────────────────────────────
log "starting server on ${HOST:-0.0.0.0}:${PORT:-3000}"
npm run start &
SERVER_PID=$!

# SIGHUP: regenerate from the (possibly updated) volume, then bounce the server so
# it re-reads the data on next request — no rebuild. As of cantip >=0.6.0 this
# refreshes BRANDING + THEME + PROJECTS too (all runtime data), not just content.
refresh() {
	log "SIGHUP — regenerating content + site data (no rebuild)…"
	npx cantip generate || log "regenerate failed; keeping current data"
	kill "$SERVER_PID" 2>/dev/null || true
	wait "$SERVER_PID" 2>/dev/null || true
	npm run start &
	SERVER_PID=$!
	log "data refreshed; server restarted (app NOT rebuilt)"
}
trap refresh HUP

# Forward termination for a clean shutdown.
trap 'kill "$SERVER_PID" 2>/dev/null || true; exit 0' INT TERM

wait "$SERVER_PID"
