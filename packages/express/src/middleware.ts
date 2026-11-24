/**
 * `adsentinel()` — an Express (and Connect-compatible) middleware that injects
 * AdSentinel's two serving tags into the `<head>` of HTML responses.
 *
 * It is the framework adapter for `@adsentinel/plugin-core`: the control-API
 * fetch, the stale-while-revalidate cache and the string head-injection all
 * live there, runtime-agnostic. This file is the Express-specific glue —
 * buffering the response body by wrapping `res.write`/`res.end`, deciding by
 * `Content-Type`, and flushing.
 *
 * Shape of the integration:
 *   - One SWR bundle cache per middleware instance, so the control API is hit at
 *     most once per TTL (per `Host`), never on the request's critical path after
 *     warm-up.
 *   - `siteHost` is the configured public host (the `siteHost` option, else the
 *     `ADSENTINEL_SITE_HOST` environment variable) when set; otherwise the first
 *     `X-Forwarded-Host` value, else the `Host` header, normalised.
 *   - Only `text/html` responses are rewritten: the tags are prepended to
 *     `<head>` via `injectTagsIntoHtml`. Every other response (JSON, assets,
 *     redirects, streams such as SSE) is passed through untouched and un-buffered.
 *   - Fail-open, always: any error, a null/inactive bundle or empty tags forward
 *     the ORIGINAL response unchanged. The middleware never throws into the host
 *     app, never hangs it, preserves status and headers, corrects `Content-Length`
 *     after injection, and never injects twice.
 */
import {
  createHostBundleCaches,
  DEFAULT_CONTROL_ORIGIN,
  injectTagsIntoHtml,
  normaliseSiteHost,
  siteHostFromEnv,
  siteHostFromHeaders,
} from '@adsentinel/plugin-core';
import type { SiteCredentials } from '@adsentinel/plugin-core';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

// The control / serving origin lives in `@adsentinel/plugin-core` (one
// definition for every framework adapter); re-exported here for the public API.
export { DEFAULT_CONTROL_ORIGIN };

// `adsentinel` is this package's entry point. It is the module's default export
// (the convention for every framework plugin's `adsentinel()` entry, as in
// `@adsentinel/astro`) and also re-exported here by name.
export { adsentinel };

/** What a publisher passes to mount the middleware. */
export interface AdsentinelOptions {
  /** The control / serving origin. Defaults to {@link DEFAULT_CONTROL_ORIGIN}. */
  controlOrigin?: string;
  /** The site's plugin credentials (console -> Domain -> Serving). */
  apiId: string;
  apiKey: string;
  /**
   * The site's public host, e.g. `www.example.com`. When set (here or with the
   * `ADSENTINEL_SITE_HOST` environment variable) it is always the host the tags
   * are asked for. Otherwise the request's `X-Forwarded-Host` (first value) is
   * used, then its `Host`. Set it when the app sits behind a reverse proxy that
   * does not forward the public host.
   */
  siteHost?: string;
}

/**
 * Marks a response this middleware has already taken over, so two mounted
 * instances (or a re-entrant mount) wrap the body once and never inject twice.
 */
const APPLIED = Symbol.for('adsentinel.express.applied');

/** True only when the response's declared type is HTML; absent type is treated as non-HTML (fail-open). */
function isHtmlResponse(res: Response): boolean {
  const contentType = res.getHeader('content-type');
  if (typeof contentType !== 'string') return false;
  return contentType.toLowerCase().includes('text/html');
}

/** The public site host of a request: the configured one, else `X-Forwarded-Host`, else `Host`. */
function siteHostOf(req: Request, configuredSiteHost: string | undefined): string | undefined {
  return siteHostFromHeaders(req.headers, configuredSiteHost);
}

/** Normalize a write/end chunk to a Buffer, or null when it cannot be represented. */
function toBuffer(chunk: unknown, encoding: BufferEncoding | undefined): Buffer | null {
  if (chunk == null) return null;
  if (Buffer.isBuffer(chunk)) return chunk;
  if (typeof chunk === 'string') return Buffer.from(chunk, encoding ?? 'utf8');
  try {
    return Buffer.from(chunk as Uint8Array);
  } catch {
    return null;
  }
}

/** Loose shape of the arguments Node's `write`/`end` accept, parsed into named parts. */
interface ChunkArgs {
  chunk?: unknown;
  encoding?: BufferEncoding;
  callback?: () => void;
}

/** Parse `(chunk?, encoding?|cb?, cb?)` as Node's `write`/`end` overloads allow. */
function parseChunkArgs(args: unknown[]): ChunkArgs {
  const [first, second, third] = args;
  if (typeof first === 'function') {
    return { callback: first as () => void };
  }
  if (typeof second === 'function') {
    return { chunk: first, callback: second as () => void };
  }
  return {
    chunk: first,
    encoding: typeof second === 'string' ? (second as BufferEncoding) : undefined,
    callback: typeof third === 'function' ? (third as () => void) : undefined,
  };
}

