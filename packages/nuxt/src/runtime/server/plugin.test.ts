/**
 * The Nitro plugin's host resolution, with `h3` and `nitropack/runtime` replaced
 * by stand-ins (the Nuxt runtime is not booted). The `h3` stand-in follows h3's
 * `getRequestHost`: with `xForwardedHost` it returns the first
 * `X-Forwarded-Host` value, else the `Host` header.
 *
 * What it proves: the host sent to the edge-bundle endpoint is the configured
 * `siteHost` when set, else the forwarded host, else the plain host, normalised.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeEvent {
  node: { req: { headers: Record<string, string | undefined> } };
}
type RenderHook = (html: { head: string[] }, context: { event: FakeEvent }) => Promise<void>;

const runtime = vi.hoisted(() => ({ config: {} as Record<string, unknown> }));

vi.mock('h3', () => ({
  getRequestHost(event: FakeEvent, opts: { xForwardedHost?: boolean } = {}): string {
    const headers = event.node.req.headers;
    if (opts.xForwardedHost) {
      const forwarded = (headers['x-forwarded-host'] ?? '').split(',').shift()?.trim();
      if (forwarded) return forwarded;
    }
    return headers.host || 'localhost';
  },
}));

vi.mock('nitropack/runtime', () => ({
  defineNitroPlugin: (definition: unknown) => definition,
  useRuntimeConfig: () => runtime.config,
}));

const TAGS = '<script src="/a.js"></script>';

/** Boot the plugin with the given settings and render one page for `headers`; returns the host sent upstream. */
async function renderFor(settings: Record<string, string>, headers: Record<string, string>): Promise<string | null> {
  runtime.config = { adsentinel: { controlOrigin: 'https://page-kit.io', apiId: 'id', apiKey: 'key', siteHost: '', ...settings } };
  const seen: (string | null)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      seen.push(new URL(String(input)).searchParams.get('host'));
      return new Response(
        JSON.stringify({ host: 'example.com', active: true, routePrefixes: [], ownPaths: [], servingHost: 'x', tags: TAGS, ttlSeconds: 300 }),
        { status: 200 },
      );
    }),
  );
  vi.resetModules();
  const { default: plugin } = (await import('./plugin.js')) as unknown as {
    default: (nitro: { hooks: { hook(name: string, callback: RenderHook): void } }) => void;
  };
  let renderHook: RenderHook | undefined;
  plugin({ hooks: { hook: (_name, callback) => (renderHook = callback) } });
  const html = { head: [] as string[] };
  await renderHook?.(html, { event: { node: { req: { headers } } } });
  expect(html.head).toEqual([TAGS]);
  return seen[0] ?? null;
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Nitro plugin site host', () => {
  it('uses the plain Host header when nothing else is set', async () => {
    expect(await renderFor({}, { host: 'WWW.Example.com:3000' })).toBe('www.example.com');
  });

  it('honours X-Forwarded-Host (first value) behind a reverse proxy', async () => {
    expect(await renderFor({}, { host: 'app-upstream.internal', 'x-forwarded-host': 'www.example.com, edge.internal' })).toBe(
      'www.example.com',
    );
  });

  it('always uses the configured siteHost when set', async () => {
    expect(
      await renderFor({ siteHost: 'www.example.com' }, { host: 'app-upstream.internal', 'x-forwarded-host': 'proxy.internal' }),
    ).toBe('www.example.com');
  });

  it('uses ADSENTINEL_SITE_HOST when no siteHost is configured', async () => {
    vi.stubEnv('ADSENTINEL_SITE_HOST', 'www.example.com');
    expect(await renderFor({}, { host: 'app-upstream.internal' })).toBe('www.example.com');
  });
});
