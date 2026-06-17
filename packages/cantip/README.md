# cantip

A **Remix documentation engine** you drop into your own Remix app as a Vite
plugin. Ingest Obsidian vaults or plain markdown and get a fast SSR docs site —
persistent sidebar, tabs, full-text search, dark/light theme, canvas rendering,
wikilinks — driven by a single `docs.config.ts`.

Unlike a black-box generator, **you own the Remix app.** cantip is a plugin plus
exported routes/components, so you can edit the layout, add your own routes, and
integrate the docs into a larger site.

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

`create-cantip` scaffolds a real Remix app: a `vite.config.ts`, an `app/` you own
(root layout + route stubs), `docs.config.ts`, and a `docs/` folder. Edit any of
it.

## Add to an existing Remix app

cantip is a Vite plugin. Add it before the Remix plugin:

```ts
// vite.config.ts
import { vitePlugin as remix } from '@remix-run/dev'
import tailwindcss from '@tailwindcss/vite'
import { cantip } from 'cantip/vite'

export default defineConfig({
  plugins: [cantip(), tailwindcss(), remix()],
})
```

Then wire the docs routes by re-exporting them from your `app/`:

```ts
// app/root.tsx        — the docs layout (replace or wrap with your own)
export { loader } from 'cantip/root.server'
export { default, links } from 'cantip/root'

// app/routes/$.tsx    — the catch-all doc page
export { loader } from 'cantip/routes/doc.server'
export { default, meta } from 'cantip/routes/doc'

// app/routes/_index.tsx — the home page
export { default, meta } from 'cantip/routes/home'
```

The `cantip()` plugin runs the content pipeline (markdown → HTML) before each
build and on changes in dev — no separate generate step.

> **Peer dependencies:** cantip expects `react`, `react-dom`, `@remix-run/node`,
> and `@remix-run/react` from your app, so there's a single shared copy (no
> duplicate-React bugs).

### Optional features

To keep installs lean, two heavyweight features are **optional peer
dependencies** — install them only if you use them (`npm create cantip` includes
`pagefind` by default, so scaffolded projects have search out of the box):

| Feature | Install | Why it's optional |
| --- | --- | --- |
| **Full-text search** | `npm install pagefind` | Native search-index binary. Without it, the build skips the search index (with a warning) and the search box has no results. |
| **Mermaid diagrams** | `npm install rehype-mermaid` | Renders ` ```mermaid ` blocks to SVG via Playwright/Chromium (~300 MB). Without it, a doc containing a diagram fails the build with a message telling you to install it. |

## Configure

Everything lives in `docs.config.ts` (typed via `cantip/config`):

```ts
import { defineConfig } from 'cantip/config'

export default defineConfig({
  site: { title: 'My Docs', lang: 'en', defaultTheme: 'dark' },
  // Loose markdown in ./docs, served at the root:
  general: { enabled: true, source: './docs' },
  // …or named projects, each a folder / submodule / any path:
  // projects: [{ id: 'guide', name: 'Guide', source: './content/guide' }],
  // theme: { colors: { dark: { '--brand': 'oklch(0.7 0.2 250)' } } },
})
```

- **Content sources** — submodule, loose folder, any path, or a `general` bucket
  served at the root with no project concept.
- **Branding** — title, description, logos, favicon, language, default theme.
- **Theme** — `theme.colors` OKLCH tokens, no CSS edits.

## Order the sidebar

By default a folder's children sort alphabetically. Drop a `_meta.yaml` (or
`_meta.yml` / `_meta.json`) into any source folder to set an explicit order and
rename subfolders:

```yaml
# docs/guide/_meta.yaml
order:                 # children — pages AND subfolders — in this order
  - getting-started
  - installation
  - advanced
label:                 # rename subfolders (pages take their title from frontmatter)
  advanced: Advanced Topics
