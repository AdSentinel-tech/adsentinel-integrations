// Cloudflare Worker entry: settings from the Worker's variables and secrets (`wrangler.toml.example`).
// Route on the publisher zone: `<host>/*`.
import { handleEdgeRequest } from './edge.js';
import { createRewriter, defaultCache } from './cloudflare-runtime.js';

export interface EdgeWorkerEnv {
  AS_CONTROL_ORIGIN: string;
  AS_API_ID: string;
  AS_API_KEY: string;
  AS_SITE_HOST?: string;
  AS_ORIGIN_OVERRIDE?: string;
}

export default {
  async fetch(request: Request, env: EdgeWorkerEnv): Promise<Response> {
    return handleEdgeRequest(
      request,
      { controlOrigin: env.AS_CONTROL_ORIGIN, apiId: env.AS_API_ID, apiKey: env.AS_API_KEY, siteHost: env.AS_SITE_HOST, originOverride: env.AS_ORIGIN_OVERRIDE },
      {
        fetch: (input, init) => fetch(input, init),
        cache: defaultCache(),
        rewriter: createRewriter,
      },
    );
  },
};
