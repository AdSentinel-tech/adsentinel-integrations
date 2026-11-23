/**
 * @adsentinel/plugin-core — the framework-agnostic foundation every AdSentinel
 * framework integration plugin (React, Nuxt, Express, Vite, Webpack, Astro)
 * imports.
 *
 * A publisher integrates AdSentinel dynamically by fetching its two serving
 * tags from the control API and injecting them into the page `<head>`. This
 * package encapsulates exactly that, isomorphically (Node and edge runtimes,
 * global `fetch`, injectable for tests) and fail-open (a control-plane outage, a
 * bad credential or malformed HTML never throws into the host app).
 *
 * It also carries the wire contract with the control API: the `EdgeBundle`
 * type, its JSON Schema (`@adsentinel/plugin-core/edge-bundle.schema.json`) and
 * the contract version (`EDGE_BUNDLE_CONTRACT_VERSION`).
 */
export { API_ID_HEADER, API_KEY_HEADER, BUNDLE_PATH, DEFAULT_CONTROL_ORIGIN, DEFAULT_TTL_SECONDS } from './constants.js';
export type { BundleCache, EdgeBundle, PluginSettings, ServingMode } from './types.js';
export { CONTRACT_VERSION_HEADER, EDGE_BUNDLE_CONTRACT_VERSION } from './contract.js';
export { EDGE_BUNDLE_SCHEMA } from './edge-bundle-schema.js';
export { edgeBundleUrl, fetchEdgeBundle } from './fetch-bundle.js';
export { createBundleCache } from './bundle-cache.js';
export type { BundleCacheOptions, BundleStore } from './bundle-cache.js';
export { injectTagsIntoHtml } from './inject-tags.js';
export { isOwnPath } from './own-path.js';
