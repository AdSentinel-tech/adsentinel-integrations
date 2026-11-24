/**
 * `fetchEdgeBundle` sends the exact credential headers the control API checks, parses
 * a 200 bundle, and fails open (null) on every error path.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { fetchEdgeBundle, edgeBundleUrl } from './fetch-bundle.js';
import { resetUnknownHostWarning } from './unknown-host-warning.js';
import { API_ID_HEADER, API_KEY_HEADER } from './constants.js';
import { CONTRACT_VERSION_HEADER, EDGE_BUNDLE_CONTRACT_VERSION } from './contract.js';
import type { EdgeBundle, PluginSettings } from './types.js';

const BUNDLE: EdgeBundle = {
  host: 'example.com',
  active: true,
  generation: 3,
  mode: 'first-party',
  origin: 'https://example.com',
  servingHost: 'example.com',
  routePrefixes: ['abc', 'def'],
  ownPaths: ['/sdk.js', '/s/', '/report'],
  tagId: 'tag-123',
  markerPrefix: 'as',
  tags: '<script src="https://example.com/sdk.js"></script><script>window.__as=1</script>',
  ttlSeconds: 300,
};

const SETTINGS: PluginSettings = {
  controlOrigin: 'https://page-kit.io',
  apiId: 'api-id-value',
  apiKey: 'api-key-value',
  siteHost: 'example.com',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('edgeBundleUrl', () => {
  it('builds the bundle path with the host query and trims a trailing slash on the origin', () => {
    expect(edgeBundleUrl('https://page-kit.io/', 'example.com')).toBe(
      'https://page-kit.io/plugin-support/edge-bundle?host=example.com',
    );
  });

  it('normalises the host: lowercase, no port', () => {
    expect(edgeBundleUrl('https://page-kit.io', 'WWW.Example.com:3000')).toBe(
      'https://page-kit.io/plugin-support/edge-bundle?host=www.example.com',
    );
  });
});

describe('fetchEdgeBundle', () => {
  it('sends the exact plugin credential headers and the host query', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(BUNDLE)) as unknown as typeof fetch;
    await fetchEdgeBundle({ ...SETTINGS, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://page-kit.io/plugin-support/edge-bundle?host=example.com');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers[API_ID_HEADER]).toBe('api-id-value');
    expect(headers[API_KEY_HEADER]).toBe('api-key-value');
    expect(headers[CONTRACT_VERSION_HEADER]).toBe(String(EDGE_BUNDLE_CONTRACT_VERSION));
  });

  it('returns the parsed bundle on 200', async () => {
    const fetchImpl = (async () => jsonResponse(BUNDLE)) as unknown as typeof fetch;
    const bundle = await fetchEdgeBundle({ ...SETTINGS, fetchImpl });
    expect(bundle).toEqual(BUNDLE);
  });

  it('returns null on a network error (fail-open)', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    expect(await fetchEdgeBundle({ ...SETTINGS, fetchImpl })).toBeNull();
  });

  it('returns null on 403 (bad credential)', async () => {
    const fetchImpl = (async () => jsonResponse({ error: 'unauthorized' }, 403)) as unknown as typeof fetch;
    expect(await fetchEdgeBundle({ ...SETTINGS, fetchImpl })).toBeNull();
  });

  it('returns null on 500 (control-plane outage)', async () => {
    const fetchImpl = (async () => jsonResponse({ error: 'boom' }, 500)) as unknown as typeof fetch;
    expect(await fetchEdgeBundle({ ...SETTINGS, fetchImpl })).toBeNull();
  });

  it('returns null on a malformed body', async () => {
    const fetchImpl = (async () => jsonResponse({ nonsense: true })) as unknown as typeof fetch;
    expect(await fetchEdgeBundle({ ...SETTINGS, fetchImpl })).toBeNull();
  });
});

describe('fetchEdgeBundle on an unknown host', () => {
  afterEach(() => {
    resetUnknownHostWarning();
    vi.restoreAllMocks();
  });

  it('warns once per process, naming the host sent and the siteHost option', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchImpl = (async () => jsonResponse({ error: 'unknown host' }, 404)) as unknown as typeof fetch;

    expect(await fetchEdgeBundle({ ...SETTINGS, siteHost: 'Upstream.Internal:8080', fetchImpl })).toBeNull();
    expect(await fetchEdgeBundle({ ...SETTINGS, siteHost: 'other.internal', fetchImpl })).toBeNull();

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('"upstream.internal"');
    expect(message).toContain('siteHost');
    expect(message).toContain('ADSENTINEL_SITE_HOST');
  });

  it('does not warn on another 404 or on a 403', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const notFound = (async () => new Response('not found', { status: 404 })) as unknown as typeof fetch;
    const forbidden = (async () => jsonResponse({ error: 'unauthorized' }, 403)) as unknown as typeof fetch;

    expect(await fetchEdgeBundle({ ...SETTINGS, fetchImpl: notFound })).toBeNull();
    expect(await fetchEdgeBundle({ ...SETTINGS, fetchImpl: forbidden })).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
