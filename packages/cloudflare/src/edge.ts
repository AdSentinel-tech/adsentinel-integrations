// The publisher edge: the one artefact a publisher installs on its own Cloudflare zone.
//
// Runs as a Snippet (`snippet.ts`, settings baked at build) or a Worker (`worker.ts`, settings from env).
// It fetches the site's edge bundle from the control API (the generation, the serving host, the path
// sets, the tags) through `@adsentinel/plugin-core`, caches it in the Cloudflare `Cache` for its TTL, then:
//   - relays to the control origin every request whose path belongs to AdSentinel (a route prefix as its
//     first segment, or one of the own endpoint paths), with the visitor's host, IP and country in signed
//     `x-as-edge-*` headers the control API verifies;
//   - injects the site's tags at the start of `<head>` of every HTML page the origin answers;
//   - passes everything else through untouched.
// Fail-open everywhere: without a bundle (control API down, bad credentials) the site is served as if
// AdSentinel did not exist. A thrown exception in a Snippet is a 1101 for the visitor, so nothing here
// throws out.
import { DEFAULT_TTL_SECONDS, edgeBundleUrl, fetchEdgeBundle, isOwnPath } from '@adsentinel/plugin-core';
import type { EdgeBundle } from '@adsentinel/plugin-core';

export { API_ID_HEADER, API_KEY_HEADER, BUNDLE_PATH } from '@adsentinel/plugin-core';

export interface EdgeSettings {
  /** The control / serving origin, e.g. `https://page-kit.io`. */
  controlOrigin: string;
  /** The site's plugin credentials (console → Domain → Serving). */
  apiId: string;
  apiKey: string;
  /** The host the bundle is asked for (defaults to the request's host). */
  siteHost?: string;
  /**
   * Where pass-through requests go instead of the zone's own origin, e.g.
   * `http://127.0.0.1:9000` for a local bench or a Worker fronting an origin
   * that is not behind the zone. Unset: `fetch(request)`, the zone's origin.
   */
  originOverride?: string;
}

export type { EdgeBundle };

