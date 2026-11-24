/**
 * The framework-agnostic heart of the Nuxt module: turn a resolved bundle into a
 * `<head>` mutation, and keep one stale-while-revalidate cache per site host.
 *
 * This file imports nothing from Nuxt or Nitro so it can be unit-tested with a
 * fake `fetch` and a plain object in place of Nitro's render context. The module
 * (`module.ts`) and the Nitro server plugin (`runtime/server/plugin.ts`) are the
 * thin framework shells around it.
 *
 * Fail-open everywhere: a null, inactive or empty bundle injects nothing, and any
 * error while reaching the cache is swallowed so SSR is never broken.
 */
import { createHostBundleCaches, resolveSiteHost } from '@adsentinel/plugin-core';
import type { BundleCache, SiteCredentials } from '@adsentinel/plugin-core';

// The per-host cache factory lives in `@adsentinel/plugin-core`; re-exported so
// the Nitro plugin and the tests use one definition.
export { createHostBundleCaches };
export type { SiteCredentials };

/**
 * The slice of Nitro's `render:html` context this module touches: `head` is the
 * array of HTML strings rendered inside `<head>`, in order. Unshifting places the
 * serving tags before any existing head children — the top of `<head>`.
 */
export interface RenderHead {
  head: string[];
}

/**
 * The host to ask the bundle for: the configured `siteHost` (module option,
 * `NUXT_ADSENTINEL_SITE_HOST`, or `ADSENTINEL_SITE_HOST`) when set, else the
 * request host as h3 reports it with `X-Forwarded-Host` honoured. Normalised.
 */
export function siteHostForRequest(configuredSiteHost: string | undefined, requestHost: string | undefined): string | undefined {
  return resolveSiteHost({ siteHost: configuredSiteHost, host: requestHost });
}

/**
 * Prepend the serving tags at the top of `<head>`.
 *
 * Fail-open: a null or inactive bundle, empty tags, or any error reaching the
 * cache leaves `head` untouched and never throws into the render.
 */
export async function injectBundleTags(renderHead: RenderHead, cache: BundleCache): Promise<void> {
  try {
    const bundle = await cache.get();
    if (!bundle || !bundle.active || !bundle.tags) return;
    renderHead.head.unshift(bundle.tags);
  } catch {
    // Never break SSR over a control-plane problem.
  }
}
