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

- **Cold start** runs `cantip generate` + `remix vite:build` (≈30–60 s for ~640
  pages). Inherent: per-client branding is compiled into the bundle; only
  *content* is decoupled.
- **Image size** is dominated by Chromium — use `WITH_MERMAID=false` to shrink it.
- **Multiple projects** in one `docs.config.ts` are served by a single container.
- The image installs the optional peers `pagefind` (search) + `rehype-mermaid`
  (diagrams) on top of the scaffold, since a generic host should support both.