```

- **Files and folders share one namespace** — list a child by its name (a page
  `installation.md` is `installation`; a subfolder `advanced/` is `advanced`).
  Names are matched after slugifying, so `Getting Started` and `getting-started`
  both work.
- **Order only what you care about** — listed children come first in the given
  order; anything unlisted appends after, alphabetically. A folder with no
  `_meta` stays fully alphabetical, exactly as before.
- `_meta` files are read from your source vault and never rendered as pages.

## Extend it

It's your Remix app — go as deep as you like:

- **Swap a component (runtime)** — wrap the layout in your `app/root.tsx`; no
  config, no regenerate:
  ```tsx
  import { Layout, CantipProvider } from 'cantip/root'
  export default () => <CantipProvider components={{ TopBar: MyTopBar }}><Layout/></CantipProvider>
  ```
- **Add routes** — drop `app/routes/about.tsx` alongside the docs.
- **Compose components** — `import { Sidebar, Search, Toc } from 'cantip/components'`.
- **Custom content backend** — `loader()` works over any `{ files: VirtualFile[] }`
  source (Obsidian today; a CMS, DB, or generated API docs just emit the same
  shape):
  ```ts
  import { loader } from 'cantip/source'
  const docs = loader({ source: { files: [/* your pages */] } })
  ```
- **Customize the markdown pipeline** — `markdown.pipeline` in `docs.config.ts`
  hands you the engine's default remark/rehype steps; return the chain you want
  (full control — reorder, drop, replace, or insert). Steps are
  `{ name, plugin, options? }`; cantip's own steps carry a `cantip:` name prefix.
  Runs at build time, in the content generator (not the browser):
  ```ts
  import rehypeExternalLinks from 'rehype-external-links'
  export default defineConfig({
    markdown: {
      pipeline: (steps) => [
        ...steps,
        { name: 'rehype-external-links', plugin: rehypeExternalLinks, options: { target: '_blank' } },
      ],
    },
  })
  ```
  Omit `pipeline` and the default pipeline is unchanged. Ordering rules still
  apply (remark steps before `remark-rehype`, rehype steps after); cantip trusts
  your hook to keep it valid.

## Publish to Jira

An optional, env-gated feature: a **Publish to Jira** action on every doc page
that creates a Jira issue from the page (title → summary, content → description,
converted to rich ADF) or updates a linked ticket. Selecting text in the body
pops a floating action to publish just that selection. When unconfigured, none
of it renders.

**Mount the routes** by re-exporting them from your `app/`:

```ts
// app/routes/api.jira.ts        — publish endpoint (status + create/update)
export { loader, action } from 'cantip/routes/api.jira'

// app/routes/jira.connect.ts    — start OAuth      (only used in per-user mode)
export { loader } from 'cantip/routes/jira.connect'
// app/routes/jira.callback.ts   — OAuth callback
export { loader } from 'cantip/routes/jira.callback'
// app/routes/jira.disconnect.ts — clear the session
export { action } from 'cantip/routes/jira.disconnect'
```

**Two auth modes** (you can run either or both — per-user wins when a browser is
connected, the shared account is the fallback):

| Mode | When to use | Env |
| --- | --- | --- |
| **Per-user OAuth (3LO)** | Several people publish, each as themselves; Jira enforces their own permissions. | `JIRA_OAUTH_CLIENT_ID`, `JIRA_OAUTH_CLIENT_SECRET`, `SESSION_SECRET` |
| **Shared service account** | One identity for everyone (or cron/automation). | `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` |

Optional for both: `JIRA_DEFAULT_PROJECT`, `JIRA_DEFAULT_ISSUE_TYPE` (default
`Task`) seed the dialog's pickers.

**Per-user OAuth setup** — register an [OAuth 2.0 (3LO) app](https://developer.atlassian.com/console/myapps/):

1. Add the **Jira** permission with scopes `read:jira-work`, `write:jira-work`,
   `read:jira-user`, `offline_access`.
2. Set the **callback URL** to your origin + `/jira/callback` (e.g.
   `http://localhost:5173/jira/callback` in dev — add your prod URL too; it must
   match exactly).
3. Copy the **Client ID** + **Secret** into the env vars above. `SESSION_SECRET`
   is any random string (e.g. `openssl rand -hex 32`); it encrypts the session
   cookie that holds each user's tokens — no database, and it works across
   replicas. Tokens refresh automatically.

> Env vars are read by the **server** at runtime, so set them where the server
> runs. `remix vite:dev` does **not** load `.env` into `process.env` — export
> them in that shell.

**Linked tickets** for the *update* flow are detected two ways: a `jira:`
frontmatter field (a key or URL, or a list), **and** any in-body markdown link to
a `…/browse/KEY` URL. The dialog lists them with their live status (and marks
completed ones).

## Exports

| Import | What |
| --- | --- |
| `cantip/vite` | The Vite plugin. |
| `cantip/config` | `defineConfig` + the config schema. |
| `cantip/source` | `loader()` + the `Source`/`VirtualFile` content contract (framework-agnostic). |
| `cantip/root`, `cantip/root.server` | Root layout + `CantipProvider` + the loader. |
| `cantip/routes/doc`, `cantip/routes/doc.server` | Doc page + loader. |
| `cantip/routes/home` | Home page. |
| `cantip/routes/api.jira` | Publish-to-Jira endpoint (status + create/update). |
| `cantip/routes/jira.connect`, `jira.callback`, `jira.disconnect` | Per-user OAuth flow. |
| `cantip/components` | The React components (Sidebar, TopBar, Toc, Search, …). |
| `cantip/core` | Higher-level data helpers (getDoc, buildSidebar, projects). |
| `cantip/styles.css` | The Tailwind stylesheet entry. |
| `cantip/entry.server`, `cantip/entry.client` | Remix SSR/hydration entries. |

## Built with AI

This project was built with the help of an AI coding assistant, with human
direction and review.

## License

MIT
