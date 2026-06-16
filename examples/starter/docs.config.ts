import { defineConfig } from 'cantip/config'

/**
 * Your docs site config. Every field is optional — start minimal and add as you
 * grow. Run `npx cantip dev` after editing.
 *
 * Content sources: each `project` points `source` at a directory of markdown
 * (a loose folder, a git submodule, or any path). The project `id` becomes the
 * first URL segment. Or drop loose files into ./content and enable `general`
 * below to serve them at the root with no project concept at all.
 */
export default defineConfig({
	site: {
		title: 'My Docs',
		description: 'Documentation built with cantip.',
		// Drives sort order + search tokenisation. e.g. 'en', 'ru', 'de'.
		lang: 'en',
		defaultTheme: 'dark', // 'dark' | 'light'
	},

	// The no-project bucket: loose markdown in ./docs, served at the root
	// (e.g. docs/intro.md → /intro/). Remove this and use `projects` instead if
	// you want multiple named docsets with a project switcher. (Note: keep your
	// source dir distinct from ./content — that name is the generated output.)
	general: {
		enabled: true,
		source: './docs',
		canvas: true, // ingest .canvas files from ./docs too (e.g. docs/welcome.canvas)
	},

	// Named projects (uncomment to use instead of / alongside `general`):
	// projects: [
	//   {
	//     id: 'guide',
	//     name: 'User Guide',
	//     source: './content/guide',   // loose folder, submodule, or any path
	//     description: 'How to use the product.',
	//     canvas: false,               // set true to ingest .canvas files too
	//   },
	// ],

	// Override the brand color (and any other OKLCH token) without touching CSS:
	// theme: { colors: { dark: { '--brand': 'oklch(0.7 0.2 250)' } } },

	// Customize the markdown pipeline (build-time). The hook receives cantip's
	// default remark/rehype steps; return the chain to run (reorder/drop/extend):
	//   markdown: {
	//     pipeline: (steps) => [
	//       ...steps,
	//       { name: 'rehype-external-links', plugin: rehypeExternalLinks, options: { target: '_blank' } },
	//     ],
	//   },

	// To swap a built-in component (TopBar/Toc/Home/DocPage), wrap the layout in
	// your app/root.tsx — it's a runtime prop, no config needed:
	//   <CantipProvider components={{ TopBar: MyTopBar }}><Layout/></CantipProvider>

	// Order the sidebar: drop a `_meta.yaml` into any source folder —
	//   order: [getting-started, installation, advanced]   # rest appends A→Z
	//   label: { advanced: Advanced Topics }                # rename subfolders
})
