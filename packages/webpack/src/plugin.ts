/**
 * `AdSentinelPlugin` — a Webpack plugin that bakes AdSentinel's two serving tags
 * into a site's HTML at build time.
 *
 * It fetches the site's edge bundle from the control API (via
 * `@adsentinel/plugin-core`) and injects the ready-made tags HTML into the
 * `<head>` of every emitted HTML document:
 *
 *   - when HtmlWebpackPlugin is in the build, through its `beforeEmit` hook,
 *     where the full HTML string is available (we rewrite `data.html`);
 *   - otherwise, in `compilation.hooks.processAssets`, by rewriting each emitted
 *     `*.html` asset's source.
 *
 * The fetch happens in an async hook (`tapPromise`) and is memoised so a build
 * makes at most one control-API call.
 *
 * Build-time caveat (same as the Vite plugin): a build BAKES the tags that were
 * current when it ran. Rotating the site's plugin credentials or bumping its
 * serving generation therefore requires a REBUILD to take effect — the already
 * built HTML keeps the tags it was stamped with.
 *
 * Fail-open, always: a fetch failure, or a null / inactive / empty bundle,
 * injects nothing and pushes a single compilation WARNING. Nothing this plugin
 * does ever fails the build.
 */
import { DEFAULT_CONTROL_ORIGIN, fetchEdgeBundle, injectTagsIntoHtml, type EdgeBundle, type PluginSettings } from '@adsentinel/plugin-core';
import type { Compilation, Compiler } from 'webpack';
import { findHtmlWebpackBeforeEmit } from './html-webpack-hooks.js';

/** The tap name this plugin registers its hooks under, and the prefix of its warnings. */
const PLUGIN_NAME = 'AdSentinelPlugin';

/** What a publisher passes to `new AdSentinelPlugin({ ... })`. */
export interface AdSentinelPluginOptions {
  /** The control / serving origin. Defaults to `https://page-kit.io`. */
  controlOrigin?: string;
  /** The site's plugin credentials (console -> Domain -> Serving). */
  apiId: string;
  apiKey: string;
  /** The site host the tags are fetched for. The control API requires it. */
  siteHost: string;
  /** The fetch to use; defaults to the global `fetch`. Injectable so tests need no network. */
  fetchImpl?: typeof fetch;
}

export class AdSentinelPlugin {
  private readonly settings: PluginSettings;
  /** One control-API call per plugin instance: the in-flight or resolved fetch. */
  private bundlePromise: Promise<EdgeBundle | null> | undefined;
  /** Compilations already warned, so the fail-open warning is pushed at most once each. */
  private readonly warned = new WeakSet<Compilation>();

  constructor(options: AdSentinelPluginOptions) {
    this.settings = {
      controlOrigin: options.controlOrigin ?? DEFAULT_CONTROL_ORIGIN,
      apiId: options.apiId,
      apiKey: options.apiKey,
      siteHost: options.siteHost,
      fetchImpl: options.fetchImpl,
    };
  }

  /** Webpack calls this once to register the plugin against a compiler. */
  apply(compiler: Compiler): void {
    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      const beforeEmit = findHtmlWebpackBeforeEmit(compiler, compilation);
      if (beforeEmit) {
        beforeEmit.tapPromise(PLUGIN_NAME, async (data) => {
          data.html = await this.injectInto(data.html, compilation);
          return data;
        });
        return;
      }
      this.tapEmittedHtmlAssets(compiler, compilation);
    });
  }

  /**
   * The fallback path: rewrite every emitted `*.html` asset when there is no
   * HtmlWebpackPlugin to hook.
   */
  private tapEmittedHtmlAssets(compiler: Compiler, compilation: Compilation): void {
    const { Compilation: CompilationStatic, sources } = compiler.webpack;
    compilation.hooks.processAssets.tapPromise(
      { name: PLUGIN_NAME, stage: CompilationStatic.PROCESS_ASSETS_STAGE_OPTIMIZE_INLINE },
      async () => {
        const tags = this.resolveTags(await this.ensureBundle(), compilation);
        if (!tags) return;
        for (const name of Object.keys(compilation.assets)) {
          if (!name.endsWith('.html')) continue;
          const asset = compilation.getAsset(name);
          if (!asset) continue;
          const html = asset.source.source().toString();
          const next = injectTagsIntoHtml(html, tags);
          if (next !== html) compilation.updateAsset(name, new sources.RawSource(next));
        }
      },
    );
  }

  /** The HTML with the tags injected, or the HTML unchanged when there is nothing (fail-open) to inject. */
  private async injectInto(html: string, compilation: Compilation): Promise<string> {
    try {
      const tags = this.resolveTags(await this.ensureBundle(), compilation);
      return tags ? injectTagsIntoHtml(html, tags) : html;
    } catch (error) {
      this.warnOnce(compilation, `tag injection failed (${describe(error)}); injected nothing`);
      return html;
    }
  }

  /** The bundle for this site, fetched once and reused. `fetchEdgeBundle` is already fail-open (null on any error). */
  private ensureBundle(): Promise<EdgeBundle | null> {
    return (this.bundlePromise ??= fetchEdgeBundle(this.settings));
  }

  /** The tags HTML to inject, or an empty string plus a one-time warning when the bundle is missing, inactive or empty. */
  private resolveTags(bundle: EdgeBundle | null, compilation: Compilation): string {
    if (!bundle) {
      this.warnOnce(compilation, 'could not fetch the serving bundle (network or credentials); injected nothing');
      return '';
    }
    if (!bundle.active) {
      this.warnOnce(compilation, `site ${bundle.host} is inactive; injected nothing`);
      return '';
    }
    if (!bundle.tags) {
      this.warnOnce(compilation, `the serving bundle for ${bundle.host} carried no tags; injected nothing`);
      return '';
    }
    return bundle.tags;
  }

  /** Push a compilation warning at most once per compilation. Never throws, never a build error. */
  private warnOnce(compilation: Compilation, message: string): void {
    if (this.warned.has(compilation)) return;
    this.warned.add(compilation);
    const { WebpackError } = compilation.compiler.webpack;
    compilation.warnings.push(new WebpackError(`[AdSentinel] ${message}`));
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
