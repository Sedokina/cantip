# Changelog

Release notes for `cantip` and `create-cantip`, which are released together.
Each release on GitHub takes its notes from the matching section below.

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
