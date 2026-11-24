/**
 * `createHostBundleCaches` keeps one cache per host, asks the control API for
 * that host, and bounds the number of hosts it keeps.
 */
import { describe, expect, it, vi } from 'vitest';
import { createHostBundleCaches, MAX_HOST_CACHES } from './host-bundle-caches.js';

const CREDENTIALS = { controlOrigin: 'https://page-kit.io', apiId: 'id', apiKey: 'key' };

describe('createHostBundleCaches', () => {
  it('reuses the cache of a host and creates one per new host', () => {
    const cacheFor = createHostBundleCaches(CREDENTIALS);
    expect(cacheFor('a.example')).toBe(cacheFor('a.example'));
    expect(cacheFor('a.example')).not.toBe(cacheFor('b.example'));
  });

  it('asks the control API for the host the cache was created for', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    const cacheFor = createHostBundleCaches({ ...CREDENTIALS, fetchImpl });
    await cacheFor('www.example.com').get();
    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://page-kit.io/plugin-support/edge-bundle?host=www.example.com');
  });

  it('drops the oldest cache past the host limit', () => {
    const cacheFor = createHostBundleCaches(CREDENTIALS);
    const first = cacheFor('host-0.example');
    for (let i = 1; i <= MAX_HOST_CACHES; i++) cacheFor(`host-${i}.example`);
    expect(cacheFor('host-0.example')).not.toBe(first);
  });
});
