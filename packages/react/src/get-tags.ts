/**
 * Resolve a site's two serving tags to a ready-to-inject HTML string, for the
 * server side of any React framework.
 *
 * This is the framework-neutral half of the package: a plain `Promise<string>`
 * that `_document` (Pages Router), `root` (Remix), a Vike render hook, or a
 * stream post-processor can splice into the page `<head>`. The React component
 * (`AdSentinelTags`) for the App Router is layered on top of it.
 *
 * Fail-open end to end: a control-plane outage, a bad credential, an inactive
 * site or an empty bundle all resolve to the empty string, which every injector
 * treats as "inject nothing". Nothing here throws into the host render.
 */
import { fetchEdgeBundle, siteHostFromEnv } from '@adsentinel/plugin-core';
import type { EdgeBundle, PluginSettings } from '@adsentinel/plugin-core';

/**
 * The tags to inject for a given bundle, or the empty string.
 *
 * Pure and synchronous, so a caller that already holds a bundle — e.g. one from
 * `createBundleCache(settings).get()` — turns it into tags without another
 * fetch. A null bundle (fail-open) or an inactive site yields `''`.
 */
export function tagsFromBundle(bundle: EdgeBundle | null | undefined): string {
  if (!bundle || !bundle.active) return '';
  return typeof bundle.tags === 'string' ? bundle.tags : '';
}

/**
 * The site's serving tags as an HTML string, or `''` on any failure.
 *
 * One credentialed fetch of the edge bundle, then {@link tagsFromBundle}. For a
 * page served on every request, back this with `createBundleCache` from
 * `@adsentinel/plugin-core` and feed `cache.get()` to `tagsFromBundle` instead,
 * so the control API is hit at most once per TTL rather than once per render.
 *
 * `settings.siteHost` must be the site's PUBLIC host. When it is unset, the
 * `ADSENTINEL_SITE_HOST` environment variable is used. To derive it from the
 * request instead (honouring `X-Forwarded-Host` behind a reverse proxy), pass
 * `siteHostFromHeaders(requestHeaders)`.
 */
export async function getAdSentinelTags(settings: PluginSettings): Promise<string> {
  try {
    const bundle = await fetchEdgeBundle({ ...settings, siteHost: settings.siteHost || siteHostFromEnv() });
    return tagsFromBundle(bundle);
  } catch {
    // `fetchEdgeBundle` is already fail-open, but a resolver must never let an
    // unexpected throw (e.g. a misconfigured `fetchImpl`) reach the host render.
    return '';
  }
}
