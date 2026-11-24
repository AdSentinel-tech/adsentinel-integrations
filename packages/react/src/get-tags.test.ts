/**
 * `tagsFromBundle` and `getAdSentinelTags` resolve a site's serving tags with no
 * network (an injected `fetchImpl`) and fail open to `''` on every bad path.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { siteHostFromHeaders } from './index.js';
import type { EdgeBundle, PluginSettings } from '@adsentinel/plugin-core';
import { getAdSentinelTags, tagsFromBundle } from './get-tags.js';

const TAGS = '<script src="https://page-kit.io/sdk.js"></script><script src="https://page-kit.io/cfg.js"></script>';

/** A bundle that passes `@adsentinel/plugin-core`'s `isEdgeBundle` guard. */
function bundle(overrides: Partial<EdgeBundle> = {}): EdgeBundle {
  return {
    host: 'example.com',
    active: true,
    generation: 1,
    mode: 'first-party',
    origin: 'https://example.com',
    servingHost: 'page-kit.io',
    routePrefixes: ['/plugin-support/'],
    ownPaths: [],
    tagId: 'tag_1',
    markerPrefix: 'as',
    tags: TAGS,
    ttlSeconds: 300,
    ...overrides,
  };
}

/** A `fetchImpl` that answers the bundle endpoint with the given body and status. */
function fakeFetch(body: unknown, ok = true): typeof fetch {
  return (async () =>
    ({
      ok,
      json: async () => body,
    }) as Response) as unknown as typeof fetch;
}

const settings = (fetchImpl: typeof fetch): PluginSettings => ({
  controlOrigin: 'https://page-kit.io',
  apiId: 'id',
  apiKey: 'key',
  siteHost: 'example.com',
  fetchImpl,
});

describe('tagsFromBundle', () => {
  it('returns the tags for an active bundle', () => {
    expect(tagsFromBundle(bundle())).toBe(TAGS);
  });

  it('returns "" for an inactive site (tags withheld even if present)', () => {
    expect(tagsFromBundle(bundle({ active: false, tags: TAGS }))).toBe('');
  });

  it('returns "" for an active bundle with empty tags', () => {
    expect(tagsFromBundle(bundle({ tags: '' }))).toBe('');
  });

  it('returns "" for a null bundle (fail-open)', () => {
    expect(tagsFromBundle(null)).toBe('');
    expect(tagsFromBundle(undefined)).toBe('');
  });
});

describe('getAdSentinelTags', () => {
  it('returns the tags when the bundle is active', async () => {
    await expect(getAdSentinelTags(settings(fakeFetch(bundle())))).resolves.toBe(TAGS);
  });

  it('returns "" when the site is inactive', async () => {
    await expect(getAdSentinelTags(settings(fakeFetch(bundle({ active: false }))))).resolves.toBe('');
  });

  it('returns "" when the bundle has empty tags', async () => {
    await expect(getAdSentinelTags(settings(fakeFetch(bundle({ tags: '' }))))).resolves.toBe('');
  });

  it('returns "" on a non-2xx response (fail-open)', async () => {
    await expect(getAdSentinelTags(settings(fakeFetch(bundle(), false)))).resolves.toBe('');
  });

  it('returns "" on a malformed body (fail-open)', async () => {
    await expect(getAdSentinelTags(settings(fakeFetch({ nope: true })))).resolves.toBe('');
  });

  it('never throws when the fetch itself throws (fail-open)', async () => {
    const throwing = (() => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    await expect(getAdSentinelTags(settings(throwing))).resolves.toBe('');
  });
});

describe('getAdSentinelTags site host', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** Resolve the tags with `siteHost`; return the host sent to the edge-bundle endpoint. */
  async function hostSentFor(siteHost: string | undefined): Promise<string | null> {
    const fetchImpl = vi.fn(fakeFetch(bundle()));
    expect(await getAdSentinelTags({ ...settings(fetchImpl as unknown as typeof fetch), siteHost })).toBe(TAGS);
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    return new URL(url).searchParams.get('host');
  }

  it('uses the plain Host header of the request', async () => {
    expect(await hostSentFor(siteHostFromHeaders(new Headers({ host: 'WWW.Example.com:3000' })))).toBe('www.example.com');
  });

  it('honours X-Forwarded-Host (first value) behind a reverse proxy', async () => {
    const headers = new Headers({ host: 'app-upstream.internal:3000', 'x-forwarded-host': 'www.example.com, edge.internal' });
    expect(await hostSentFor(siteHostFromHeaders(headers))).toBe('www.example.com');
  });

  it('always uses the explicit siteHost when set', async () => {
    const headers = { host: 'app-upstream.internal', 'x-forwarded-host': 'proxy.internal' };
    expect(await hostSentFor(siteHostFromHeaders(headers, 'www.example.com'))).toBe('www.example.com');
    expect(await hostSentFor('www.example.com')).toBe('www.example.com');
  });

  it('falls back to ADSENTINEL_SITE_HOST when no siteHost is given', async () => {
    vi.stubEnv('ADSENTINEL_SITE_HOST', 'www.example.com');
    expect(await hostSentFor(undefined)).toBe('www.example.com');
  });
});
