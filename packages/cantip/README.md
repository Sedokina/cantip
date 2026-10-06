# cantip

A **Remix documentation engine** you drop into your own Remix app as a Vite
plugin. Ingest Obsidian vaults or plain markdown and get a fast SSR docs site —
persistent sidebar, tabs, full-text search, dark/light theme, canvas rendering,
wikilinks, printing to PDF — driven by a single `docs.config.ts`.

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

cantip is a Vite plugin. Add it before the Remix plugin, and pass
`cantipRoutes()` to the Remix plugin's `routes` option:

```ts
// vite.config.ts
import { vitePlugin as remix } from '@remix-run/dev'
import tailwindcss from '@tailwindcss/vite'
import { cantip, cantipRoutes } from 'cantip/vite'

export default defineConfig({
  plugins: [cantip(), tailwindcss(), remix({ routes: cantipRoutes() })],
})
```

`cantipRoutes()` adds the routes cantip owns: the print view (`/_print`) and the
Jira endpoints (`/api/jira`, `/jira/connect`, `/jira/callback`,
`/jira/disconnect`). Routes added in later cantip versions arrive the same way,
so an upgrade needs no new files in `app/`.

- **Replace a route:** add your own file for its path, e.g.
  `app/routes/[_print].tsx` or `app/routes/api.jira.ts`. cantip then skips that
  route, so the file you wrote is the one that serves it.
- **Leave routes out:** `cantipRoutes({ exclude: ['/api/jira'] })`.
- **App folder other than `app/`:** `cantipRoutes({ appDirectory: 'src' })`.

Then wire the docs pages by re-exporting them from your `app/`:

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

These stay files in your `app/` because sites usually edit them.

The `cantip()` plugin runs the content pipeline (markdown → HTML) before each
build and on changes in dev — no separate generate step. In dev it watches
`docs.config.ts` and every source folder the config names, including folders
outside the project, and reloads the browser once the new content is ready. To
regenerate on changes to other files the generator reads, list them in the
plugin: `cantip({ watch: ['snippets'] })`.

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

## Edit this page

