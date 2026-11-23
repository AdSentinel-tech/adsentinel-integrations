/**
 * Locating HtmlWebpackPlugin's `beforeEmit` hook without a hard dependency on
 * the plugin.
 *
 * HtmlWebpackPlugin exposes its compilation hooks through a static
 * `getHooks(compilation)` on the plugin class. Rather than `require()` the
 * module (which would make it a mandatory dependency and pin one copy), we find
 * the instance the host already registered in `compiler.options.plugins` and
 * read `getHooks` off its own constructor. That works across HtmlWebpackPlugin
 * versions and, when the host does not use it at all, simply returns null so the
 * plugin falls back to rewriting the emitted HTML asset.
 */
import type { Compilation, Compiler } from 'webpack';

/** The payload HtmlWebpackPlugin's `beforeEmit` waterfall hook carries: the full HTML string. */
export interface HtmlBeforeEmitData {
  html: string;
  outputName: string;
  plugin: unknown;
}

/** The async waterfall hook shape we tap (`AsyncSeriesWaterfallHook`). */
export interface BeforeEmitHook {
  tapPromise(name: string, fn: (data: HtmlBeforeEmitData) => Promise<HtmlBeforeEmitData>): void;
}

/** The subset of HtmlWebpackPlugin's compilation hooks this plugin uses. */
export interface HtmlWebpackHooks {
  beforeEmit?: BeforeEmitHook;
}

interface HtmlWebpackPluginConstructor {
  getHooks(compilation: Compilation): HtmlWebpackHooks;
}

function hasGetHooks(ctor: unknown): ctor is HtmlWebpackPluginConstructor {
  return (
    typeof ctor === 'function' &&
    ctor.name === 'HtmlWebpackPlugin' &&
    typeof (ctor as { getHooks?: unknown }).getHooks === 'function'
  );
}

/**
 * The `beforeEmit` hook of the HtmlWebpackPlugin the host registered, or null
 * when none is present.
 *
 * Fail-open: any error reading the plugin list or calling `getHooks` yields
 * null, so the caller takes the emitted-asset path instead of throwing.
 */
export function findHtmlWebpackBeforeEmit(compiler: Compiler, compilation: Compilation): BeforeEmitHook | null {
  try {
    const plugins = compiler.options.plugins ?? [];
    for (const plugin of plugins) {
      const ctor = (plugin as { constructor?: unknown } | null)?.constructor;
      if (!hasGetHooks(ctor)) continue;
      const hooks = ctor.getHooks(compilation);
      if (hooks && hooks.beforeEmit) return hooks.beforeEmit;
    }
  } catch {
    // Fail-open: treat a surprising plugin list as "no HtmlWebpackPlugin".
  }
  return null;
}
