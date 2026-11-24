/**
 * `@adsentinel/nuxt` — the AdSentinel Nuxt 3 module.
 *
 * It does one thing: inject the two AdSentinel serving tags at the top of the
 * SSR `<head>`, server-side, on every rendered page. The work of fetching the
 * tags from the control API and caching them is `@adsentinel/plugin-core`; this
 * module is the idiomatic Nuxt shell around it.
 *
 * Mechanism (grounded in the Nuxt module-author guide and Nitro docs):
 *   - the settings (`controlOrigin`, `apiId`, `apiKey`, `siteHost`) are read from
 *     `nuxt.config` under the `adsentinel` key, or from `runtimeConfig.adsentinel`
 *     / `NUXT_ADSENTINEL_*` env vars;
 *   - they are published to the SERVER runtime config (never the public one — the
 *     api key must not reach the client);
 *   - a Nitro server plugin (`runtime/server/plugin.ts`) is registered; it hooks
 *     `render:html` and prepends the tags into `<head>`, for the configured
 *     `siteHost` or else the request's public host (`X-Forwarded-Host`, then
 *     `Host`).
 *
 * Fail-open: when the site is not configured, or the control API returns nothing,
 * the module injects nothing and never breaks SSR.
 */
import { addServerPlugin, createResolver, defineNuxtModule } from '@nuxt/kit';
import { CONFIG_KEY, DEFAULT_CONTROL_ORIGIN, type ModuleOptions, type ResolvedRuntimeConfig } from './config.js';

export type { ModuleOptions } from './config.js';

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@adsentinel/nuxt',
    configKey: CONFIG_KEY,
    compatibility: { nuxt: '>=3.0.0' },
  },
  defaults: {
    controlOrigin: DEFAULT_CONTROL_ORIGIN,
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);

    // Publish the resolved settings to the SERVER runtime config, so a deployment
    // can override the credentials with NUXT_ADSENTINEL_API_ID / _API_KEY /
    // _CONTROL_ORIGIN / _SITE_HOST without rebuilding. `runtimeConfig.adsentinel` wins over the
    // module options when present, matching Nuxt's precedence for runtime config.
    const serverConfig = nuxt.options.runtimeConfig as unknown as {
      [CONFIG_KEY]?: Partial<ResolvedRuntimeConfig>;
    };
    const fromRuntime = serverConfig[CONFIG_KEY] ?? {};
    serverConfig[CONFIG_KEY] = {
      controlOrigin: fromRuntime.controlOrigin || options.controlOrigin || DEFAULT_CONTROL_ORIGIN,
      apiId: fromRuntime.apiId || options.apiId || '',
      apiKey: fromRuntime.apiKey || options.apiKey || '',
      siteHost: fromRuntime.siteHost || options.siteHost || '',
    };

    addServerPlugin(resolver.resolve('./runtime/server/plugin'));
  },
});
