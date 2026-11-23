// The two Cloudflare runtime globals the entries use, typed locally so the package
// type-checks against the standard DOM lib without pulling in the whole Workers types.
import type { HtmlRewriterLike } from './edge.js';

declare const HTMLRewriter: new () => HtmlRewriterLike;

/** The zone's default cache (`caches.default` in the Workers runtime). */
export function defaultCache(): Cache {
  return (caches as unknown as { default: Cache }).default;
}

/** A fresh `HTMLRewriter`. */
export function createRewriter(): HtmlRewriterLike {
  return new HTMLRewriter();
}
