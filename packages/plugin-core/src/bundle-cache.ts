/**
 * A stale-while-revalidate holder for a site's bundle, so a plugin fetches the
 * control API at most once per TTL and never blocks a page on it after the
 * first load.
 *
 * Runtime-agnostic counterpart of the Cloudflare edge's `loadBundle` caching
 * (`@adsentinel/cloudflare`): the Cloudflare `Cache` is replaced by a pluggable
 * store, and the clock by an injectable `now`, so the policy can be exercised
 * without a network or a real timer.
 *
 * Policy, matching the edge:
 *   - fresh within `ttlSeconds`: serve it, no fetch;
 *   - stale (TTL elapsed) with a last good bundle: serve it AND refresh in the
 *     background;
 *   - empty: fetch once and serve the result (or null);
 *   - a refresh that fails keeps the last good bundle (fail-open), so an outage
 *     serves the last known tags rather than nothing.
 */
import { DEFAULT_TTL_SECONDS } from './constants.js';
import { fetchEdgeBundle } from './fetch-bundle.js';
import type { BundleCache, EdgeBundle, PluginSettings } from './types.js';

/** Where the last good bundle lives. The default is in-memory; an adapter may pass a shared one. */
export interface BundleStore {
  get(): EdgeBundle | null;
  set(bundle: EdgeBundle | null): void;
}

export interface BundleCacheOptions {
  /** The clock, in ms. Defaults to `Date.now`. Injectable so TTL can be tested without waiting. */
  now?: () => number;
  /** The backing store. Defaults to a per-cache in-memory slot. */
  store?: BundleStore;
}

function memoryStore(): BundleStore {
  let held: EdgeBundle | null = null;
  return {
    get: () => held,
    set: (bundle) => {
      held = bundle;
    },
  };
}

export function createBundleCache(settings: PluginSettings, opts: BundleCacheOptions = {}): BundleCache {
  const now = opts.now ?? (() => Date.now());
  const store = opts.store ?? memoryStore();
  // The freshness clock is this cache's own: an external store may already hold
  // a bundle, which we then treat as stale (good) until the first refresh.
  let fetchedAt = 0;
  let inFlight: Promise<void> | null = null;

  function refresh(): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const fresh = await fetchEdgeBundle(settings);
      // A failed fetch returns null: keep the last good bundle and leave
      // `fetchedAt` untouched so the next call retries.
      if (fresh) {
        store.set(fresh);
        fetchedAt = now();
      }
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    async get(): Promise<EdgeBundle | null> {
      const current = store.get();
      if (current) {
        const ttlMs = (current.ttlSeconds || DEFAULT_TTL_SECONDS) * 1000;
        if (now() - fetchedAt < ttlMs) return current;
        // Stale: serve it now, refresh in the background (not awaited).
        void refresh();
        return current;
      }
      // Empty: block on the first fetch, then serve whatever it produced.
      await refresh();
      return store.get();
    },
  };
}
