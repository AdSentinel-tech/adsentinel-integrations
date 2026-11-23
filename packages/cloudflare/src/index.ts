/**
 * @adsentinel/cloudflare — the AdSentinel publisher edge for a Cloudflare zone.
 *
 * Three ways to use it:
 *   - as a ready Worker: `@adsentinel/cloudflare/worker` (settings from env);
 *   - as a Snippet: `@adsentinel/cloudflare/snippet-template` renders a
 *     self-contained Snippet script with a site's settings baked in;
 *   - as a library inside your own Worker: `handleEdgeRequest` below.
 */
export {
  API_ID_HEADER,
  API_KEY_HEADER,
  BUNDLE_PATH,
  EDGE_HEADERS,
  buildRelayRequest,
  bundleCacheKey,
  handleEdgeRequest,
  injectTags,
  isOurPath,
  loadBundle,
  originRequest,
  relayResponse,
  signEdge,
} from './edge.js';
export type { BundleSource, EdgeBundle, EdgeRuntime, EdgeSettings, HtmlRewriterLike } from './edge.js';
