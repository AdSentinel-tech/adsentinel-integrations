/**
 * The small contract shared between the build-time module and the runtime Nitro
 * plugin: the `nuxt.config` key, the runtime-config shape the module writes and
 * the plugin reads, and the default control origin.
 */

/** The `nuxt.config` / `runtimeConfig` key this module reads its settings from. */
export const CONFIG_KEY = 'adsentinel';

// The default control / serving origin lives in `@adsentinel/plugin-core` (one
// definition for every framework adapter); re-exported here so the module and
// the runtime Nitro plugin share it.
export { DEFAULT_CONTROL_ORIGIN } from '@adsentinel/plugin-core';

/** What a publisher sets, in `nuxt.config` under `adsentinel` or via module options. */
export interface ModuleOptions {
  /** The control / serving origin. Defaults to `https://page-kit.io`. */
  controlOrigin?: string;
  /** The site's plugin API id (console -> Domain -> Serving). */
  apiId?: string;
  /** The site's plugin API key (console -> Domain -> Serving). */
  apiKey?: string;
  /**
   * The site's public host, e.g. `www.example.com`. When set, it is always the
   * host the tags are asked for. Leave it unset to use the request's
   * `X-Forwarded-Host`, then `Host`. Set it when the app sits behind a reverse
   * proxy or gateway that does not forward the public host.
   */
  siteHost?: string;
}

/**
 * The resolved settings the module publishes to the server `runtimeConfig`, where
 * the Nitro plugin reads them. All fields are present (defaults applied), so the
 * plugin never has to re-apply them; `apiId`/`apiKey` may be empty when the site
 * is not configured, which the plugin treats as "do nothing".
 */
export interface ResolvedRuntimeConfig {
  controlOrigin: string;
  apiId: string;
  apiKey: string;
  /** The configured public site host, or empty to derive it from the request. */
  siteHost: string;
}
