/**
 * The publisher edge, exercised without the
 * Workers runtime: path matching, the relayed request and its signed visitor
 * headers, the bundle cache (fresh, stale, fail-open), the HTML injection
 * through a minimal rewriter, and the whole handler's branches.
 */
import { describe, it, expect } from 'vitest';
import { API_ID_HEADER, API_KEY_HEADER, EDGE_HEADERS, buildRelayRequest, handleEdgeRequest, injectTags, isOurPath, loadBundle, originRequest, signEdge } from './edge.js';
import type { EdgeBundle, EdgeSettings, HtmlRewriterLike } from './edge.js';

const SETTINGS: EdgeSettings = { controlOrigin: 'https://page-kit.io', apiId: 'as_id', apiKey: 'the-key' };
const BUNDLE: EdgeBundle = {
  host: 'pub.example', active: true, generation: 3, mode: 'first-party', origin: 'https://www.pub.example', servingHost: 'page-kit.io',
  routePrefixes: ['qvarcts', 'vuqo'], ownPaths: ['/sdk.js', '/script/', '/l/', '/report'], tagId: 'Abc1234', markerPrefix: 'as', tags: '<script id="Abc1234"></script>\n<script>x</script>\n', ttlSeconds: 300,
};

function fakeCache(): Cache & { store: Map<string, Response> } {
  const store = new Map<string, Response>();
  return {
    store,
    match: async (key: RequestInfo | URL) => { const r = store.get(String(key)); return r ? r.clone() : undefined; },
    put: async (key: RequestInfo | URL, res: Response) => { store.set(String(key), res); },
  } as unknown as Cache & { store: Map<string, Response> };
}

function fakeRewriter(): () => HtmlRewriterLike {
  return () => {
    let handler: { element(e: { prepend(c: string, o?: { html?: boolean }): void }): void } | null = null;
    const api: HtmlRewriterLike = {
      on(_selector, handlers) { handler = handlers; return api; },
      transform(response) {
        let prepended = '';
        handler?.element({ prepend(content) { prepended = content; } });
        return new Response(prepended + '<head></head>', { headers: response.headers });
      },
    };
    return api;
  };
}

describe('isOurPath', () => {
  it('route prefix as the first segment, own paths by prefix or exact match', () => {
    expect(isOurPath('/qvarcts/abc/def/u/token', BUNDLE)).toBe(true);
    expect(isOurPath('/vuqo/x', BUNDLE)).toBe(true);
    expect(isOurPath('/sdk.js', BUNDLE)).toBe(true);
    expect(isOurPath('/script/www.pub.example.js', BUNDLE)).toBe(true);
    expect(isOurPath('/l/abc', BUNDLE)).toBe(true);
    expect(isOurPath('/report', BUNDLE)).toBe(true);
    expect(isOurPath('/reportage', BUNDLE)).toBe(false);
    expect(isOurPath('/skin/qvarcts', BUNDLE)).toBe(false);
    expect(isOurPath('/', BUNDLE)).toBe(false);
    expect(isOurPath('/sdk.json', BUNDLE)).toBe(false);
  });
});

