// Cloudflare Snippet entry: settings baked at build time (see `snippet-template` and
// `scripts/build-snippet.mjs`). Rule expression on the publisher zone: `http.host eq "<host>"`.
import { handleEdgeRequest } from './edge.js';
import type { EdgeSettings } from './edge.js';
import { createRewriter, defaultCache } from './cloudflare-runtime.js';

declare const __AS_EDGE_SETTINGS__: EdgeSettings;

export default {
  async fetch(request: Request): Promise<Response> {
    const settings: EdgeSettings = __AS_EDGE_SETTINGS__;
    return handleEdgeRequest(request, settings, {
      fetch: (input, init) => fetch(input, init),
      cache: defaultCache(),
      rewriter: createRewriter,
    });
  },
};
