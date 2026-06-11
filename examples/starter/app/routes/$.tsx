// Catch-all doc route: renders any /path/ as a doc page. Yours to edit — or add
// sibling routes (e.g. app/routes/about.tsx) alongside it. The loader comes from
// cantip's `.server` entry (kept server-only); the component + meta from the
// client-safe entry.
export { loader } from 'cantip/routes/doc.server'
export { default, meta } from 'cantip/routes/doc'
