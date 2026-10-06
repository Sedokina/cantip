# Changelog

Release notes for `cantip` and `create-cantip`, which are released together.
Each release on GitHub takes its notes from the matching section below.

## 0.9.5

### Added

- Print list rows can be reordered by drag and drop. Drag a row with the
  mouse, or long-press it on a touch screen. From the keyboard, focus a row's
  grip, press Space, move it with the arrow keys and press Space again. Screen
  readers announce each move in the site's language. The ↑ and ↓ buttons still
  work.
- **New sheet per page.** Each page in the print list has a button that starts
  it on a new sheet, so some pages can start a new sheet while others follow the
  page before them. The setting is stored with the page in the list and moves
  with it when the list is reordered. The same button in the list header
  replaces the "Start each page on a new sheet" checkbox and turns every page
  on or off. The first page can start a new sheet only after the table of
  contents.
- **File extensions** print option, off by default. Without it, printed files
  such as images are titled without their extension: `Login Screen` instead of
  `Login Screen.png`, `architecture` instead of `architecture.drawio.svg`.

### Changed

- "Start each page on a new sheet" is no longer one saved option for the whole
  list. A reader who had it turned on will find every page off after the
  upgrade and needs to turn it on again once.
- Image and draw.io pages show the file name in a title row above the image,
  like canvas pages.
- On the print page, an image's title is printed at body text size in semibold
  instead of at the size of a page title. When a wide image is printed rotated,
  its title is rotated with it and runs along the left edge of the sheet.

### Fixed

- The site's tab no longer freezes while the browser's print dialog is open in
  the print tab. The print tab now opens without a link back to the site's
  tab, so the two no longer share one event loop.
- Canvas pages fill the whole height of the page. Before, the canvas kept a
  2:1 aspect ratio and left an empty area below it when the content column was
  narrow. Existing sites need a content regeneration to get the fix.
- Canvas pages no longer show gray strips with leftover frames along the bottom
  and right edges when browser zoom is below 100%. The grid dots now reach the
  edges at any zoom.
- Canvas wheel controls stay the same after Shift or Ctrl is used. The wheel
  zooms, Shift+wheel pans horizontally, Alt+wheel pans vertically, and
  Ctrl+wheel zooms by the same step as the wheel. Before, the first Shift+wheel or Ctrl+wheel made the plain
  wheel pan instead of zoom until the page was reloaded, and each Ctrl+wheel
  notch jumped to the largest or smallest zoom.

## 0.9.4

### Added

- **`cantipRoutes()`** from `cantip/vite` adds the routes cantip owns: `/_print`
  and the Jira endpoints `/api/jira`, `/jira/connect`, `/jira/callback` and
  `/jira/disconnect`. Pass it to the Remix plugin once:

  ```ts
  import { cantip, cantipRoutes } from 'cantip/vite'

  remix({ routes: cantipRoutes() })
  ```

  After that, routes added in later versions arrive with the package upgrade,
  with no new files in `app/routes/`. A site's own file for one of these paths
  replaces cantip's route. `exclude` leaves routes out, and `appDirectory` sets
  an app folder other than `app/`.

### Changed

- New sites from `create-cantip`, and the Docker image, use `cantipRoutes()`.
  Their `app/routes/` holds only `$.tsx` and `_index.tsx`.
- Upgrading: existing sites keep working with their stub files. To switch, add
  `routes: cantipRoutes()` to `remix()` in `vite.config.ts` and delete
  `app/routes/[_print].tsx`, `api.jira.ts`, `jira.connect.ts`, `jira.callback.ts`
  and `jira.disconnect.ts`, unless you changed one of them.

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