/**
 * Build the Express/Connect middleware.
 *
 * @example
 *   import { adsentinel } from '@adsentinel/express';
 *   app.use(adsentinel({ apiId: process.env.ADSENTINEL_API_ID!, apiKey: process.env.ADSENTINEL_API_KEY! }));
 */
export default function adsentinel(options: AdsentinelOptions): RequestHandler {
  const settings: SiteCredentials = {
    controlOrigin: options.controlOrigin || DEFAULT_CONTROL_ORIGIN,
    apiId: options.apiId,
    apiKey: options.apiKey,
  };
  const configuredSiteHost = normaliseSiteHost(options.siteHost) ?? siteHostFromEnv();

  // One cache per middleware instance (SWR). A single mounted middleware may
  // front more than one host (virtual hosts), and a bundle is per-host, so the
  // per-instance cache is keyed by the resolved site host; each key still
  // fetches at most once per TTL.
  const cacheFor = createHostBundleCaches(settings);

  return function adsentinelMiddleware(req: Request, res: Response, next: NextFunction): void {
    const tagged = res as Response & { [APPLIED]?: boolean };
    // Already taken over, or the response is past the point we could rewrite it:
    // step aside and let the app run normally.
    if (tagged[APPLIED] || res.headersSent) {
      next();
      return;
    }
    tagged[APPLIED] = true;

    let tagsPromise: Promise<string>;
    try {
      // Kick the bundle fetch off now so it is warm by the time the body ends.
      // The cache is fail-open; this `.then` can only resolve to a tags string.
      tagsPromise = cacheFor(siteHostOf(req, configuredSiteHost))
        .get()
        .then(
          (bundle) => (bundle && bundle.active && bundle.tags ? bundle.tags : ''),
          () => '',
        );
    } catch {
      tagsPromise = Promise.resolve('');
    }

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);

    // `intercepting` is true while we buffer awaiting the content-type verdict;
    // once we release (non-HTML) or finalize (HTML), the originals are restored.
    let intercepting = true;
    const chunks: Buffer[] = [];

    /** Give up interception: restore the originals and flush what we buffered, unchanged. */
    function release(): void {
      intercepting = false;
      res.write = originalWrite;
      res.end = originalEnd;
      if (chunks.length > 0) {
        const buffered = Buffer.concat(chunks);
        chunks.length = 0;
        originalWrite(buffered);
      }
    }

    const writeOverride = function (this: Response, ...args: unknown[]): boolean {
      if (!intercepting) return originalWrite(...(args as Parameters<typeof originalWrite>));
      // The moment we can see a non-HTML type, stop buffering and stream the
      // rest through untouched — this is what keeps SSE and large assets from
      // being held in memory or hung.
      if (!isHtmlResponse(res)) {
        release();
        return originalWrite(...(args as Parameters<typeof originalWrite>));
      }
      const { chunk, encoding, callback } = parseChunkArgs(args);
      const buffered = toBuffer(chunk, encoding);
      if (buffered) chunks.push(buffered);
      if (callback) callback();
      return true;
    };

    const endOverride = function (this: Response, ...args: unknown[]): Response {
      if (!intercepting) return originalEnd(...(args as Parameters<typeof originalEnd>)) as unknown as Response;
      const { chunk, encoding, callback } = parseChunkArgs(args);
      const finalChunk = toBuffer(chunk, encoding);
      if (finalChunk) chunks.push(finalChunk);

      // Non-HTML: flush the buffered bytes unchanged and close.
      if (!isHtmlResponse(res)) {
        intercepting = false;
        res.write = originalWrite;
        res.end = originalEnd;
        const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
        chunks.length = 0;
        originalEnd(body as never, callback as never);
        return res;
      }

      // HTML: hold the end until the bundle resolves, inject, then flush.
      intercepting = false;
      const original = chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0);
      chunks.length = 0;
      tagsPromise.then(
        (tags) => flushHtml(original, tags, callback),
        () => flushHtml(original, '', callback),
      );
      return res;
    };

    /** Inject (when there are tags), correct Content-Length, restore originals and end. */
    function flushHtml(original: Buffer, tags: string, callback: (() => void) | undefined): void {
      let out = original;
      try {
        if (tags) {
          const html = original.toString('utf8');
          const injected = injectTagsIntoHtml(html, tags);
          if (injected !== html) {
            out = Buffer.from(injected, 'utf8');
            // We never flushed while buffering, so headers are still open: keep
            // Content-Length honest. Only touch it when it was already set, so a
            // chunked response stays chunked.
            if (!res.headersSent && res.getHeader('content-length') != null) {
              res.setHeader('content-length', Buffer.byteLength(out));
            }
          }
        }
      } catch {
        // Any failure forwards the original bytes unchanged.
        out = original;
      }
      res.write = originalWrite;
      res.end = originalEnd;
      originalEnd(out as never, callback as never);
    }

    res.write = writeOverride as unknown as typeof res.write;
    res.end = endOverride as unknown as typeof res.end;

    next();
  };
}
