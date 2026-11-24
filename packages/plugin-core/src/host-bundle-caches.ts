/**
 * One stale-while-revalidate bundle cache per site host.
 *
 * A server can answer for several hosts, and the bundle is per host, so a
 * request-time adapter keeps one cache per resolved host. The caches are
 * created lazily and kept for the life of the process: after the first request
 * per host, the control API is hit at most once per TTL.
 *
 * The host usually comes from request headers, which a client can set, so the
 * number of caches is bounded: past {@link MAX_HOST_CACHES} hosts the oldest
 * cache is dropped.
 */
import { createBundleCache, type BundleCacheOptions } from './bundle-cache.js';
import type { BundleCache, PluginSettings } from './types.js';

/** The control credentials for a site, without the per-request host. */
export type SiteCredentials = Omit<PluginSettings, 'siteHost'>;

/** The most site hosts one resolver keeps a cache for. */
export const MAX_HOST_CACHES = 100;

/** A resolver of the bundle cache for a (normalised) site host. */
export function createHostBundleCaches(
  credentials: SiteCredentials,
  opts: Pick<BundleCacheOptions, 'now'> = {},
): (host: string | undefined) => BundleCache {
  const byHost = new Map<string, BundleCache>();
  return (host) => {
    const key = host ?? '';
    let cache = byHost.get(key);
    if (!cache) {
      // Only the clock is shared: each host needs its own store.
      cache = createBundleCache({ ...credentials, siteHost: host }, { now: opts.now });
      if (byHost.size >= MAX_HOST_CACHES) {
        const oldest = byHost.keys().next().value;
        if (oldest !== undefined) byHost.delete(oldest);
      }
      byHost.set(key, cache);
    }
    return cache;
  };
}
