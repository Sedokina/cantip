# __PROJECT_NAME__

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

Quick config — branding & theme in `docs.config.ts`:

- **Branding** — `site.title`, `site.logo`, `site.favicon`, `site.defaultTheme`.
- **Theme** — `theme.colors` (OKLCH tokens), no CSS editing required.

Swap a component — at runtime, in your `app/root.tsx` (no config, no regenerate):

```tsx
import { Layout, CantipProvider } from 'cantip/root'
export { loader } from 'cantip/root.server'
export { links } from 'cantip/root'

export default function App() {
  return (
    <CantipProvider components={{ TopBar: MyTopBar }}>
      <Layout />
    </CantipProvider>
  )
}
```

Deep customization — **this is a real Remix app you own**:

- `vite.config.ts`, `app/root.tsx`, `app/routes/*` are yours to edit.
- Add your own routes (e.g. `app/routes/blog.tsx`) alongside the docs.
- Import pieces directly: `import { Sidebar, Search } from 'cantip/components'`,
  or build fully custom pages with `cantip/core` + `cantip/source` (`loader`).

See the cantip docs for the full reference.
