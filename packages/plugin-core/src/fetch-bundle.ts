/**
 * The one network call this package makes: a credentialed GET of the site's
 * edge bundle from the control API.
 *
 * Runtime-agnostic: no cache, just a single fetch (the Cloudflare edge in
 * `@adsentinel/cloudflare` layers its own `Cache` on top of it). Fail-open — any error, any non-2xx, or a malformed body returns
 * null so the host app is never broken by a control-plane problem.
 */
import { API_ID_HEADER, API_KEY_HEADER, BUNDLE_PATH } from './constants.js';
import { CONTRACT_VERSION_HEADER, EDGE_BUNDLE_CONTRACT_VERSION } from './contract.js';
import { normaliseSiteHost } from './site-host.js';
import type { EdgeBundle, PluginSettings } from './types.js';
import { warnUnknownHostOnce } from './unknown-host-warning.js';

/**
 * The bundle URL for a site under a control origin, with the required `host`
 * query. The host is normalised (lowercase, no port, no trailing dot), since the
 * control API does not strip a port.
 */
export function edgeBundleUrl(controlOrigin: string, siteHost: string | undefined): string {
  const base = controlOrigin.replace(/\/+$/, '');
  const host = normaliseSiteHost(siteHost);
  if (!host) return `${base}${BUNDLE_PATH}`;
  return `${base}${BUNDLE_PATH}?host=${encodeURIComponent(host)}`;
}

/** The control API's 404 body for a host it has no site for. */
const UNKNOWN_HOST_ERROR = 'unknown host';

/** True when a 404 response carries the control API's `unknown host` error. Never throws. */
async function isUnknownHostResponse(response: Response): Promise<boolean> {
  if (response.status !== 404) return false;
  try {
    const body = (await response.json()) as { error?: unknown } | null;
    return body?.error === UNKNOWN_HOST_ERROR;
  } catch {
    return false;
  }
}

/** The parsed value has the shape every adapter relies on. Deliberately lenient: extra or newer fields are accepted. */
function isEdgeBundle(value: unknown): value is EdgeBundle {
  if (!value || typeof value !== 'object') return false;
  const bundle = value as Record<string, unknown>;
  return (
    Array.isArray(bundle.routePrefixes) &&
    Array.isArray(bundle.ownPaths) &&
    typeof bundle.servingHost === 'string' &&
    typeof bundle.tags === 'string'
  );
}

/**
 * The site's edge bundle, or null on any failure (fail-open).
 *
 * One subrequest, with the exact credential headers the control API checks,
 * plus the contract version this package speaks. A
 * network error, a non-2xx status (401/403 bad credential, 404 unknown host,
 * 5xx outage), or a body that is not a bundle all resolve to null. An
 * `unknown host` 404 also logs one warning per process naming the host sent, as
 * it usually means the server sees an internal host behind a reverse proxy.
 */
export async function fetchEdgeBundle(settings: PluginSettings): Promise<EdgeBundle | null> {
  try {
    const doFetch = settings.fetchImpl ?? fetch;
    const url = edgeBundleUrl(settings.controlOrigin, settings.siteHost);
    const response = await doFetch(url, {
      headers: {
        [API_ID_HEADER]: settings.apiId,
        [API_KEY_HEADER]: settings.apiKey,
        [CONTRACT_VERSION_HEADER]: String(EDGE_BUNDLE_CONTRACT_VERSION),
      },
    });
    if (!response.ok) {
      if (await isUnknownHostResponse(response)) warnUnknownHostOnce(normaliseSiteHost(settings.siteHost));
      return null;
    }
    const body = (await response.json()) as unknown;
    return isEdgeBundle(body) ? body : null;
  } catch {
    return null;
  }
}
