/**
 * `adsentinel()` injects the tags into an active HTML response, passes every
 * other response through byte-for-byte, keeps Content-Length honest, and never
 * throws or hangs — even when the control plane is down or the bundle is empty.
 *
 * The middleware uses the global `fetch` (through `@adsentinel/plugin-core`'s
 * cache), so the tests stub it; req/res are the smallest mocks that behave like
 * Node's objects for the surface the middleware touches (`getHeader`,
 * `setHeader`, `headersSent`, `write`, `end`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { adsentinel } from './middleware.js';

const TAGS = '<script src="/a.js"></script><script src="/b.js"></script>';
const HTML = '<!doctype html><html><head><title>Hi</title></head><body>page</body></html>';

/** A control-API bundle whose fields pass plugin-core's shape guard. */
function bundle(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    host: 'example.com',
    active: true,
    generation: 1,
    mode: 'first-party',
    origin: 'https://example.com',
    servingHost: 'example.com',
    routePrefixes: ['abc'],
    ownPaths: ['/a.js'],
    tagId: 't1',
    markerPrefix: 'as',
    tags: TAGS,
    ttlSeconds: 300,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  }) as unknown as Response;
}

/** Install a fake global fetch returning `response` for every call. */
function stubFetch(response: () => Response | Promise<Response>): ReturnType<typeof vi.fn> {
  const impl = vi.fn(async () => response());
  vi.stubGlobal('fetch', impl);
  return impl;
}

interface MockExchange {
  req: Request;
  res: Response;
  /** Resolves once the response has ended. */
  finished: Promise<void>;
  body(): Buffer;
  header(name: string): string | number | undefined;
}

