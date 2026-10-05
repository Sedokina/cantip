# Changelog

Release notes for `cantip` and `create-cantip`, which are released together.
Each release on GitHub takes its notes from the matching section below.

## 0.9.3

### Added

- **Printing and PDF export.** The printer button in a note's title row and
  **Print…** in the sidebar ⋮ menu print a note or an image through the
  browser's print dialog, from where it can be saved as a PDF. A print list
  collects notes and images from anywhere in the site into one document: add
  them one by one or a whole folder with its subfolders, then reorder them in the
  dialog. Options: one table of contents, frontmatter properties, and a new
  sheet for each page. The document is printed in the light theme, links
  between printed pages jump inside the PDF, and images wider than the page
  are turned 90°. See "Print and save as PDF" in the package README.
- **Command palette.** `>`, the ⚡ button next to the search box, or `>` typed in
  the file search (Ctrl/Cmd+P) lists the print commands for the current page.
- `HastRenderer` takes a `components` prop that replaces element components for
  one tree.

### Changed

- Sites created before this version need the print route. Add
  `app/routes/[_print].tsx`:

  ```ts
  export { loader } from 'cantip/routes/print.server'
  export { default, meta, handle } from 'cantip/routes/print'
  ```

- The ⋮ buttons in the sidebar are always visible on touch screens. They
  appeared only on hover before, so phones never showed them.

### Fixed

- Keyboard shortcuts work in any keyboard layout. With the Russian layout
  active, `l`, `c`, `w`, `?`, Ctrl/Cmd+K and Ctrl/Cmd+P did nothing before.

## 0.9.2

### Added

- **Block links.** `[[note#^id]]` and `[[#^id]]` scroll to the block that ends
  with `^id`. An id on its own line after a table, quote, list or callout
  belongs to that block. `![[note#^id]]` embeds only that block. The `^id`
  marker stays visible in a muted, smaller style. A `^` without whitespace
  before it, as in `x^2`, stays text.
- **Content updates without a restart.** A running server picks up the output of
  `cantip generate` by itself. It checks `app/generated/site.json` at most once
  per second (on every request in dev) and reloads content and site data
  together. Requests during a run get the previous content, and a failed run
  leaves the last good content in place.
- `CANTIP_STATIC_DIR`: `cantip generate` copies `public/` into this folder before
  it switches the content over. Set it to `build/client` when the server is
  `remix-serve`.
- **Dev watches every source folder.** The plugin watches each source folder
  from `docs.config.ts`, including folders outside the project, regenerates when
  a file is added, changed, renamed or deleted, and reloads the browser once the
  new content is ready. Edits made during a run are no longer lost.
  `cantip({ watch })` adds more files or folders to watch.

### Changed

- Docker: `SIGHUP` regenerates in place and keeps the server running. It now
  also applies changes to `docs.config.ts` and to branding files in `public/` on
  the volume, which needed a container restart before.

### Fixed

- `[[note#A#B]]` links to heading B, the last one in the chain, on another
  note, on the same page and in embeds. It linked to heading A before.
- Wikilinks with a folder path, such as `[[Screenshots/Login.png]]`, find the
  file by its path, so an image link opens the image's page.
- Markdown links to notes now work in every source folder: `[x](note.md)`,
  `[x](Folder/Note.md)`, `[x](../Other/Note.md)` and `[x](note.md#Heading)`.
  Before, they were left unchanged unless the vault's Obsidian settings used
  Markdown links, and they were matched by file name only. Links that start
  with `/` are left as they are.
- Tables and math inside embedded notes render. They showed as plain text.
- Clicking a link to a heading or block on the same page, or an entry in the
  table of contents, scrolls there every time. A second click on the same
  anchor used to stop partway or stay in place.
- Linked blocks land below the sticky top bar instead of under it.
- Docker: `SIGHUP` no longer stops the container.
- In dev, a config change no longer starts two generator runs at the same time.
- `CANTIP_SKIP_IF_FRESH` skips generation again when nothing changed. It looked
  for the removed `ui.ts`, so every `remix vite:build` generated the content in
  both of its passes.

## 0.9.1

### Fixed

- draw.io diagrams exported by draw.io itself now open in the viewer. 0.9.0
  missed their diagram data, because these exports start with a comment line
  before the DOCTYPE, and showed them as static images only.

### Changed

- Embedded draw.io diagrams are no longer inverted in the dark theme. Diagrams
  exported with draw.io's adaptive colours switch between light and dark by
  themselves. Other diagrams and `.drawio.png` files keep their own colours.
- The site sets the CSS `color-scheme` from its light/dark theme. Diagrams with
  draw.io's adaptive colours, and native browser UI such as scrollbars, follow
  the theme toggle instead of the operating system's setting.

## 0.9.0

### Breaking

- The `ignore` option in `docs.config.ts` (projects and `general`) is removed. A
  config that still sets it fails with an error. Move its patterns into a
  `.cantipignore` file in the source folder, for example a `.cantipignore`
  containing `CLAUDE.md` instead of `ignore: ['CLAUDE.md']`.

### Added

- **Images in the sidebar.** Every image in a source folder is listed under its
  file name and opens on its own page. `[[image.png]]` links to that page;
  `![[image.png]]` still embeds the image. Image files keep their original
  names in `public/`.
- **draw.io diagrams.** A `.drawio.svg` or `.drawio.png` opens in the
  interactive draw.io viewer on its own page: pages, zoom, fit, centre, layers,
  fullscreen, drag to pan and Ctrl+wheel to zoom, following the site theme. The
  viewer is served from the site itself; the first `cantip generate` that finds
  a diagram downloads it into `public/_drawio/`. `drawio: { viewer: false }`
  turns it off. Embedded diagrams are inverted in the dark theme.
- **Other files in the sidebar.** Spreadsheets, documents, PDFs, archives and
  any other file in a source folder are listed with an icon for their type.
  Clicking one, or a wikilink to it, opens it in a new tab, where the browser
  shows it or downloads it. `![[file.xlsx]]` embeds a link card.
- **`.cantipignore`.** A file with `.gitignore` syntax in any source folder
  leaves matching files and folders out of the site completely, including
  `.canvas` and `_meta` files.

### Fixed

- Links to files under `public/` (PDFs, images) no longer lead to a 404 page.
