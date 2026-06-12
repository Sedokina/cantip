# cantip

A **Remix documentation engine** you drop into your own Remix app as a Vite
plugin. Ingest Obsidian vaults or plain markdown and get a fast SSR docs site —
persistent sidebar, tabs, full-text search, dark/light theme, canvas rendering,
wikilinks — driven by a single `docs.config.ts`. **You own the Remix app**, so
the docs are fully editable and extensible.

### The name

**cantip** reads two ways, both fitting for a docs tool:

- **"can tip"** — as in "can you give me a tip?" Docs are how you get the tip.
- **кантип** — Kyrgyz for **"how (to)"**, which is what documentation answers.

## Quick start

```sh
npm create cantip my-docs
cd my-docs
npm install
npm run dev
```

Then edit `docs.config.ts` and drop markdown into `docs/`.

## Repository layout

| Path | What |
| --- | --- |
| `packages/cantip` | The engine — Vite plugin + exported routes/components + build pipeline. Published to npm as `cantip`. |
| `packages/create-cantip` | The scaffolder behind `npm create cantip`. Published as `create-cantip`. |
| `examples/starter` | A scaffold-generated Remix app used to dogfood the engine locally. |

### Develop

```sh
npm install            # link the workspace, build the engine (dist/)
npm run build:starter  # build examples/starter with the local engine
npm run dev:starter    # dev server
npm run typecheck      # type-check the engine
```

## What's configurable

Everything lives in `docs.config.ts` (typed via `cantip/config`):

- **Content sources** — `projects[].source` points at a git submodule, a loose
  folder, or any path; or use the `general` bucket to serve loose markdown at the
  root with no project concept.
- **Branding** — title, description, logos, favicon, language, default theme.
- **Theme** — `theme.colors` OKLCH tokens, overriding defaults with no CSS edits.
- **Sidebar order** — drop a `_meta.yaml` into any source folder to order its
  children (pages and subfolders) and rename subfolders; unlisted items append
  alphabetically. No `_meta` = alphabetical, as before.
- **Markdown pipeline** — `markdown.pipeline` hands you the default remark/rehype
  steps to reorder/drop/replace/extend (full control, build-time).
- **Components** — `components` swaps `Home` / `DocPage` / `TopBar` / `Toc` for
  your own `.tsx`.

For deeper changes you don't need to eject — **it's your Remix app.** Add routes,
edit `app/root.tsx`, compose `cantip/components`, or build custom pages with the
`cantip/core` data functions. See the [package README](./packages/cantip/README.md)
for the full export list.

## How it works

cantip is a **Vite plugin** (`cantip/vite`) plus exported routes/components. Your
project is a normal Remix app; the plugin runs the content pipeline (markdown →
HTML) before each build and on dev changes, emitting a single importable
`app/generated/content.ts` module under your cwd, and registers the aliases the
exported routes/components use. The generator is precompiled to `dist/*.mjs` (Node
won't strip TS types under `node_modules`), and cantip ships `.d.ts` so your `tsc`
stays clean.

**Content flows through a `Source` → `loader()` contract** (`cantip/source`). A
Source is just `{ files: VirtualFile[] }` — the built-in Obsidian backend emits
one, but any backend (CMS, DB, generated API docs) can produce the same shape, and
`loader()` builds the page tree + lookups over it with no filesystem or markdown
processor. The markdown pipeline (remark/rehype/…) is **bundled into the prebuilt
generator**, so consumers never install it; `pagefind` (search) and
`rehype-mermaid` (diagrams) are **optional peers** loaded only when used.

Component overrides are **runtime** — wrap the layout in `<CantipProvider
components={…}>` in your `app/root.tsx`; no codegen, no regenerate.

Because cantip declares `react` / `react-dom` / `@remix-run/*` as
**peerDependencies**, your app and cantip share one copy — no duplicate-framework
bugs.

## Publishing

Releases go out via GitHub Actions on a `v*` tag (OIDC trusted publishing). See
[PUBLISHING.md](./PUBLISHING.md).

## Built with AI

This project — the engine, the plugin re-architecture, the scaffolder, the
release pipeline, and these docs — was built with the help of an AI coding
assistant, with human direction and review.

## License

MIT
