/**
 * `createBundleCache` serves a fresh bundle within its TTL, serves the stale one
 * while a refresh runs, and keeps the last good bundle when a refresh fails.
 */
import { describe, it, expect, vi } from 'vitest';
import { createBundleCache } from './bundle-cache.js';
import type { EdgeBundle, PluginSettings } from './types.js';

/** Let the background refresh's microtasks settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function bundle(tagId: string): EdgeBundle {
  return {
    host: 'example.com',
    active: true,
    generation: 1,
    mode: 'first-party',
    origin: 'https://example.com',
    servingHost: 'example.com',
    routePrefixes: ['abc'],
    ownPaths: ['/sdk.js'],
    tagId,
    markerPrefix: 'as',
    tags: `<script data-tag="${tagId}"></script>`,
    ttlSeconds: 300,
  };
}

const SETTINGS: PluginSettings = { controlOrigin: 'https://page-kit.io', apiId: 'id', apiKey: 'key', siteHost: 'example.com' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('createBundleCache', () => {
  it('serves a fresh bundle within the TTL without fetching again', async () => {
    let clock = 1_000;
    const fetchImpl = vi.fn(async () => jsonResponse(bundle('first'))) as unknown as typeof fetch;
    const cache = createBundleCache({ ...SETTINGS, fetchImpl }, { now: () => clock });

    expect((await cache.get())?.tagId).toBe('first');
    clock += 100_000; // still under 300 s
    expect((await cache.get())?.tagId).toBe('first');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('serves the stale bundle while revalidating, then the fresh one', async () => {
    let clock = 1_000;
    let current = bundle('first');
    const fetchImpl = vi.fn(async () => jsonResponse(current)) as unknown as typeof fetch;
    const cache = createBundleCache({ ...SETTINGS, fetchImpl }, { now: () => clock });

    expect((await cache.get())?.tagId).toBe('first');

    clock += 301_000; // TTL elapsed
    current = bundle('second');
    // The stale bundle is served immediately, the refresh runs in the background.
    expect((await cache.get())?.tagId).toBe('first');
    await flush();
    // The background refresh has landed; the next read is fresh.
    expect((await cache.get())?.tagId).toBe('second');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('keeps the last good bundle when a refresh fails (fail-open)', async () => {
    let clock = 1_000;
    let healthy = true;
    const fetchImpl = vi.fn(async () => {
      if (!healthy) throw new Error('control plane down');
      return jsonResponse(bundle('first'));
    }) as unknown as typeof fetch;
    const cache = createBundleCache({ ...SETTINGS, fetchImpl }, { now: () => clock });

    expect((await cache.get())?.tagId).toBe('first');

    clock += 301_000;
    healthy = false;
    expect((await cache.get())?.tagId).toBe('first'); // stale served, refresh kicked
    await flush(); // refresh fails, last-good kept
    expect((await cache.get())?.tagId).toBe('first');
  });

  it('returns null when the very first fetch fails, and blocks on it', async () => {
    const fetchImpl = (async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    const cache = createBundleCache({ ...SETTINGS, fetchImpl });
    expect(await cache.get()).toBeNull();
  });
});