describe('buildRelayRequest', () => {
  it('keeps method, path, query, body and headers; moves to the serving host; signs the visitor', async () => {
    const request = new Request('https://www.pub.example/qvarcts/a/b?x=1', {
      method: 'POST', body: 'payload',
      headers: { 'content-type': 'text/plain', cookie: 'a=b', 'cf-connecting-ip': '203.0.113.9', 'cf-ipcountry': 'fr', host: 'www.pub.example', 'cf-ray': 'r', 'x-forwarded-for': '1.1.1.1' },
    });
    const relayed = await buildRelayRequest(request, BUNDLE, SETTINGS, 1_700_000_000_000);
    expect(relayed.url).toBe('https://page-kit.io/qvarcts/a/b?x=1');
    // A first-party bundle names the publisher's own host as servingHost: the relay still goes to the control origin, never back to the edge.
    expect((await buildRelayRequest(new Request('https://www.pub.example/sdk.js'), { servingHost: 'www.pub.example' }, SETTINGS)).url).toBe('https://page-kit.io/sdk.js');
    expect(relayed.method).toBe('POST');
    expect(await relayed.text()).toBe('payload');
    expect(relayed.headers.get('cookie')).toBe('a=b');
    expect(relayed.headers.get('content-type')).toBe('text/plain');
    expect(relayed.headers.get('cf-ray')).toBeNull();
    expect(relayed.headers.get('x-forwarded-for')).toBeNull();
    expect(relayed.headers.get(EDGE_HEADERS.host)).toBe('www.pub.example');
    expect(relayed.headers.get(EDGE_HEADERS.ip)).toBe('203.0.113.9');
    expect(relayed.headers.get(EDGE_HEADERS.country)).toBe('FR');
    expect(relayed.headers.get(EDGE_HEADERS.ts)).toBe('1700000000000');
    expect(relayed.headers.get(EDGE_HEADERS.sig)).toBe(await signEdge('the-key', { ts: '1700000000000', host: 'www.pub.example', ip: '203.0.113.9', country: 'FR' }));
    expect(relayed.redirect).toBe('manual');
  });

  it('a GET carries no body', async () => {
    const relayed = await buildRelayRequest(new Request('https://www.pub.example/sdk.js'), BUNDLE, SETTINGS);
    expect(relayed.body).toBeNull();
  });
});

