/**
 * Component override slots.
 *
 * The generated `~/generated/slots` module exports each slot as either the user's
 * override component (from `docs.config.ts` `components`) or `null`. This module
 * pairs those with the engine defaults and exposes the resolved component each
 * call site should render — so route/layout code imports from here and never
 * needs to know whether an override exists.
 *
 * - `TopBar` / `Toc` are sub-components: resolved to override-or-default here, so
 *   `root.tsx` / `$.tsx` import the resolved component directly.
 * - `Home` / `DocPage` are route bodies: exposed as the override-or-null
 *   `HomeOverride` / `DocPageOverride`, since the route file owns its own default
 *   body (importing the engine route component here would be circular).
 *
 * To add a slot, expose the component on the generated module + map it here.
 */
import * as overrides from '~/generated/slots'

import DefaultTopBar from '~/components/TopBar'
import DefaultToc from '~/components/Toc'

/** Top bar (logo + switcher + search + toggle). Override or engine default. */
export const TopBar = overrides.TopBar ?? DefaultTopBar

/** Right-column table of contents. Override or engine default. */
export const Toc = overrides.Toc ?? DefaultToc

/** Home page body override, or null to use the engine's default home route body. */
export const HomeOverride = overrides.Home

/** Doc page body override, or null to use the engine's default doc route body. */
export const DocPageOverride = overrides.DocPage
