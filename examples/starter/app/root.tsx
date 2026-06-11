// The docs root layout (header, sidebar, tabs, theme). This is YOUR file —
// replace it with your own layout or wrap cantip's. The loader is imported from
// cantip's `.server` entry so Remix keeps it server-only; the component + links
// come from the client-safe entry.
export { loader } from 'cantip/root.server'
export { default, links } from 'cantip/root'
