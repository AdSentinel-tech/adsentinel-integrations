/**
 * The SSR injection path: a middleware handler that prepends the current
 * serving tags to the `<head>` of every HTML response.
 *
 * The handler holds one stale-while-revalidate `BundleCache` for the site, so
 * it fetches the control API at most once per TTL and never blocks a response
 * on it after the first load. It is fail-open at every step:
 *   - a fetch failure, or a null / inactive / empty bundle, injects nothing and
 *     returns the response untouched;
 *   - a body that cannot be read returns the original response;
 *   - nothing here throws into the host app.
 *
 * Non-HTML responses (assets, JSON API routes) pass straight through.
 */
import { createBundleCache, injectTagsIntoHtml } from '@adsentinel/plugin-core';
import type { BundleCacheOptions, PluginSettings } from '@adsentinel/plugin-core';
import type { MiddlewareHandler } from 'astro';

/**
 * Build the `onRequest` handler for a site.
 *
 * `cacheOptions` is injectable (clock and store) so the TTL policy can be
 * exercised without a real timer; in production it is omitted and the cache
 * uses `Date.now` and an in-memory slot.
 */
export function createAdSentinelMiddleware(settings: PluginSettings, cacheOptions?: BundleCacheOptions): MiddlewareHandler {
  const cache = createBundleCache(settings, cacheOptions);

  return async (_context, next) => {
    const response = await next();

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) return response;

    let bundle;
    try {
      bundle = await cache.get();
    } catch {
      return response;
    }
    // Fail-open: nothing active to inject, or no tags — leave the page as is.
    if (!bundle || !bundle.active || !bundle.tags) return response;

    let html: string;
    try {
      html = await response.text();
    } catch {
      return response;
    }

    const injected = injectTagsIntoHtml(html, bundle.tags);
    const headers = new Headers(response.headers);
    // The body length changed; drop a now-wrong content-length so the runtime recomputes it.
    headers.delete('content-length');
    return new Response(injected, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
