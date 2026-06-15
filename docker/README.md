# cantip docs-host image

A **generic, content-agnostic** container that serves any cantip docs project.
Build the image once; point it at a client's docs via a mounted volume — no need
to scaffold a Remix app per client.

## How it works

The app shell baked into the image is scaffolded by **`create-cantip`** itself, so
it is exactly a fresh `npm create cantip` project (single source of truth — the
image tracks the scaffolder automatically). The client's docs arrive at runtime on
a volume mounted at `/docs`. On boot the entrypoint:

1. links `/docs/docs.config.ts` + the content dirs it references into the app,
2. merges `/docs/public/` branding assets,
3. runs `cantip generate` (markdown → HTML, search index, mermaid, canvas),
4. runs `remix vite:build` (per-client branding + theme are bundled here),
5. serves with `remix-serve` on port 3000.

Because cantip ≥0.5.0 reads compiled content from `app/generated/content.json` via
`fs` at runtime (it is **not** bundled into the server), content can be refreshed
**without a rebuild** — see [Live content refresh](#live-content-refresh).

## Build

```sh
# from the cantip repo root
docker build -f docker/Dockerfile -t cantip-host:latest .

# pin the cantip line for a repeatable image:
docker build -f docker/Dockerfile --build-arg CANTIP_VERSION=0.5.0 -t cantip-host:0.5.0 .

# no mermaid in your docs? skip Chromium for a ~1.5GB-smaller image:
docker build -f docker/Dockerfile --build-arg WITH_MERMAID=false -t cantip-host:slim .
```

| Build arg | Default | Meaning |
|-----------|---------|---------|
| `CANTIP_VERSION` | `latest` | cantip line to scaffold; pin (e.g. `0.5.0`) for reproducibility |
| `WITH_MERMAID` | `true` | install Playwright Chromium so ```mermaid diagrams render |

## Run

The `/docs` volume must contain:

| Path | Required | What |
|------|----------|------|
| `docs.config.ts` | yes | the cantip config (projects, branding, theme) |
| content dirs | yes | whatever `source:` paths the config references (e.g. `projects/foo`) |
| `public/` | no | favicon, logos, per-project svgs |

```sh
docker run --rm -p 3000:3000 -v "$(pwd):/docs:ro" cantip-host:latest
```

Open http://localhost:3000. A read-only (`:ro`) mount is fine — the build writes
only inside the container. See `docker-compose.yml` for a compose example.

## Live content refresh

Update the docs on the volume, then signal the running container to regenerate —
**no image rebuild, no full app rebuild**, just `cantip generate` + a fast process
bounce (new content is read from `content.json` on the next request):

```sh
docker kill -s HUP <container>
```

Branding / theme / project-list changes (anything in `docs.config.ts` that ends up
in `site.ts`) ARE bundled at build time, so those need a full container restart.

## Notes / tunables

- **Cold start** runs one `cantip generate` + `remix vite:build` (≈25 s for ~640
  pages; the generate dominates). Inherent: per-client branding is compiled into
  the bundle, so a build is required; only *content* is decoupled from it. See
  "Architecture & gotchas" for why it's one generate and not several.
- **Image size** is dominated by Chromium — use `WITH_MERMAID=false` to shrink it.
- **Multiple projects** in one `docs.config.ts` are served by a single container.
- The image installs the optional peers `pagefind` (search) + `rehype-mermaid`
  (diagrams) on top of the scaffold, since a generic host should support both.

## Architecture & gotchas (for maintainers)

Editing `entrypoint.sh`? Read this first — it encodes two non-obvious invariants
that, when broken, fail in confusing ways.

**The image owns the app shell; the volume provides ONLY content.** The baked app
(`vite.config.ts`, `package.json`, `tsconfig.json`, `node_modules`, the `app/`
route stubs) belongs to the image. A client volume must supply *only*
`docs.config.ts`, the content dirs its `source:` paths reference, and optional
`public/` assets. The entrypoint therefore links volume entries through a
**denylist** of app-shell names — never an allowlist of "everything but a few".

> Why it matters: if the volume's own `vite.config.ts` / `package.json` get linked
> over the image's, module resolution breaks. `docs.config.ts` does `import
> 'cantip/config'`, and the generator then resolves `cantip` against the *volume*
> (which a content-only client doesn't have) instead of the image. The generate
> writes `content.json` to the wrong directory, the build's `buildStart` sees
> `contentExists=false`, `CANTIP_SKIP_GENERATE` never fires, and every build pass
> regenerates (~5×, ~2-min boots). It can appear to "work" if the mounted volume
> happens to be a full cantip project with its own `node_modules` — that masks the
> bug until a content-only client (or a `:ro` mount) hits it.

**`docs.config.ts` is COPIED, not symlinked.** Node resolves a module's imports by
the file's **real** path, so a symlinked config resolves `import 'cantip'` from the
volume, not the image. Copying it into `/app` makes its imports resolve from the
image's `node_modules`. (Content dirs are still symlinked — they can be large and
are only read, never imported.)

**Boot does one `cantip generate`, not several.** A `remix vite:build` runs the
generate-on-`buildStart` hook once per pass (client + SSR + internal). The
entrypoint generates once explicitly, then builds with `CANTIP_SKIP_GENERATE=1`
so the passes skip regeneration (the plugin still guards on `content.json`
existing, so a misconfigured flag regenerates rather than shipping an empty site).
This is why boot is ~24 s, not ~2 min.
