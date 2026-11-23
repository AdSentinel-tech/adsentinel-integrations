/**
 * The integration's public options and how they become `PluginSettings`.
 *
 * `adsentinel({ controlOrigin?, apiId, apiKey, siteHost })` is the whole public
 * surface. Only `controlOrigin` is optional; it defaults to the hosted serving
 * origin so a publisher supplies just their site's credentials and host.
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
  /** The host the bundle is served for; the control API requires it. */
  siteHost: string;
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
