/**
 * The `adsentinel()` Vite plugin, driven with a FAKE fetch so the suite needs
 * no network:
 *   - injects the tags into `<head>` when the bundle is active and carries tags,
 *   - returns the html unchanged when the bundle is null / inactive / has no tags,
 *   - never throws and never fails the build when the fetch itself rejects.
 *
 * The `transformIndexHtml` handler is invoked directly (as Vite would, minus the
 * plugin-context `this`) to assert its returned HTML.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { adsentinel } from './plugin.js';
import type { EdgeBundle } from '@adsentinel/plugin-core';

const HTML = '<!doctype html><html><head><title>Hi</title></head><body>x</body></html>';
const TAGS = '<script src="https://page-kit.io/a.js"></script><script src="https://page-kit.io/b.js"></script>';

/** A complete bundle; individual tests override `active`/`tags`. */
function bundle(overrides: Partial<EdgeBundle> = {}): EdgeBundle {
  return {
    host: 'example.com',
    active: true,
    generation: 7,
    mode: 'first-party',
    origin: 'https://example.com',
    servingHost: 'page-kit.io',
    routePrefixes: [],
    ownPaths: [],
    tagId: 'tag-1',
    markerPrefix: 'as',
    tags: TAGS,
    ttlSeconds: 300,
    ...overrides,
  };
}

/** A fake `fetch` that returns a JSON `Response` of the given bundle (or a non-ok status). */
function fetchReturning(body: unknown, ok = true): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: ok ? 200 : 500,
      headers: { 'content-type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

/** Reach the plugin's `transformIndexHtml` handler, whatever the object form. */
function runTransform(fetchImpl: typeof fetch, html = HTML): Promise<string> {
  const plugin = adsentinel({ apiId: 'id', apiKey: 'key', siteHost: 'example.com', fetchImpl });
  const transform = plugin.transformIndexHtml;
  if (typeof transform !== 'object' || transform === null || typeof transform.handler !== 'function') {
    throw new Error('expected transformIndexHtml in object form with a handler');
  }
  // Vite calls the handler with (html, ctx); the plugin ignores ctx.
  return transform.handler.call(undefined as never, html, {} as never) as Promise<string>;
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warnSpy.mockRestore();
  vi.restoreAllMocks();
});

describe('adsentinel() Vite plugin', () => {
  it('declares an idiomatic plugin with a pre-ordered transformIndexHtml', () => {
    const plugin = adsentinel({ apiId: 'id', apiKey: 'key', siteHost: 'example.com' });
    expect(plugin.name).toBe('adsentinel');
    expect(plugin.transformIndexHtml).toMatchObject({ order: 'pre' });
  });

  it('injects the tags into <head> when the bundle is active and carries tags', async () => {
    const out = await runTransform(fetchReturning(bundle()));
    expect(out).toBe(
      `<!doctype html><html><head>${TAGS}<title>Hi</title></head><body>x</body></html>`,
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns the html unchanged when the bundle is inactive', async () => {
    const out = await runTransform(fetchReturning(bundle({ active: false })));
    expect(out).toBe(HTML);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('returns the html unchanged when the bundle carries no tags', async () => {
    const out = await runTransform(fetchReturning(bundle({ tags: '' })));
    expect(out).toBe(HTML);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('returns the html unchanged when the bundle is null (bad body)', async () => {
    const out = await runTransform(fetchReturning({ not: 'a bundle' }));
    expect(out).toBe(HTML);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('returns the html unchanged when the control responds non-ok', async () => {
    const out = await runTransform(fetchReturning(bundle(), false));
    expect(out).toBe(HTML);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('never throws and returns the html unchanged when the fetch rejects', async () => {
    const rejectingFetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const out = await runTransform(rejectingFetch);
    expect(out).toBe(HTML);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('uses the default control origin and passes the host query to fetch', async () => {
    const spy = fetchReturning(bundle());
    await runTransform(spy);
    expect(spy).toHaveBeenCalledOnce();
    const url = (spy as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toBe('https://page-kit.io/plugin-support/edge-bundle?host=example.com');
  });
});