/** The signed visitor headers the edge adds to a relayed request; the control API verifies them with the site's api key. */
export const EDGE_HEADERS = { host: 'x-as-edge-host', ip: 'x-as-edge-ip', country: 'x-as-edge-country', ts: 'x-as-edge-ts', sig: 'x-as-edge-sig' } as const;
/** Hop-by-hop and Cloudflare-internal headers a relayed request must not carry over. */
const DROP_REQUEST_HEADERS = ['host', 'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'cf-ipcountry', 'cf-worker', 'cf-ew-via', 'x-forwarded-proto', 'x-forwarded-for', 'x-real-ip', 'content-length', 'connection', 'keep-alive', 'transfer-encoding'];

/** True when the path is ours: first segment in `routePrefixes`, or one of `ownPaths`. Same test as every adapter. */
export const isOurPath = isOwnPath;

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The visitor signature the control API verifies: HMAC-SHA256(apiKey, `ts\nhost\nip\ncountry`), base64url. */
export async function signEdge(apiKey: string, fields: { ts: string; host: string; ip: string; country: string }): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(apiKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${fields.ts}\n${fields.host}\n${fields.ip}\n${fields.country}`));
  return base64url(new Uint8Array(sig));
}

/**
 * The relayed request: same method, path, query, headers and body, on the
 * control origin (the server that answered the bundle — for a first-party
 * site `servingHost` is the publisher's own host, i.e. this edge), plus the
 * signed visitor headers.
 */
export async function buildRelayRequest(request: Request, _bundle: Pick<EdgeBundle, 'servingHost'>, settings: EdgeSettings, now: number = Date.now()): Promise<Request> {
  const url = new URL(request.url);
  const siteHost = settings.siteHost || url.host;
  const target = new URL(url.pathname + url.search, settings.controlOrigin);
  const headers = new Headers();
  request.headers.forEach((value, name) => {
    if (!DROP_REQUEST_HEADERS.includes(name.toLowerCase())) headers.set(name, value);
  });
  const ip = request.headers.get('cf-connecting-ip') || '';
  const country = ((request as { cf?: { country?: string } }).cf?.country || request.headers.get('cf-ipcountry') || '').toUpperCase();
  const ts = String(now);
  headers.set(EDGE_HEADERS.host, siteHost);
  headers.set(EDGE_HEADERS.ip, ip);
  headers.set(EDGE_HEADERS.country, country);
  headers.set(EDGE_HEADERS.ts, ts);
  headers.set(EDGE_HEADERS.sig, await signEdge(settings.apiKey, { ts, host: siteHost, ip, country }));
  const method = request.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : request.body;
  // `duplex` is what a streaming body needs in Node (tests) and is ignored where the Workers runtime does not read it.
  return new Request(target.toString(), { method, headers, body, redirect: 'manual', ...(body ? { duplex: 'half' } : {}) } as RequestInit);
}

/** A response the browser may consume as-is: the worker's headers kept, nothing hop-by-hop added. */
export function relayResponse(upstream: Response): Response {
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: upstream.headers });
}

/** Where the bundle is cached: one synthetic URL per site host, under the control origin (the bundle URL itself). */
export function bundleCacheKey(settings: EdgeSettings, siteHost: string): string {
  return edgeBundleUrl(settings.controlOrigin, siteHost);
}

export interface BundleSource {
  fetch: typeof fetch;
  cache?: Cache;
}

/**
 * The bundle for a site: the cached copy while fresh, else fetched with the
 * credentials and cached for its TTL; on any failure the stale copy if there
 * is one, else null (fail-open). One subrequest on a miss, none on a hit.
 */
export async function loadBundle(settings: EdgeSettings, siteHost: string, source: BundleSource): Promise<EdgeBundle | null> {
  const key = bundleCacheKey(settings, siteHost);
  let stale: EdgeBundle | null = null;
  try {
    const cached = await source.cache?.match(key);
    if (cached) {
      const body = (await cached.json()) as EdgeBundle & { cachedAt?: number };
      const age = Date.now() - (body.cachedAt || 0);
      if (age < (body.ttlSeconds || DEFAULT_TTL_SECONDS) * 1000) return body;
      stale = body;
    }
  } catch {
    /* a corrupt cache entry counts as a miss */
  }
  const bundle = await fetchEdgeBundle({
    controlOrigin: settings.controlOrigin,
    apiId: settings.apiId,
    apiKey: settings.apiKey,
    siteHost,
    fetchImpl: source.fetch,
  });
  // Network error, non-2xx, malformed body: `fetchEdgeBundle` returned null, serve the stale copy if any.
  if (!bundle) return stale;
  const ttl = bundle.ttlSeconds || DEFAULT_TTL_SECONDS;
  try {
    // Kept 24 h so a control-plane outage serves the last good bundle (stale), never nothing.
    const entry = new Response(JSON.stringify({ ...bundle, cachedAt: Date.now() }), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${Math.max(ttl, 86_400)}` } });
    await source.cache?.put(key, entry);
  } catch {
    /* cache full or unavailable */
  }
  return bundle;
}

/** Minimal HTMLRewriter shape, so the injection can be exercised without the runtime. */
export interface HtmlRewriterLike {
  on(selector: string, handlers: { element(element: { prepend(content: string, options?: { html?: boolean }): void }): void }): HtmlRewriterLike;
  transform(response: Response): Response;
}

/** The origin's HTML with the tags at the start of `<head>`; anything that is not an HTML document is untouched. */
export function injectTags(response: Response, tags: string, rewriter: () => HtmlRewriterLike): Response {
  if (!tags) return response;
  const type = (response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return response;
  return rewriter()
    .on('head', { element(element) { element.prepend(tags, { html: true }); } })
    .transform(response);
}

export interface EdgeRuntime {
  fetch: typeof fetch;
  cache?: Cache;
  rewriter?: () => HtmlRewriterLike;
}

/** The request as the origin should see it: the zone's own, or re-targeted at `originOverride`. */
export function originRequest(request: Request, settings: Pick<EdgeSettings, 'originOverride'>): Request {
  if (!settings.originOverride) return request;
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, settings.originOverride);
  return new Request(target.toString(), request);
}

/** The whole edge, one request in, one response out. Never throws. */
export async function handleEdgeRequest(request: Request, settings: EdgeSettings, runtime: EdgeRuntime): Promise<Response> {
  const passThrough = () => runtime.fetch(originRequest(request, settings));
  try {
    const url = new URL(request.url);
    const siteHost = settings.siteHost || url.host;
    const bundle = await loadBundle(settings, siteHost, runtime);
    if (!bundle) return passThrough();
    if (isOurPath(url.pathname, bundle)) {
      const relayed = await buildRelayRequest(request, bundle, settings);
      return relayResponse(await runtime.fetch(relayed));
    }
    const response = await passThrough();
    if (!bundle.active || !bundle.tags || request.method !== 'GET' || !runtime.rewriter) return response;
    return injectTags(response, bundle.tags, runtime.rewriter);
  } catch {
    return passThrough();
  }
}
