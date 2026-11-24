/**
 * Which host a server-side adapter asks the edge bundle for.
 *
 * The control API looks a site up by the `host` query of
 * `GET /plugin-support/edge-bundle`. It lowercases that host, drops a leading
 * `www.` and a trailing dot, but it does NOT strip a port, so `example.com:3000`
 * is an unknown host. The host sent must therefore be the site's PUBLIC host,
 * without a port.
 *
 * Behind a reverse proxy, a CDN or an API gateway, the `Host` header the app
 * server receives is often the proxy's upstream host, not the public one. The
 * resolution order is:
 *   1. an explicit `siteHost` (adapter option, or the `ADSENTINEL_SITE_HOST`
 *      environment variable), always used when set;
 *   2. the first value of `X-Forwarded-Host`, when present;
 *   3. the `Host` header.
 * Every candidate is normalised the same way (see {@link normaliseSiteHost}).
 */

/** The environment variable a deployment can set to pin the public site host. */
export const SITE_HOST_ENV = 'ADSENTINEL_SITE_HOST';

/**
 * A host value as the edge-bundle endpoint expects it, or undefined when empty.
 *
 * Accepts a raw header value: the first entry of a comma-separated list is kept
 * (proxies append to `X-Forwarded-Host`), a scheme or path is dropped if someone
 * passed a URL, then the host is lowercased and its port and trailing dot are
 * removed. A leading `www.` is kept: the control API drops it itself.
 */
export function normaliseSiteHost(raw: string | readonly string[] | null | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return undefined;
  let host = value.split(',')[0].trim().toLowerCase();
  // Tolerate a full URL (`https://www.example.com/`) in a configured value.
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  host = host.split(/[/?#]/)[0];
  // Drop userinfo, if any.
  host = host.slice(host.lastIndexOf('@') + 1);
  if (host.startsWith('[')) {
    // IPv6 literal: `[::1]:3000` -> `[::1]`.
    const end = host.indexOf(']');
    host = end === -1 ? host : host.slice(0, end + 1);
  } else {
    host = host.replace(/:\d*$/, '');
  }
  host = host.replace(/\.+$/, '');
  return host.length > 0 ? host : undefined;
}

/** The `ADSENTINEL_SITE_HOST` environment variable, normalised, when the runtime has a `process.env`. */
export function siteHostFromEnv(): string | undefined {
  try {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    return normaliseSiteHost(env?.[SITE_HOST_ENV]);
  } catch {
    return undefined;
  }
}

/** The request host candidates, in priority order. */
export interface SiteHostSources {
  /** The explicitly configured public host. Always wins when set. */
  siteHost?: string | null;
  /** The raw `X-Forwarded-Host` header value. */
  forwardedHost?: string | readonly string[] | null;
  /** The raw `Host` header value. */
  host?: string | readonly string[] | null;
}

/** The host to send to the edge-bundle endpoint: explicit `siteHost`, else `X-Forwarded-Host`, else `Host`. */
export function resolveSiteHost(sources: SiteHostSources): string | undefined {
  return normaliseSiteHost(sources.siteHost) ?? normaliseSiteHost(sources.forwardedHost) ?? normaliseSiteHost(sources.host);
}

/** Request headers as either the Fetch API or Node's `IncomingHttpHeaders` hold them. */
export type HeaderSource =
  | { get(name: string): string | null }
  | Readonly<Record<string, string | readonly string[] | undefined>>;

function headerValue(headers: HeaderSource, name: string): string | readonly string[] | undefined {
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get(name: string): string | null }).get(name) ?? undefined;
  }
  return (headers as Readonly<Record<string, string | readonly string[] | undefined>>)[name];
}

/**
 * The site host for a request: `siteHost` (or the `ADSENTINEL_SITE_HOST`
 * environment variable) when set, else the first `X-Forwarded-Host`, else `Host`.
 *
 * `headers` is a Fetch `Headers` or a Node headers object (lowercase keys).
 */
export function siteHostFromHeaders(headers: HeaderSource | null | undefined, siteHost?: string | null): string | undefined {
  const explicit = normaliseSiteHost(siteHost) ?? siteHostFromEnv();
  if (explicit) return explicit;
  if (!headers) return undefined;
  return resolveSiteHost({ forwardedHost: headerValue(headers, 'x-forwarded-host'), host: headerValue(headers, 'host') });
}
