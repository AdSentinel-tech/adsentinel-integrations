/**
 * `createAdSentinelMiddleware` injects the serving tags into an HTML response
 * when the bundle is active, and is a no-op — never throwing — when the bundle
 * is null, inactive or empty, or when the response is not HTML.
 */
import { describe, it, expect, vi } from 'vitest';
import type { APIContext, MiddlewareNext } from 'astro';
import { createAdSentinelMiddleware } from './middleware-core.js';
import type { EdgeBundle, PluginSettings } from '@adsentinel/plugin-core';

const TAGS = '<script data-adsentinel="loader"></script>';

function bundle(overrides: Partial<EdgeBundle> = {}): EdgeBundle {
  return {
    host: 'example.com',
    active: true,
    generation: 1,
    mode: 'first-party',
    origin: 'https://example.com',
    servingHost: 'example.com',
    routePrefixes: ['abc'],
    ownPaths: ['/sdk.js'],
    tagId: 'tag',
    markerPrefix: 'as',
    tags: TAGS,
    ttlSeconds: 300,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A `fetchImpl` that answers the edge-bundle request with `body`. */
function fetchReturning(body: unknown): typeof fetch {
  return vi.fn(async () => jsonResponse(body)) as unknown as typeof fetch;
}

function settingsWith(fetchImpl: typeof fetch): PluginSettings {
  return { controlOrigin: 'https://page-kit.io', apiId: 'id', apiKey: 'key', siteHost: 'example.com', fetchImpl };
}

const CONTEXT = {} as unknown as APIContext;

/** A `next` that yields an HTML page with a `<head>`. */
function htmlNext(html = '<html><head><title>Hi</title></head><body>x</body></html>'): MiddlewareNext {
  return (async () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })) as MiddlewareNext;
}

async function run(settings: PluginSettings, next: MiddlewareNext): Promise<Response> {
  const handler = createAdSentinelMiddleware(settings);
  return (await handler(CONTEXT, next)) as Response;
}

describe('createAdSentinelMiddleware', () => {
  it('injects the tags right after <head> when the bundle is active', async () => {
    const response = await run(settingsWith(fetchReturning(bundle())), htmlNext());
    const body = await response.text();
    expect(body).toBe(`<html><head>${TAGS}<title>Hi</title></head><body>x</body></html>`);
    // The now-wrong content-length is dropped so the runtime recomputes it.
    expect(response.headers.get('content-length')).toBeNull();
  });

  it('is a no-op when the bundle is inactive', async () => {
    const response = await run(settingsWith(fetchReturning(bundle({ active: false }))), htmlNext());
    expect(await response.text()).toBe('<html><head><title>Hi</title></head><body>x</body></html>');
  });

  it('is a no-op when the bundle has empty tags', async () => {
    const response = await run(settingsWith(fetchReturning(bundle({ tags: '' }))), htmlNext());
    expect(await response.text()).toBe('<html><head><title>Hi</title></head><body>x</body></html>');
  });

  it('is a no-op when the bundle is null (a malformed body)', async () => {
    const response = await run(settingsWith(fetchReturning({ not: 'a bundle' })), htmlNext());
    expect(await response.text()).toBe('<html><head><title>Hi</title></head><body>x</body></html>');
  });

  it('is a no-op, never throwing, when the fetch itself fails', async () => {
    const failing = (async () => {
      throw new Error('control plane down');
    }) as unknown as typeof fetch;
    const response = await run(settingsWith(failing), htmlNext());
    expect(await response.text()).toBe('<html><head><title>Hi</title></head><body>x</body></html>');
  });

  it('passes a non-HTML response straight through without fetching', async () => {
    const fetchImpl = fetchReturning(bundle());
    const next = (async () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } })) as MiddlewareNext;
    const response = await run(settingsWith(fetchImpl), next);
    expect(await response.text()).toBe('{"ok":true}');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('leaves a page with no <head> unchanged even when active', async () => {
    const response = await run(settingsWith(fetchReturning(bundle())), htmlNext('<html><body>no head</body></html>'));
    expect(await response.text()).toBe('<html><body>no head</body></html>');
  });
});
