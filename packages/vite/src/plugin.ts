/**
 * `adsentinel()` — the Vite plugin.
 *
 * It injects AdSentinel's two serving tags into the app's HTML `<head>` through
 * Vite's `transformIndexHtml` hook, which runs both while building (on the
 * emitted `index.html`) and in the dev server (on every page request). The
 * tags themselves and the control call are owned by `@adsentinel/plugin-core`;
 * this file is the thin, idiomatic Vite wrapper.
 *
 * ## Build bakes the tags — a rotation needs a rebuild
 *
 * The serving tags encode the site's current generation and serving host. When
 * the publisher rotates serving credentials or bumps the generation in the
 * console, the control API returns NEW tags. A production build runs
 * `transformIndexHtml` once and writes the result into the static `index.html`,
 * so a build freezes whatever tags were current at build time. After a rotation
 * the app must be rebuilt and redeployed to pick up the new tags — that is the
 * nature of a build-time plugin. In the dev server the hook runs on every
 * request, so a rotation is reflected on the next reload with no restart.
 *
 * ## Fail-open
 *
 * A control-plane outage, a rejected credential, an inactive site or an empty
 * bundle must never break the publisher's build or dev server. Every failure
 * path injects nothing, emits a warning and returns the HTML unchanged.
 * `fetchEdgeBundle` already swallows network/parse errors into a null result;
 * the surrounding try/catch is belt-and-suspenders so nothing here can throw
 * into Vite.
 */
import { DEFAULT_CONTROL_ORIGIN, fetchEdgeBundle, injectTagsIntoHtml } from '@adsentinel/plugin-core';
import type { PluginSettings } from '@adsentinel/plugin-core';
import type { Plugin } from 'vite';

// The control origin lives in `@adsentinel/plugin-core` (one definition for
// every framework adapter); re-exported here for the public API.
export { DEFAULT_CONTROL_ORIGIN };

// `adsentinel` is this package's entry point. It is the module's default export
// (the convention for every framework plugin's `adsentinel()` entry, as in
// `@adsentinel/astro`) and also re-exported here by name.
export { adsentinel };

/** The options a publisher passes to `adsentinel()` in their `vite.config`. */
export interface AdSentinelViteOptions {
  /** The control / serving origin. Defaults to `https://page-kit.io`. */
  controlOrigin?: string;
  /** The site's plugin API id (console -> Domain -> Serving). */
  apiId: string;
  /** The site's plugin API key (console -> Domain -> Serving). */
  apiKey: string;
  /** The host the serving tags are requested for, e.g. `example.com`. */
  siteHost: string;
  /** The fetch to use; defaults to the global `fetch`. Injectable so tests need no network. */
  fetchImpl?: typeof fetch;
}

/**
 * A single, prefixed warning channel. Never throws.
 *
 * `console.warn` rather than the hook's `this.warn`: `transformIndexHtml` is
 * invoked by Vite with a minimal plugin context as `this`, but callers (and the
 * tests) may invoke the handler without that binding, where `this.warn` would
 * itself throw and defeat the fail-open guarantee. A prefixed `console.warn` is
 * the portable, binding-free way to surface a fail-open event.
 */
function warn(message: string): void {
  console.warn(`[@adsentinel/vite] ${message}`);
}

/**
 * The AdSentinel Vite plugin.
 *
 * Add it to `plugins` in `vite.config`. On every `transformIndexHtml` it fetches
 * the site's edge bundle and, when the site is active and the bundle carries
 * tags, prepends those tags to `<head>`. Any failure is fail-open: nothing is
 * injected, a warning is logged, and the original HTML is returned unchanged.
 */
export default function adsentinel(options: AdSentinelViteOptions): Plugin {
  const settings: PluginSettings = {
    controlOrigin: options.controlOrigin ?? DEFAULT_CONTROL_ORIGIN,
    apiId: options.apiId,
    apiKey: options.apiKey,
    siteHost: options.siteHost,
    fetchImpl: options.fetchImpl,
  };

  return {
    name: 'adsentinel',
    transformIndexHtml: {
      // `pre` so the serving tags land ahead of other HTML transforms.
      order: 'pre',
      async handler(html: string): Promise<string> {
        try {
          const bundle = await fetchEdgeBundle(settings);
          if (!bundle) {
            warn('no serving bundle (fetch failed or credentials rejected); injected nothing');
            return html;
          }
          if (!bundle.active) {
            warn(`site "${settings.siteHost ?? ''}" is inactive; injected nothing`);
            return html;
          }
          if (!bundle.tags) {
            warn('serving bundle carries no tags; injected nothing');
            return html;
          }
          return injectTagsIntoHtml(html, bundle.tags);
        } catch (error) {
          // Unreachable in practice — the core fails open — but guarantees the
          // build is never broken by this plugin.
          warn(`unexpected error while injecting serving tags; injected nothing (${String(error)})`);
          return html;
        }
      },
    },
  };
}
