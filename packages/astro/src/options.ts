/**
 * The integration's public options and how they become `PluginSettings`.
 *
 * `adsentinel({ controlOrigin?, apiId, apiKey, siteHost? })` is the whole public
 * surface. `controlOrigin` defaults to the hosted serving origin. `siteHost`
 * defaults to the `ADSENTINEL_SITE_HOST` environment variable; for SSR it may be
 * left unset, the middleware then uses the request's public host.
 */
import { DEFAULT_CONTROL_ORIGIN } from '@adsentinel/plugin-core';
import type { PluginSettings } from '@adsentinel/plugin-core';

// The hosted control / serving origin lives in `@adsentinel/plugin-core` (one
// definition for every framework adapter); re-exported here for the public API.
export { DEFAULT_CONTROL_ORIGIN };

/** What a publisher passes to `adsentinel()` in their `astro.config`. */
export interface AdSentinelOptions {
  /** The control / serving origin. Defaults to {@link DEFAULT_CONTROL_ORIGIN}. */
  controlOrigin?: string;
  /** The site's plugin API id (console -> Domain -> Serving). */
  apiId: string;
  /** The site's plugin API key (console -> Domain -> Serving). */
  apiKey: string;
  /**
   * The site's public host, e.g. `www.example.com`. When set (here or with the
   * `ADSENTINEL_SITE_HOST` environment variable) it is always the host the tags
   * are asked for. A static build needs it. For SSR it may be left unset: the
   * middleware then uses the request's `X-Forwarded-Host` (first value), else
   * its `Host`. Set it when the server sits behind a reverse proxy that does not
   * forward the public host.
   */
  siteHost?: string;
}

/** Fold the public options into the `PluginSettings` the shared core consumes. */
export function resolveSettings(options: AdSentinelOptions): PluginSettings {
  return {
    controlOrigin: options.controlOrigin ?? DEFAULT_CONTROL_ORIGIN,
    apiId: options.apiId,
    apiKey: options.apiKey,
    siteHost: options.siteHost,
  };
}
