/**
 * The SSR middleware entrypoint, registered by the integration via
 * `addMiddleware` for `output: 'server'` projects.
 *
 * Astro loads this module (as `@adsentinel/astro/middleware`) during the build,
 * where the integration's Vite plugin provides `virtual:adsentinel/settings`.
 * The real work lives in `createAdSentinelMiddleware`; this file only wires the
 * build-time settings into it and exports the `onRequest` Astro expects.
 */
import type { MiddlewareHandler } from 'astro';
import { settings } from 'virtual:adsentinel/settings';
import { createAdSentinelMiddleware } from './middleware-core.js';

export const onRequest: MiddlewareHandler = createAdSentinelMiddleware(settings);
