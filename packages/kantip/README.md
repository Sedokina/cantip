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

Or add to an existing project:

```sh
npm install kantip
```

…then create a `docs.config.ts` and run `npx kantip dev`.

## CLI

| Command | What |
| --- | --- |
| `kantip generate` | Ingest sources + compile content from `docs.config.ts`. |
| `kantip dev` | Generate, then start the dev server. |
| `kantip build` | Generate, then build for production. |
| `kantip start` | Serve the production build. |
| `kantip typecheck` | Type-check the engine. |

## Configure

Everything lives in `docs.config.ts` (typed via `kantip/config`):

```ts
import { defineConfig } from 'kantip/config'

export default defineConfig({
  site: { title: 'My Docs', lang: 'en', defaultTheme: 'dark' },
  // Loose markdown in ./docs, served at the root:
  general: { enabled: true, source: './docs' },
  // …or named projects, each a folder / submodule / any path:
  // projects: [{ id: 'guide', name: 'Guide', source: './content/guide' }],
  // theme: { colors: { dark: { '--brand': 'oklch(0.7 0.2 250)' } } },
  // components: { Home: './app/MyHome.tsx' },
})
```

- **Content sources** — submodule, loose folder, any path, or a `general` bucket
  served at the root with no project concept.
- **Branding** — title, description, logos, favicon, language, default theme.
- **Theme** — `theme.colors` OKLCH tokens, no CSS edits.
- **Components** — swap `Home` / `DocPage` / `TopBar` / `Toc` for your own `.tsx`.

## License

MIT
