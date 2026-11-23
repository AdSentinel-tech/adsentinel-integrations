/**
 * The Nitro server plugin the module registers (via `addServerPlugin`).
 *
 * It runs once per server instance: it reads the resolved settings from the
 * server runtime config and builds a per-host stale-while-revalidate cache
 * factory, then hooks Nitro's `render:html` to prepend the serving tags at the
 * top of `<head>` on every SSR response. The site host is derived from the
 * request, so one deployment can serve several hosts.
 *
 * Fail-open: when the credentials are absent the hook does nothing; when the
 * control API returns nothing the head is left untouched; nothing thrown here
 * reaches the render (see `injectBundleTags`).
 *
 * The imports resolve against the host app's Nitro (`nitropack/runtime`) and
 * `h3`, which Nuxt provides — they are peer dependencies, not bundled here.
 */
import { getRequestHost } from 'h3';
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime';
import { CONFIG_KEY, DEFAULT_CONTROL_ORIGIN, type ResolvedRuntimeConfig } from '../../config.js';
import { createHostBundleCaches, injectBundleTags } from '../../inject.js';

export default defineNitroPlugin((nitroApp) => {
  const runtimeConfig = useRuntimeConfig() as unknown as {
    [CONFIG_KEY]?: Partial<ResolvedRuntimeConfig>;
  };
  const settings = runtimeConfig[CONFIG_KEY] ?? {};
  const apiId = settings.apiId ?? '';
  const apiKey = settings.apiKey ?? '';

  // Not configured: leave SSR completely alone, and don't even register the hook.
  if (!apiId || !apiKey) return;

  const cacheFor = createHostBundleCaches({
    controlOrigin: settings.controlOrigin || DEFAULT_CONTROL_ORIGIN,
    apiId,
    apiKey,
  });

  nitroApp.hooks.hook('render:html', async (html, { event }) => {
    const host = getRequestHost(event);
    await injectBundleTags(html, cacheFor(host));
  });
});
