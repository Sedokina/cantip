# cantip docs-host image

A **generic, content-agnostic** container that serves any cantip docs project.
Build the image once; point it at a client's docs via a mounted volume — no need
to scaffold a Remix app per client.

## How it works

The app shell baked into the image is scaffolded by **`create-cantip`** itself, so
it is exactly a fresh `npm create cantip` project (single source of truth — the
image tracks the scaffolder automatically). The Remix app is **built once at
image-build time**; because cantip ≥0.6.0 reads ALL per-client data
(`content.json` + `site.json`: content, branding, projects, theme) from disk at
runtime, that build is **client-agnostic** — it bakes in nothing client-specific.

The client's docs arrive at runtime on a volume mounted at `/docs`. On boot the
entrypoint:

1. links `/docs/docs.config.ts` + the content dirs it references into the app,
2. merges `/docs/public/` branding assets,
3. runs `cantip generate` (markdown → HTML, search index, mermaid, canvas, plus
   `site.json` for branding/projects/theme),
4. serves with `remix-serve` on port 3000.

There is **no `remix vite:build` at boot** — it already ran in the image. Boot is
just generate + serve, and any change (content OR branding/theme) is applied by a
regenerate, **without a rebuild** — see [Live refresh](#live-content-refresh).

## Build

```sh
# from the cantip repo root
docker build -f docker/Dockerfile -t cantip-host:latest .

# pin the cantip line for a repeatable image:
docker build -f docker/Dockerfile --build-arg CANTIP_VERSION=0.6.0 -t cantip-host:0.6.0 .

# no mermaid in your docs? skip Chromium for a ~1.5GB-smaller image:
docker build -f docker/Dockerfile --build-arg WITH_MERMAID=false -t cantip-host:slim .
```

| Build arg | Default | Meaning |
|-----------|---------|---------|
| `CANTIP_VERSION` | `latest` | cantip line to scaffold; pin (e.g. `0.6.0`) for reproducibility |
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

## Live refresh

Update anything on the volume — content, branding, theme, the project list — then
signal the running container to regenerate. **No image rebuild, no app rebuild**,
just `cantip generate` + a fast process bounce (the new data is read from
`content.json` / `site.json` on the next request):

```sh
docker kill -s HUP <container>
```

As of cantip ≥0.6.0 this covers branding/theme/projects too — they're runtime data
now, not bundled — so nothing needs a full rebuild or image rebuild.

## Notes / tunables

- **Cold start** runs one `cantip generate` + `remix-serve` (≈17 s for ~640 pages;
  the generate dominates) — **no `remix vite:build`**, which already ran at
  image-build time. The bundle is client-agnostic, so the same image serves any
  client.
- **Image size** is dominated by Chromium — use `WITH_MERMAID=false` to shrink it.
- **Multiple projects** in one `docs.config.ts` are served by a single container.
- The image installs the optional peers `pagefind` (search) + `rehype-mermaid`
  (diagrams) on top of the scaffold, since a generic host should support both.
- **Mermaid + Chromium in containers.** Diagrams render via headless Chromium at
  generate time. cantip launches it with `--no-sandbox --disable-dev-shm-usage`
  (the latter avoids Docker's tiny 64MB `/dev/shm`, which can otherwise make a
  multi-diagram generate hang non-deterministically). If it still stalls on a
  diagram-heavy vault, the cause is usually memory — give the container more RAM /
  swap, or run a `WITH_MERMAID=false` image. Override the flags via
  `CANTIP_CHROMIUM_ARGS` (space-separated) if you need different ones.

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

**The build runs at image-build, not at boot.** Because cantip ≥0.6.0 reads all
per-client data at runtime (`content.json` + `site.json`), the server bundle is
client-agnostic, so `npm run build` runs once in the Dockerfile. Boot is just
`cantip generate` (one pass) + `remix-serve`. If you ever reintroduce a build at
boot, note that `remix vite:build` triggers the generate-on-`buildStart` hook once
per pass (client + SSR + internal) — guard it with `CANTIP_SKIP_GENERATE=1` after
an explicit generate, or it regenerates several times.