/** Minimal req/res pair that records what the middleware finally writes. */
function mockExchange(host = 'example.com'): MockExchange {
  const headers: Record<string, string | number> = {};
  let out = Buffer.alloc(0);
  let sent = false;
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  function append(chunk: unknown, encoding: unknown): void {
    if (chunk == null) return;
    const buf = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as string, typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8');
    out = Buffer.concat([out, buf]);
  }

  const res = {
    get headersSent(): boolean {
      return sent;
    },
    statusCode: 200,
    getHeader(name: string): string | number | undefined {
      return headers[name.toLowerCase()];
    },
    setHeader(name: string, value: string | number): void {
      headers[name.toLowerCase()] = value;
    },
    removeHeader(name: string): void {
      delete headers[name.toLowerCase()];
    },
    write(chunk: unknown, encoding?: unknown, callback?: unknown): boolean {
      append(chunk, encoding);
      const cb = typeof encoding === 'function' ? encoding : callback;
      if (typeof cb === 'function') cb();
      return true;
    },
    end(chunk?: unknown, encoding?: unknown, callback?: unknown): unknown {
      if (typeof chunk !== 'function') append(chunk, encoding);
      sent = true;
      const cb = typeof chunk === 'function' ? chunk : typeof encoding === 'function' ? encoding : callback;
      if (typeof cb === 'function') (cb as () => void)();
      resolveFinished();
      return this;
    },
  } as unknown as Response;

  const req = { headers: { host } } as unknown as Request;
  return { req, res, finished, body: () => out, header: (name) => headers[name.toLowerCase()] };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const OPTIONS = { apiId: 'id', apiKey: 'key' };

describe('adsentinel()', () => {
  it('injects the tags into the <head> of an active HTML response', async () => {
    stubFetch(() => jsonResponse(bundle()));
    const { req, res, finished, body, header } = mockExchange();

    adsentinel(OPTIONS)(req, res, () => {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.setHeader('content-length', Buffer.byteLength(HTML));
      res.end(HTML);
    });

    await finished;
    const text = body().toString('utf8');
    expect(text).toContain(TAGS);
    // Prepended right after <head>, before existing children.
    expect(text).toBe(HTML.replace('<head>', `<head>${TAGS}`));
    // Content-Length tracks the injected body.
    expect(header('content-length')).toBe(Buffer.byteLength(body()));
    expect(header('content-length')).toBe(Buffer.byteLength(text));
  });

  it('passes a non-HTML response through untouched', async () => {
    stubFetch(() => jsonResponse(bundle()));
    const { req, res, finished, body, header } = mockExchange();
    const payload = JSON.stringify({ ok: true });

    adsentinel(OPTIONS)(req, res, () => {
      res.setHeader('content-type', 'application/json');
      res.setHeader('content-length', Buffer.byteLength(payload));
      res.end(payload);
    });

    await finished;
    expect(body().toString('utf8')).toBe(payload);
    expect(body().toString('utf8')).not.toContain(TAGS);
    expect(header('content-length')).toBe(Buffer.byteLength(payload));
  });

  it('streams a non-HTML response written in chunks without buffering or altering it', async () => {
    stubFetch(() => jsonResponse(bundle()));
    const { req, res, finished, body } = mockExchange();

    adsentinel(OPTIONS)(req, res, () => {
      res.setHeader('content-type', 'text/plain');
      res.write('part-1;');
      res.write('part-2;');
      res.end('part-3');
    });

    await finished;
    expect(body().toString('utf8')).toBe('part-1;part-2;part-3');
  });

  it('passes HTML through unchanged when the bundle is inactive', async () => {
    stubFetch(() => jsonResponse(bundle({ active: false, tags: '' })));
    const { req, res, finished, body, header } = mockExchange();

    adsentinel(OPTIONS)(req, res, () => {
      res.setHeader('content-type', 'text/html');
      res.setHeader('content-length', Buffer.byteLength(HTML));
      res.end(HTML);
    });

    await finished;
    expect(body().toString('utf8')).toBe(HTML);
    expect(header('content-length')).toBe(Buffer.byteLength(HTML));
  });

  it('passes HTML through unchanged when the bundle has empty tags', async () => {
    stubFetch(() => jsonResponse(bundle({ tags: '' })));
    const { req, res, finished, body } = mockExchange();

    adsentinel(OPTIONS)(req, res, () => {
      res.setHeader('content-type', 'text/html');
      res.end(HTML);
    });

    await finished;
    expect(body().toString('utf8')).toBe(HTML);
  });

  it('passes HTML through unchanged when the control plane is down (null bundle)', async () => {
    stubFetch(() => {
      throw new Error('control plane down');
    });
    const { req, res, finished, body } = mockExchange();

    adsentinel(OPTIONS)(req, res, () => {
      res.setHeader('content-type', 'text/html');
      res.end(HTML);
    });

    await finished;
    expect(body().toString('utf8')).toBe(HTML);
  });

  it('does not throw and forwards unchanged when the HTML has no <head>', async () => {
    stubFetch(() => jsonResponse(bundle()));
    const { req, res, finished, body } = mockExchange();
    const noHead = '<html><body>no head here</body></html>';

    expect(() =>
      adsentinel(OPTIONS)(req, res, () => {
        res.setHeader('content-type', 'text/html');
        res.end(noHead);
      }),
    ).not.toThrow();

    await finished;
    expect(body().toString('utf8')).toBe(noHead);
  });

  it('injects only once even when two instances are mounted', async () => {
    stubFetch(() => jsonResponse(bundle()));
    const { req, res, finished, body } = mockExchange();

    const first = adsentinel(OPTIONS);
    const second = adsentinel(OPTIONS);
    first(req, res, () => {
      second(req, res, () => {
        res.setHeader('content-type', 'text/html');
        res.end(HTML);
      });
    });

    await finished;
    const occurrences = body().toString('utf8').split('<script src="/a.js">').length - 1;
    expect(occurrences).toBe(1);
  });

  it('serves the same instance from its SWR cache: one fetch across requests', async () => {
    const fetchImpl = stubFetch(() => jsonResponse(bundle()));
    const middleware = adsentinel(OPTIONS);

    for (let i = 0; i < 3; i += 1) {
      const { req, res, finished } = mockExchange();
      middleware(req, res, () => {
        res.setHeader('content-type', 'text/html');
        res.end(HTML);
      });
      await finished;
    }

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
