/**
 * @adsentinel/webpack — AdSentinel's Webpack plugin.
 *
 * `new AdSentinelPlugin({ controlOrigin?, apiId, apiKey, siteHost })` fetches a
 * site's two serving tags from the control API at build time and injects them
 * into the emitted HTML — through HtmlWebpackPlugin's `beforeEmit` hook when it
 * is in the build, or by rewriting the emitted HTML asset otherwise. Fail-open:
 * a control-plane problem never fails the build. See the README for usage and
 * the rebuild-on-rotation caveat.
 *
 * The network and HTML work lives in `@adsentinel/plugin-core`; this package is
 * only the Webpack binding.
 */
export { AdSentinelPlugin } from './plugin.js';
export type { AdSentinelPluginOptions } from './plugin.js';
