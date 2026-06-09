# starter

A documentation site built with [cantip](https://www.npmjs.com/package/cantip).

## Develop

```sh
npm install
npm run dev        # generate content + start the dev server
```

## Build & serve

```sh
npm run build      # generate + production build
npm run start      # serve the build
```

## Add content

- Drop `.md` files into `docs/` — each becomes a page at its file path.
- Or edit `docs.config.ts` to add `projects`, each pointing `source` at a folder,
  a git submodule, or any path.

## Customize

Everything lives in `docs.config.ts`:

- **Branding** — `site.title`, `site.logo`, `site.favicon`, `site.defaultTheme`.
- **Theme** — `theme.colors` (OKLCH tokens), no CSS editing required.
- **Components** — `components` maps `Home`/`DocPage`/`TopBar`/`Toc` to your own
  `.tsx` files.

See the cantip docs for the full config reference.
