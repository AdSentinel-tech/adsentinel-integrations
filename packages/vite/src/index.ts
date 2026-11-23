/**
 * `@adsentinel/vite` — the AdSentinel Vite plugin.
 *
 * A publisher adds `adsentinel()` to the `plugins` array of their `vite.config`
 * and the plugin injects AdSentinel's two serving tags into the app's HTML
 * `<head>` via Vite's `transformIndexHtml` hook, at build and in the dev server.
 * The control call and the tags are owned by `@adsentinel/plugin-core`; this
 * package is the idiomatic Vite binding.
 *
 * NOTE: a production build bakes the tags that were current at build time, so a
 * serving-credential or generation rotation requires a rebuild. See `plugin.ts`
 * and the package README.
 */
export { adsentinel, DEFAULT_CONTROL_ORIGIN } from './plugin.js';
export type { AdSentinelViteOptions } from './plugin.js';
