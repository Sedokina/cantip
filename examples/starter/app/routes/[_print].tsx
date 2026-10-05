// Print view at /_print: the pages listed in `?page=` without the site's
// sidebar, header and tabs, for the browser's print dialog. The loader comes
// from cantip's `.server` entry (kept server-only); the component from the
// client-safe entry.
export { loader } from 'cantip/routes/print.server'
export { default, meta, handle } from 'cantip/routes/print'
