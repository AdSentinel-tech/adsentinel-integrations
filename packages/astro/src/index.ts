/**
 * `@adsentinel/astro` — the AdSentinel integration for Astro.
 *
 * `adsentinel({ controlOrigin?, apiId, apiKey, siteHost? })` returns an
 * `AstroIntegration` that injects AdSentinel's two serving tags into the
 * `<head>` of every page, by one of two paths depending on the project's
 * output:
 *
 *   - static (`output: 'static'`): after the build, the current tags are baked
 *     into every generated HTML file (`astro:build:done`). A tag rotation is
 *     picked up on the next rebuild — the usual build-time caveat.
 *   - SSR (`output: 'server'`): a middleware injects the tags per response
 *     (`addMiddleware`), fetched through a stale-while-revalidate cache, so a
 *     rotation is picked up within the bundle TTL with no rebuild.
 *
 * Both paths are fail-open (see `@adsentinel/plugin-core`): a control-plane
 * outage, a bad credential or malformed HTML injects nothing and never fails
 * the build or a response.
 */
import type { AstroIntegration } from 'astro';
import type { PluginSettings } from '@adsentinel/plugin-core';
import { resolveSettings } from './options.js';
import type { AdSentinelOptions } from './options.js';
import { injectTagsIntoStaticBuild } from './static-injection.js';

const VIRTUAL_SETTINGS_ID = 'virtual:adsentinel/settings';
// Rollup/Vite convention: a resolved virtual id is prefixed with a NUL byte.
const RESOLVED_SETTINGS_ID = '\0virtual:adsentinel/settings';

/** The minimal Vite plugin shape this integration needs — just the two id hooks. */
export interface SettingsVitePlugin {
  name: string;
  resolveId(id: string): string | undefined;
  load(id: string): string | undefined;
}

/** The settings as they can cross the bundler boundary: `fetchImpl` is a function and is dropped. */
export function serializableSettings(settings: PluginSettings): Omit<PluginSettings, 'fetchImpl'> {
  const { fetchImpl: _fetchImpl, ...rest } = settings;
  return rest;
}

/**
 * A Vite plugin that serves the site's settings to the SSR middleware entrypoint
 * as `virtual:adsentinel/settings`. The serialized value carries no `fetchImpl`,
 * so the middleware falls back to the runtime's global `fetch`.
 */
export function settingsVirtualModule(settings: PluginSettings): SettingsVitePlugin {
  const code = `export const settings = ${JSON.stringify(serializableSettings(settings))};`;
  return {
    name: 'adsentinel:settings',
    resolveId(id) {
      return id === VIRTUAL_SETTINGS_ID ? RESOLVED_SETTINGS_ID : undefined;
    },
    load(id) {
      return id === RESOLVED_SETTINGS_ID ? code : undefined;
    },
  };
}

export default function adsentinel(options: AdSentinelOptions): AstroIntegration {
  const settings = resolveSettings(options);
  let serverOutput = false;

  return {
    name: '@adsentinel/astro',
    hooks: {
      'astro:config:setup': ({ config, updateConfig, addMiddleware }) => {
        serverOutput = config.output === 'server';
        updateConfig({ vite: { plugins: [settingsVirtualModule(settings)] } });
        if (serverOutput) {
          addMiddleware({ entrypoint: '@adsentinel/astro/middleware', order: 'post' });
        }
      },
      'astro:build:done': async ({ dir, logger }) => {
        // SSR injects per response in middleware; only the static output is baked here.
        if (serverOutput) return;
        await injectTagsIntoStaticBuild({ dir, settings, logger });
      },
    },
  };
}

export { adsentinel };
export { DEFAULT_CONTROL_ORIGIN, resolveSettings } from './options.js';
export type { AdSentinelOptions } from './options.js';
export { createAdSentinelMiddleware } from './middleware-core.js';
export { injectTagsIntoStaticBuild } from './static-injection.js';
export type { StaticInjectionLogger, StaticInjectionParams } from './static-injection.js';
