/**
 * The framework-agnostic heart of the Nuxt module: turn a resolved bundle into a
 * `<head>` mutation, and keep one stale-while-revalidate cache per site host.
 *
 * This file imports nothing from Nuxt or Nitro so it can be unit-tested with a
 * fake `fetch` and a plain object in place of Nitro's render context. The module
 * (`module.ts`) and the Nitro server plugin (`runtime/server/plugin.ts`) are the
 * thin framework shells around it.
 *
 * Fail-open everywhere: a null, inactive or empty bundle injects nothing, and any
 * error while reaching the cache is swallowed so SSR is never broken.
 */
import { createBundleCache } from '@adsentinel/plugin-core';
import type { BundleCache, PluginSettings } from '@adsentinel/plugin-core';

/** The control credentials for a site, without the per-request host. */
export type SiteCredentials = Omit<PluginSettings, 'siteHost'>;

/**
 * The slice of Nitro's `render:html` context this module touches: `head` is the
 * array of HTML strings rendered inside `<head>`, in order. Unshifting places the
 * serving tags before any existing head children — the top of `<head>`.
 */
export interface RenderHead {
  head: string[];
}

/**
 * A resolver of SWR caches keyed by site host.
 *
 * A Nuxt server can answer for more than one host, and the control API wants the
 * host as a query parameter, so each host needs its own cache. The caches are
 * created lazily and kept for the lifetime of the server, so after the first
 * request per host the control API is hit at most once per TTL and never on the
 * request's critical path.
 */
export function createHostBundleCaches(credentials: SiteCredentials): (host: string | undefined) => BundleCache {
  const byHost = new Map<string, BundleCache>();
  return (host) => {
    const key = host ?? '';
    let cache = byHost.get(key);
    if (!cache) {
      cache = createBundleCache({ ...credentials, siteHost: host });
      byHost.set(key, cache);
    }
    return cache;
  };
}

/**
 * Prepend the serving tags at the top of `<head>`.
 *
 * Fail-open: a null or inactive bundle, empty tags, or any error reaching the
 * cache leaves `head` untouched and never throws into the render.
 */
export async function injectBundleTags(renderHead: RenderHead, cache: BundleCache): Promise<void> {
  try {
    const bundle = await cache.get();
    if (!bundle || !bundle.active || !bundle.tags) return;
    renderHead.head.unshift(bundle.tags);
  } catch {
    // Never break SSR over a control-plane problem.
  }
}
