/**
 * @adsentinel/react — the server-side React integration for AdSentinel.
 *
 * A publisher integrates AdSentinel by fetching its two serving tags from the
 * control API and injecting them into the page `<head>`. This package does that
 * the React way, on the server, for the frameworks publishers actually ship:
 *
 *   - `getAdSentinelTags(settings)` — the raw tags HTML string, for places that
 *     own the document markup directly: Next.js Pages Router `_document`, Remix
 *     `root`/`entry.server`, and Vike render hooks.
 *   - `tagsFromBundle(bundle)` — the same, from a bundle you already hold (pair
 *     it with `createBundleCache` from `@adsentinel/plugin-core` to fetch at
 *     most once per TTL).
 *   - `<AdSentinelTags settings={…} />` — an async Server Component for the
 *     Next.js App Router, which has no document-string hook.
 *
 * Everything is server-side and fail-open: an inactive site, an empty bundle or
 * a control-plane failure renders nothing and never throws into the host app.
 * See README.md for a per-router recipe.
 */
export { getAdSentinelTags, tagsFromBundle } from './get-tags.js';
export { AdSentinelTags } from './adsentinel-tags.js';
export type { AdSentinelTagsProps } from './adsentinel-tags.js';

// Re-exported so an adapter user types their settings without a second import.
export type { EdgeBundle, PluginSettings } from '@adsentinel/plugin-core';
