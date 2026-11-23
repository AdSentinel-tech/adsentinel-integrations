/**
 * Minimal ambient declarations for the Nuxt 3 / Nitro 2 surface this module uses.
 *
 * Why these live here instead of installing the packages: `@nuxt/kit`, `nitropack`
 * and `h3` are declared as OPTIONAL peer dependencies — a consuming Nuxt app always
 * has them, but pulling the whole Nuxt toolchain into this workspace just to
 * type-check one adapter would re-resolve dozens of shared build dependencies
 * (rollup, postcss, babel, ...) to newer in-range versions, far beyond this
 * package's own entries. So the handful of symbols the adapter imports are declared
 * here, matching the real API documented in the Nuxt module-author guide and the
 * Nitro plugins docs. At runtime the host app's real packages provide them.
 *
 * Only the members this module actually calls are declared; this is a typing aid,
 * not a re-implementation of Nuxt's types.
 */

declare module 'h3' {
  /** Opaque request/response context Nitro hands server code. */
  export interface H3Event {
    readonly __isH3Event?: true;
  }
  /** The request host (`Host` header), optionally honouring `X-Forwarded-Host`. */
  export function getRequestHost(event: H3Event, opts?: { xForwardedHost?: boolean }): string;
}

declare module '@nuxt/kit' {
  /** The slice of the Nuxt instance a module's `setup` touches. */
  export interface Nuxt {
    options: {
      runtimeConfig: Record<string, unknown>;
    };
  }

  export interface ModuleMeta {
    name?: string;
    configKey?: string;
    compatibility?: { nuxt?: string };
  }

  export interface ModuleDefinition<TOptions> {
    meta?: ModuleMeta;
    defaults?: Partial<TOptions> | ((nuxt: Nuxt) => Partial<TOptions>);
    setup?: (options: TOptions, nuxt: Nuxt) => void | Promise<void>;
  }

  export type NuxtModule<TOptions> = (inlineOptions: TOptions, nuxt: Nuxt) => void | Promise<void>;

  export function defineNuxtModule<TOptions>(definition: ModuleDefinition<TOptions>): NuxtModule<TOptions>;

  export interface Resolver {
    resolve(...path: string[]): string;
  }
  /** Build a path resolver relative to `base` (typically `import.meta.url`). */
  export function createResolver(base: string): Resolver;

  /** Register a Nitro server plugin by its resolved path. */
  export function addServerPlugin(plugin: string): void;
}

declare module 'nitropack/runtime' {
  import type { H3Event } from 'h3';

  /**
   * The mutable HTML parts the `render:html` hook receives. Each is an array of
   * HTML strings; unshifting onto `head` places content at the top of `<head>`.
   */
  export interface NitroRenderHtmlContext {
    head: string[];
    bodyPrepend: string[];
    bodyAppend: string[];
    htmlAttrs: string[];
    bodyAttrs: string[];
  }

  export interface NitroAppHooks {
    hook(
      name: 'render:html',
      callback: (html: NitroRenderHtmlContext, context: { event: H3Event }) => void | Promise<void>,
    ): void;
    hook(name: string, callback: (...args: unknown[]) => void | Promise<void>): void;
  }

  export interface NitroApp {
    hooks: NitroAppHooks;
  }

  export type NitroAppPlugin = (nitro: NitroApp) => void;

  export function defineNitroPlugin(def: (nitro: NitroApp) => void): NitroAppPlugin;

  /** The resolved runtime config; pass `event` to allow per-request env overrides. */
  export function useRuntimeConfig(event?: H3Event): Record<string, unknown>;
}
