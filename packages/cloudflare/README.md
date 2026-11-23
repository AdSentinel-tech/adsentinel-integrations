# @adsentinel/cloudflare

The AdSentinel publisher edge for a site served through Cloudflare. Installed once on the
publisher's own zone, it:

- relays to AdSentinel every request whose path belongs to AdSentinel, with the visitor's
  host, IP and country in signed `x-as-edge-*` headers;
- injects the site's two serving tags at the start of `<head>` of every HTML page the
  origin answers;
- passes everything else through untouched.

It is fail-open: if the control API is unreachable or the credentials are wrong, the site
is served exactly as if the edge were not there.

The plugin credentials (API id and key) come from the AdSentinel console
(site → Serving).

## As a Worker

```sh
npm install @adsentinel/cloudflare
cp node_modules/@adsentinel/cloudflare/wrangler.toml.example wrangler.toml
# edit the route, AS_CONTROL_ORIGIN and AS_API_ID
npx wrangler secret put AS_API_KEY
npx wrangler deploy
```

Variables: `AS_CONTROL_ORIGIN`, `AS_API_ID`, `AS_API_KEY` (secret), optional `AS_SITE_HOST`
(defaults to the request host) and `AS_ORIGIN_OVERRIDE`.

## As a Snippet

A Snippet carries its settings baked in. Render one for your site:

```js
import { renderSnippet } from '@adsentinel/cloudflare/snippet-template';

const script = renderSnippet({
  controlOrigin: 'https://page-kit.io',
  apiId: 'as_xxxxxxxxxxxx',
  apiKey: process.env.AS_API_KEY,
  siteHost: 'www.example.com',
});
```

Paste `script` as a new Snippet on the zone with the rule `http.host eq "www.example.com"`.
From a clone of this repository, `node scripts/build-snippet.mjs <host> <api id> <api key>`
writes the same file to `artifacts/`. The generated file contains the API key: do not commit
it.

## Inside your own Worker

```ts
import { handleEdgeRequest } from '@adsentinel/cloudflare';

export default {
  fetch(request: Request, env: Env) {
    return handleEdgeRequest(
      request,
      { controlOrigin: 'https://page-kit.io', apiId: env.AS_API_ID, apiKey: env.AS_API_KEY },
      { fetch, cache: caches.default, rewriter: () => new HTMLRewriter() },
    );
  },
};
```

## Control API

`GET {controlOrigin}/plugin-support/edge-bundle?host=<site host>` with the
`adsentinel-plugin-api-id` / `adsentinel-plugin-api-key` headers, answered with an
`EdgeBundle` (see `@adsentinel/plugin-core`).

## License

See [LICENSE](https://github.com/AdSentinel-tech/adsentinel-integrations/blob/main/LICENSE).
