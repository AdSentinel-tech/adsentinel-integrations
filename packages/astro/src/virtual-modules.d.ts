/**
 * The virtual module the integration's Vite plugin serves to the middleware
 * entrypoint. Declared here so the entrypoint type-checks; its runtime value is
 * produced by `settingsVirtualModule` in `index.ts`.
 */
declare module 'virtual:adsentinel/settings' {
  import type { PluginSettings } from '@adsentinel/plugin-core';
  /** The site's resolved settings, serialized into the build by the integration. */
  export const settings: PluginSettings;
}
