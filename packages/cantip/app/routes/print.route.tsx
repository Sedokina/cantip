// The /_print route module that `cantipRoutes()` registers. It joins the two
// halves the same way a site's `app/routes/[_print].tsx` stub does. The loader
// stays in a `.server` module, and Remix removes it from the browser bundle
// because this file is a route module.
export { loader } from './print.server'
export { default, meta, handle } from './print'
