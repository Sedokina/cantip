# kantip

A config-driven **Remix SSR documentation engine**. Ingest Obsidian vaults or
plain markdown folders and get a fast docs site with a persistent sidebar, tabs,
full-text search, dark/light theme, canvas rendering, and wikilinks — all driven
by a single `docs.config.ts`. ("Kantip" — кантип — is Kyrgyz for "how (to)".)

## Quick start

```sh
npm create kantip my-docs
cd my-docs
npm install
npm run dev
```

Then edit `docs.config.ts` and drop markdown into `docs/`.

## Repository layout

| Path | What |
| --- | --- |
| `packages/kantip` | The engine — Remix app + build pipeline + `kantip` CLI. Published to npm as `kantip`. |
| `packages/create-kantip` | The scaffolder behind `npm create kantip`. Published as `create-kantip`. |
| `examples/starter` | A scaffold-generated site used to dogfood the engine locally. |

### Develop

```sh
npm install            # link the workspace, build the engine (dist/)
npm run build:starter  # build examples/starter with the local engine
npm run dev:starter    # dev server
npm run typecheck      # type-check the engine
```

## What's configurable

Everything lives in `docs.config.ts` (typed via `kantip/config`):

- **Content sources** — `projects[].source` points at a git submodule, a loose
  folder, or any path; or use the `general` bucket to serve loose markdown at the
  root with no project concept.
- **Branding** — title, description, logos, favicon, language, default theme.
- **Theme** — `theme.colors` OKLCH tokens, overriding defaults with no CSS edits.
- **Components** — `components` swaps `Home` / `DocPage` / `TopBar` / `Toc` for
  your own `.tsx`. Anything deeper: eject (copy the engine `app/`).

## How it runs from `node_modules`

The engine ships the Remix `app/` + build `scripts/`. The `kantip` CLI runs them
from the user's project: content, `app/generated/` manifest, `public/`, and
`build/` resolve from the user's cwd, while Vite's `appDirectory` + `REMIX_ROOT`
point Remix at the engine. The generator is precompiled to `dist/*.mjs` (Node
won't strip TS types under `node_modules`). The Vite `~/generated/*` alias
redirects to the user's cwd so generated `site.ts` / `slots.ts` / `theme.generated.css`
resolve there.

## Publishing

Both packages build on `prepare` / `prepublishOnly`:

```sh
npm publish -w kantip
npm publish -w create-kantip
```

## License

MIT