describe('loadBundle', () => {
  it('fetches with the credentials, caches, then serves the cache without a subrequest', async () => {
    const cache = fakeCache();
    let calls = 0;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      expect(String(input)).toBe('https://page-kit.io/plugin-support/edge-bundle?host=www.pub.example');
      expect(new Headers(init?.headers).get(API_ID_HEADER)).toBe('as_id');
      expect(new Headers(init?.headers).get(API_KEY_HEADER)).toBe('the-key');
      return new Response(JSON.stringify(BUNDLE), { headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    expect(await loadBundle(SETTINGS, 'www.pub.example', { fetch: fetcher, cache })).toMatchObject({ generation: 3 });
    expect(await loadBundle(SETTINGS, 'www.pub.example', { fetch: fetcher, cache })).toMatchObject({ generation: 3 });
    expect(calls).toBe(1);
  });

  it('a failing control plane serves the stale copy, and nothing when there is none', async () => {
    const cache = fakeCache();
    const stale = new Response(JSON.stringify({ ...BUNDLE, cachedAt: Date.now() - 3_600_000 }));
    cache.store.set('https://page-kit.io/plugin-support/edge-bundle?host=www.pub.example', stale);
    const failing = (async () => new Response('nope', { status: 503 })) as typeof fetch;
    expect(await loadBundle(SETTINGS, 'www.pub.example', { fetch: failing, cache })).toMatchObject({ generation: 3 });
    expect(await loadBundle(SETTINGS, 'other.example', { fetch: failing, cache })).toBeNull();
    const throwing = (async () => { throw new Error('down'); }) as unknown as typeof fetch;
    expect(await loadBundle(SETTINGS, 'other.example', { fetch: throwing, cache })).toBeNull();
  });

  it('a malformed bundle is refused', async () => {
    const fetcher = (async () => new Response(JSON.stringify({ hello: 1 }))) as typeof fetch;
    expect(await loadBundle(SETTINGS, 'www.pub.example', { fetch: fetcher })).toBeNull();
  });
});

describe('injectTags', () => {
  it('prepends the tags into <head> of HTML only', async () => {
    const html = new Response('<head></head>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
    expect(await injectTags(html, BUNDLE.tags, fakeRewriter()).text()).toBe(BUNDLE.tags + '<head></head>');
    const json = new Response('{}', { headers: { 'content-type': 'application/json' } });
    expect(injectTags(json, BUNDLE.tags, fakeRewriter())).toBe(json);
    expect(injectTags(html, '', fakeRewriter())).toBe(html);
  });
});

describe('handleEdgeRequest', () => {
  function runtime(bundle: EdgeBundle | null, origin: (r: Request) => Response) {
    const seen: Request[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(String(input), init);
      seen.push(req);
      if (req.url.startsWith('https://page-kit.io/plugin-support/')) return bundle ? new Response(JSON.stringify(bundle)) : new Response('x', { status: 503 });
      if (req.url.startsWith('https://page-kit.io/')) return new Response('relayed:' + new URL(req.url).pathname, { headers: { 'x-from': 'worker' } });
      return origin(req);
    }) as typeof fetch;
    return { seen, rt: { fetch: fetcher, cache: fakeCache(), rewriter: fakeRewriter() } };
  }
  const page = () => new Response('<head></head>', { headers: { 'content-type': 'text/html' } });

  it('relays our paths to the serving host with the signed headers', async () => {
    const { seen, rt } = runtime(BUNDLE, page);
    const res = await handleEdgeRequest(new Request('https://www.pub.example/script/www.pub.example.js'), SETTINGS, rt);
    expect(await res.text()).toBe('relayed:/script/www.pub.example.js');
    expect(res.headers.get('x-from')).toBe('worker');
    const relayed = seen.find((r) => r.url === 'https://page-kit.io/script/www.pub.example.js')!;
    expect(relayed.headers.get(EDGE_HEADERS.sig)).toBeTruthy();
  });

  it('injects the tags into the origin\'s HTML pages, not into other responses', async () => {
    const { rt } = runtime(BUNDLE, page);
    expect(await (await handleEdgeRequest(new Request('https://www.pub.example/skins/1'), SETTINGS, rt)).text()).toBe(BUNDLE.tags + '<head></head>');
    const { rt: rt2 } = runtime(BUNDLE, () => new Response('img', { headers: { 'content-type': 'image/png' } }));
    expect(await (await handleEdgeRequest(new Request('https://www.pub.example/a.png'), SETTINGS, rt2)).text()).toBe('img');
  });

  it('inactive site: relays still, injects nothing', async () => {
    const { rt } = runtime({ ...BUNDLE, active: false, tags: '' }, page);
    expect(await (await handleEdgeRequest(new Request('https://www.pub.example/'), SETTINGS, rt)).text()).toBe('<head></head>');
    expect(await (await handleEdgeRequest(new Request('https://www.pub.example/sdk.js'), SETTINGS, rt)).text()).toBe('relayed:/sdk.js');
  });

  it('no bundle (control plane down, bad credentials): the site is served as if we did not exist', async () => {
    const { seen, rt } = runtime(null, page);
    const res = await handleEdgeRequest(new Request('https://www.pub.example/qvarcts/a/b'), SETTINGS, rt);
    expect(await res.text()).toBe('<head></head>');
    expect(seen.some((r) => r.url.startsWith('https://page-kit.io/qvarcts'))).toBe(false);
  });

  it('an exception anywhere passes the request through', async () => {
    const rt = { fetch: (async (input: RequestInfo | URL) => (String(input).includes('plugin-support') ? (() => { throw new Error('boom'); })() : page())) as typeof fetch };
    expect(await (await handleEdgeRequest(new Request('https://www.pub.example/'), SETTINGS, rt)).text()).toBe('<head></head>');
  });
});

describe('originRequest', () => {
  it('re-targets the path and query at the override, keeps method and headers; no override = the same request', () => {
    const request = new Request('https://www.pub.example/a/b?x=1', { headers: { cookie: 'c=d' } });
    const moved = originRequest(request, { originOverride: 'http://127.0.0.1:9000' });
    expect(moved.url).toBe('http://127.0.0.1:9000/a/b?x=1');
    expect(moved.headers.get('cookie')).toBe('c=d');
    expect(originRequest(request, {})).toBe(request);
  });
});