Add an **"Edit this page"** button (in the doc's title row) that opens the source
file in your repo's web editor. Set an `editUrl` template; `{path}` is replaced
with the file's path relative to its source dir, including the extension:

```ts
export default defineConfig({
  // Site-wide default (handy for a single repo):
  site: { editUrl: 'https://bitbucket.org/WORKSPACE/REPO/src/main/{path}?mode=edit' },
  // Per-project override (each project = one repo):
  projects: [
    { id: 'guide', name: 'Guide', source: './content/guide',
      editUrl: 'https://github.com/ORG/REPO/edit/main/docs/{path}' },
  ],
  // general: { enabled: true, source: './docs', editUrl: '…/{path}…' },
})
```

- **Provider-agnostic** — it's just a URL template, so it works with any host:
  - Bitbucket Cloud: `https://bitbucket.org/WS/REPO/src/main/{path}?mode=edit` (`?mode=edit` opens straight in edit mode)
  - GitHub: `https://github.com/ORG/REPO/edit/main/{path}`
  - GitLab / Bitbucket Server: build the same `{path}` link your host uses.
- **Repo subdirectory** — if `source` points at a subfolder of the repo (e.g.
  the repo's `docs/`), bake that prefix into the template before `{path}`.
- A project (or the `general` bucket) with no `editUrl` and no `site.editUrl`
  shows no button. Path segments are URL-encoded, so spaces/non-ASCII names work.

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

## Images, files and draw.io diagrams

Every image in a source folder (`.avif .bmp .gif .jpeg .jpg .png .svg .webp`)
appears in the sidebar under its file name. Opening it, or following a wikilink
like `[[Login Screen.png]]`, shows the image on its own page, e.g.
`/screenshots/login-screen-png/`. `![[Login Screen.png]]` still embeds it inline.
The file itself is served under its original name, e.g.
`/screenshots/Login%20Screen.png`.

Every other file in a source folder (spreadsheets, documents, PDFs, archives,
...) also appears in the sidebar under its file name, with an icon for its type.
Clicking it, or a wikilink like `[[Budget 2026.xlsx]]`, opens the file itself in
a new tab: the browser shows what it can (PDF, text, audio, video) and downloads
the rest. `![[Budget 2026.xlsx]]` embeds a link card; PDFs, audio and video
embed with the browser's player. Hidden files, `.canvas` files, `_meta` files and
files without an extension are skipped; hide others with `.cantipignore` (see
below).

A draw.io diagram saved as `.drawio.svg` or `.drawio.png` opens in the
interactive [draw.io viewer](https://www.drawio.com/) on its own page. The
diagram opens at its natural size, centred; drag to pan, Ctrl+wheel to zoom. The
controls in the top-right corner switch pages, zoom, fit to the area, centre,
show or hide layers, and open a fullscreen view. The viewer follows the site's dark/light theme.
Embeds stay static images.

The viewer is served from your own site, not from diagrams.net. The first
`cantip generate` that finds a diagram downloads the pinned draw.io release
(`draw.war`, 54 MB) from GitHub and unpacks the viewer into `public/_drawio/`
(about 75 MB on disk); later runs reuse it. Add `public/_drawio/` to
`.gitignore`. If the download fails, diagrams fall back to static images.

Sites that don't use draw.io, or can't download at build time, turn it off:

```ts
export default defineConfig({
  drawio: { viewer: false },
})
```

## Print and save as PDF

Readers can print one page, or several pages from anywhere in the site as one
document, and save it as a PDF from the browser's print dialog. Notes and images
can be printed. Canvas pages and other files cannot.

**Print one page.** The printer button in a note's title row opens the print
dialog. In the sidebar, the ⋮ menu of a note or an image has **Print…**, which
opens the same dialog for that page.

**Print several pages.** Collect them in the print list, then print the list:

- In the sidebar ⋮ menu, **Add to print list** adds a note or an image, and
  **Add folder to print list** adds every note and image in a folder and its
  subfolders, in sidebar order.
- **Add this page** in the print dialog adds the page the dialog is for.
- While the list has pages, a printer button with the page count appears in the
  sidebar header and opens the list. A short message confirms every add and
  remove.

In the dialog the list can be reordered and cleared. The list is stored in the
reader's browser (`localStorage`), so it lasts across pages and reloads but is
not shared between browsers or devices.

After the browser's print dialog closes, the print tab offers **Clear the print
list**. Browsers do not tell the page whether the reader printed or cancelled,
so the list is never cleared without that click.

**Options** in the dialog, remembered per browser:

- **Contents.** One page gets a table of contents under its title. Several pages
  get one table of contents at the start of the document, with each page title
  and its headings.
- **Properties.** Prints the frontmatter table of each page.
- **File extensions.** Off by default: printed files such as images are titled
  without their extension, `Login Screen` instead of `Login Screen.png`, and
  `architecture` instead of `architecture.drawio.svg`. On keeps the full file
  name.
- **Start each page on a new sheet.** Off by default: pages follow each other,
  separated by a line. Each page in the list has its own new-sheet button, so
  some pages can start a new sheet and others follow the page before them. The
  same button in the list header turns every page on or off. It has a
  background when every page is on, and only a coloured icon when some pages
  are on. The first page can start a new sheet only after the table
  of contents. New sheet is stored with each page in the list.

**Command palette.** Press `>`, click the ⚡ button next to the search box, or
type `>` in the file search (Ctrl/Cmd+P). It has **Print…**, **Add to print
list** / **Remove from print list** for the current page, and **Print list…**.
Shortcuts work in any keyboard layout: on the Russian layout, `>` is
Shift+`Ю` and Ctrl/Cmd+P is Ctrl/Cmd+`З`.

### How the printed document looks

Printing opens the pages at `/_print` in a new tab, without the sidebar, top bar
and tabs, and calls the browser's print dialog. The tab has its own Print
button, for browsers that block printing without a click.

- The page is always printed in the light theme, with 16 mm margins and the paper
  size chosen in the print dialog.
- Code blocks wrap long lines, collapsed `<details>` blocks print open, and code
  and callout backgrounds print in colour.
- A link to another page in the same document jumps inside the PDF. Links to
  pages that are not printed point to the site.
- An image keeps its natural size up to the page width, and a tall image shrinks
  to fit one sheet. An image wider than the page (673 px) and wider than tall is
  turned 90° and fills its own sheet.
- A draw.io diagram prints as the image saved in the file: its first page, with
  all its layers.

When a page in the list no longer exists, `/_print` lists it as missing and
prints the rest.

On iOS, save the PDF from the print dialog with Share → Save to Files.

`/_print` is one of the routes `cantipRoutes()` adds (see
[Add to an existing Remix app](#add-to-an-existing-remix-app)). A site that does
not use `cantipRoutes()` needs the route as a file, or Print opens a 404:

```ts
// app/routes/[_print].tsx
export { loader } from 'cantip/routes/print.server'
export { default, meta, handle } from 'cantip/routes/print'
```

## Hide files

Put a `.cantipignore` file in a source folder to leave files out of the site. It
uses `.gitignore` syntax, and each project reads the files in its own source:

```gitignore
# A folder and everything in it
Archive/
# An extension, at any depth
*.tmp
# One file, at any depth
old-budget.xlsx
# Only at the top of this folder
/drafts.md
```

As in git, `#` starts a comment only at the beginning of a line, and nothing
inside an ignored folder can be brought back with `!`.

A matched file is left out completely: it isn't compiled, copied to `public/`,
listed in the sidebar or indexed for search, and wikilinks to it stay
unresolved. This covers notes, images, other files, `.canvas` files and `_meta`
files.

A `.cantipignore` can sit in any subfolder too. Its patterns are relative to
that folder, and a deeper file can re-include with `!`, the same as nested
`.gitignore` files.

> The `ignore` option in `docs.config.ts` was replaced by `.cantipignore`. A
> config that still sets it fails with an error; move its patterns into a
> `.cantipignore` in the source folder.

## Update content on a running server

A production server (`remix-serve` or your own) needs no restart and no rebuild
when the docs change. Run `cantip generate` in the project folder while the
server runs. The server checks `app/generated/site.json` at most once per second
and serves the new content as soon as the generator finishes. Requests during the
run get the previous content, because the generator replaces each data file in a
single step, after everything else. If the generator fails, the server keeps
serving the last good content.

`remix-serve` serves static files (images, the search index, branding) from
`build/client/`, not from `public/`. Set `CANTIP_STATIC_DIR` so the generator
copies `public/` there before it switches the content over:

```sh
CANTIP_STATIC_DIR=build/client npx cantip generate
```

The Docker image does this when it receives `SIGHUP`; see the
[Docker README](https://github.com/Sedokina/cantip/blob/main/docker/README.md#live-refresh).

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

### Step 1 — Mount the routes (both modes)

With `cantipRoutes()` in `vite.config.ts` (see
[Add to an existing Remix app](#add-to-an-existing-remix-app)), the routes are
already mounted and only the env vars below are needed. Without it, re-export
them from your `app/`:

```ts
// app/routes/api.jira.ts        — publish endpoint (status + create/update)
export { loader, action } from 'cantip/routes/api.jira'
```

The three routes below are **only needed for per-user mode** (Mode A) — skip them
if you only use the shared account:

```ts
// app/routes/jira.connect.ts    — start OAuth
export { loader } from 'cantip/routes/jira.connect'
// app/routes/jira.callback.ts   — OAuth callback
export { loader } from 'cantip/routes/jira.callback'
// app/routes/jira.disconnect.ts — clear the session
export { action } from 'cantip/routes/jira.disconnect'
```

> **All env vars below are read by the _server_ at runtime** — set them where the
> server process runs. `remix vite:dev` does **not** load `.env` into
> `process.env`, so `export` them in that same shell (or set them in your
> container/host). `.env` files won't reach the server.

Pick **one** of the two modes (or run both — see "Combining" at the end).

### Mode A — Per-user (each person publishes as themselves)

Everyone connects their own Jira account; Jira enforces each person's own
permissions. The OAuth credentials below identify the **app**, not a user — every
user authorizes through the one app and gets their own tokens (like "Sign in with
Google"). There is **no** shared account in this mode.

1. **Register an OAuth 2.0 (3LO) app** at
   <https://developer.atlassian.com/console/myapps/> → *Create* → *OAuth 2.0
   integration*.
2. **Add the Jira API** to the app and set its **scopes**:
   `read:jira-work`, `write:jira-work`, `read:jira-user`, `offline_access`.
3. **Set the callback URL** (Authorization → Callback URL) to your origin +
   `/jira/callback`. It must match **exactly**. Add one per origin you use, e.g.:
   - dev: `http://localhost:5173/jira/callback`
   - prod: `https://docs.example.com/jira/callback`
4. **Copy the Client ID and Secret** from the app's *Settings*.
5. **Set these env vars** (and leave the Mode B vars unset):

   ```bash
   export JIRA_OAUTH_CLIENT_ID=<client id>
   export JIRA_OAUTH_CLIENT_SECRET=<client secret>
   export SESSION_SECRET=$(openssl rand -hex 32)   # encrypts each user's cookie
   # behind a reverse proxy: set the exact public callback (see note below)
   export JIRA_OAUTH_REDIRECT_URI=https://docs.example.com/jira/callback
   # optional: pre-fill the dialog's pickers
   export JIRA_DEFAULT_PROJECT=PROJ
   export JIRA_DEFAULT_ISSUE_TYPE=Task
   ```

6. **Start the server, open a doc page → Publish to Jira → Connect Jira.** After
   consenting on Atlassian you're publishing as yourself. Each browser repeats
   this once; tokens are stored in an encrypted cookie (no database, replica-safe)
   and refresh automatically.

`SESSION_SECRET` is any random string; keep it stable (changing it logs everyone
out). If a user's Jira spans multiple sites, set `JIRA_BASE_URL` to pick which
one — otherwise the first accessible site is used.

> **Behind a reverse proxy, set `JIRA_OAUTH_REDIRECT_URI`** to the exact public
> callback (e.g. `https://docs.example.com/jira/callback`). The app otherwise
> derives the callback from the request, and a TLS-terminating proxy makes it see
> `http://…`, so the `redirect_uri` won't match what you registered (Atlassian
> rejects it: *"redirect_uri is not registered"*). In local dev (no proxy) you can
> omit it. It must match the registered callback exactly.

### Mode B — Shared account (one identity for everyone)

Everyone publishes as a single Jira account — simplest, also right for
cron/automation. No OAuth app, no per-user connecting.

1. **Create an API token** for the account at
   <https://id.atlassian.com/manage-profile/security/api-tokens> → *Create API
   token*.
2. **Set these env vars** (you do **not** need the route stubs from Step 1's
   second block):

   ```bash
   export JIRA_BASE_URL=https://your-org.atlassian.net
   export JIRA_EMAIL=service-account@your-org.com
   export JIRA_API_TOKEN=<the API token>
   # optional: pre-fill the dialog's pickers
   export JIRA_DEFAULT_PROJECT=PROJ
   export JIRA_DEFAULT_ISSUE_TYPE=Task
   ```

3. **Start the server, open a doc page → Publish to Jira.** Every publish acts as
   that one account.

### Combining the two

If you set **both** modes' env vars, per-user wins: a connected browser publishes
as itself, and any browser that hasn't connected falls back to the shared
account. The dialog shows which identity is in use and offers *Connect Jira* /
*Disconnect*. For pure per-user with no shared fallback, use **Mode A only**.

### Links in the published page

A published page keeps its links, and cantip rewrites the internal ones to
absolute URLs so they still work when read on the Jira side. Internal links are
root-relative on the docs site (`/project/page`), which on `*.atlassian.net`
would resolve against Jira's own domain.

The origin comes from `CANTIP_PUBLIC_URL`:

```bash
export CANTIP_PUBLIC_URL=https://docs.example.com
```

Unset, it falls back to the request's own origin, which is right in local dev and
wrong behind a TLS-terminating reverse proxy (the Node server sees `http://…`).
Set it for any deployment that isn't localhost. External links, `mailto:`, and
in-page anchors are published as authored.

This applies to what cantip publishes. A reader who selects text in the browser
and copies it gets absolute URLs from the browser itself.

### Linked tickets (the update flow)

Tickets offered in *Update existing* are detected two ways: a `jira:` frontmatter
field (a key or browse URL, or a list of them), **and** any in-body markdown link
to a `…/browse/KEY` URL. The dialog lists them with their live status and marks
completed ones.

## Exports

| Import | What |
| --- | --- |
| `cantip/vite` | The Vite plugin (`cantip`) and `cantipRoutes`. |
| `cantip/config` | `defineConfig` + the config schema. |
| `cantip/source` | `loader()` + the `Source`/`VirtualFile` content contract (framework-agnostic). |
| `cantip/root`, `cantip/root.server` | Root layout + `CantipProvider` + the loader. |
| `cantip/routes/doc`, `cantip/routes/doc.server` | Doc page + loader. |
| `cantip/routes/print`, `cantip/routes/print.server` | Print view (`/_print`) + loader. |
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
