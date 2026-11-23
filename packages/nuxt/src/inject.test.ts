/**
 * The module's injection core, exercised with a FAKE fetch and a plain object in
 * place of Nitro's render context (the full Nuxt/Nitro runtime is not booted).
 *
 * What it proves:
 *   - tags are prepended at the top of `<head>` when the bundle is active;
 *   - nothing is injected when the bundle is null, inactive, or has empty tags;
 *   - a throwing cache never breaks the render (fail-open);
 *   - the per-host factory keeps one cache per host and reuses it.
 */
import { describe, it, expect, vi } from 'vitest';
import type { BundleCache, EdgeBundle } from '@adsentinel/plugin-core';
import { createHostBundleCaches, injectBundleTags, type RenderHead } from './inject.js';

const TAGS = '<script src="/a.js"></script><script src="/b.js"></script>';

function bundle(overrides: Partial<EdgeBundle> = {}): EdgeBundle {
  return {
    host: 'example.com',
    active: true,
    generation: 1,
    mode: 'first-party',
    origin: 'https://example.com',
    servingHost: 'example.com',
    routePrefixes: ['abc'],
    ownPaths: ['/a.js'],
    tagId: 'tag',
    markerPrefix: 'as',
    tags: TAGS,
    ttlSeconds: 300,
    ...overrides,
  };
}

/** A cache stub that returns a fixed value, independent of the network. */
function cacheOf(value: EdgeBundle | null): BundleCache {
  return { get: async () => value };
}

/** A fresh render head, like the object Nitro's `render:html` hook hands the plugin. */
function head(...existing: string[]): RenderHead {
  return { head: [...existing] };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('injectBundleTags', () => {
  it('prepends the tags at the top of <head> when the bundle is active', async () => {
    const renderHead = head('<title>Hi</title>');
    await injectBundleTags(renderHead, cacheOf(bundle()));
    expect(renderHead.head).toEqual([TAGS, '<title>Hi</title>']);
  });

  it('injects nothing when the cache yields null', async () => {
    const renderHead = head('<title>Hi</title>');
    await injectBundleTags(renderHead, cacheOf(null));
    expect(renderHead.head).toEqual(['<title>Hi</title>']);
  });

  it('injects nothing when the bundle is inactive', async () => {
    const renderHead = head('<title>Hi</title>');
    await injectBundleTags(renderHead, cacheOf(bundle({ active: false })));
    expect(renderHead.head).toEqual(['<title>Hi</title>']);
  });

  it('injects nothing when the tags string is empty', async () => {
    const renderHead = head('<title>Hi</title>');
    await injectBundleTags(renderHead, cacheOf(bundle({ tags: '' })));
    expect(renderHead.head).toEqual(['<title>Hi</title>']);
  });

  it('never throws when the cache throws (fail-open)', async () => {
    const throwing: BundleCache = {
      get: async () => {
        throw new Error('control plane down');
      },
    };
    const renderHead = head('<title>Hi</title>');
    await expect(injectBundleTags(renderHead, throwing)).resolves.toBeUndefined();
    expect(renderHead.head).toEqual(['<title>Hi</title>']);
  });
});

describe('createHostBundleCaches', () => {
  it('builds a cache that fetches the active bundle and injects it', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(bundle())) as unknown as typeof fetch;
    const cacheFor = createHostBundleCaches({ controlOrigin: 'https://page-kit.io', apiId: 'id', apiKey: 'key', fetchImpl });

    const renderHead = head('<title>Hi</title>');
    await injectBundleTags(renderHead, cacheFor('example.com'));
    expect(renderHead.head[0]).toBe(TAGS);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reuses one cache per host and sends the host to the control API', async () => {
    const seenHosts: (string | null)[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString());
      seenHosts.push(url.searchParams.get('host'));
      return jsonResponse(bundle());
    }) as unknown as typeof fetch;
    const cacheFor = createHostBundleCaches({ controlOrigin: 'https://page-kit.io', apiId: 'id', apiKey: 'key', fetchImpl });

    const a1 = cacheFor('a.com');
    const a2 = cacheFor('a.com');
    const b1 = cacheFor('b.com');
    expect(a1).toBe(a2); // same host → same cache instance
    expect(b1).not.toBe(a1); // different host → different cache

    await injectBundleTags(head(), a1);
    await injectBundleTags(head(), b1);
    expect(seenHosts).toEqual(['a.com', 'b.com']);
  });

  it('does not inject when the control API fails for a host (fail-open)', async () => {
    const fetchImpl = (async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    const cacheFor = createHostBundleCaches({ controlOrigin: 'https://page-kit.io', apiId: 'id', apiKey: 'key', fetchImpl });

    const renderHead = head('<title>Hi</title>');
    await injectBundleTags(renderHead, cacheFor('example.com'));
    expect(renderHead.head).toEqual(['<title>Hi</title>']);
  });
});
