# @adsentinel/plugin-core

The framework-agnostic foundation every AdSentinel framework integration plugin
(`@adsentinel/react`, `@adsentinel/nuxt`, `@adsentinel/express`,
`@adsentinel/vite`, `@adsentinel/webpack`, `@adsentinel/astro`) is built on.

A publisher integrates AdSentinel dynamically by fetching its two serving tags
from the control API and injecting them into the page `<head>`. This package
encapsulates exactly that:

- **Isomorphic** — Node and edge runtimes, global `fetch`, injectable for tests.
- **Fail-open** — a control-plane outage, a bad credential, or malformed HTML
  never throws into the host app.
- **Cached** — a pluggable bundle cache keyed by the site, with a TTL the control
  API can override.

You usually do not depend on this package directly: pick the adapter for your
framework, which re-exports the pieces you need. Reach for `plugin-core` only
when writing a new adapter.

## Install

```sh
npm install @adsentinel/plugin-core
```

## What it exports

| Export | Purpose |
| --- | --- |
| `fetchEdgeBundle`, `edgeBundleUrl` | Fetch the serving bundle (tags, paths, generation) from the control API. |
| `createBundleCache` | A TTL cache over a pluggable store (in-memory, KV, Cloudflare `Cache`, …). |
| `injectTagsIntoHtml` | Insert the two tags at the start of an HTML `<head>`, as a string transform. |
| `isOwnPath` | Whether a request path belongs to AdSentinel's own serving surface. |
| `siteHostFromHeaders`, `resolveSiteHost`, `normaliseSiteHost`, `siteHostFromEnv`, `SITE_HOST_ENV` | Resolve the public site host of a request (see [Site host](#site-host)). |
| `createHostBundleCaches` | One bundle cache per site host, for adapters that resolve the host per request. |
| `API_ID_HEADER`, `API_KEY_HEADER`, `BUNDLE_PATH`, `DEFAULT_CONTROL_ORIGIN`, `DEFAULT_TTL_SECONDS` | The wire constants of the control API's `/plugin-support` surface. |
| `BundleCache`, `BundleStore`, `EdgeBundle`, `PluginSettings`, … | The accompanying TypeScript types. |

## Settings

Every adapter resolves a `PluginSettings` object and hands it to this core:

- `apiId` / `apiKey` — the site's plugin credentials.
- `controlOrigin` — the control / serving origin (defaults to
  `https://page-kit.io`).
- `siteHost` — the site's public host, e.g. `www.example.com` (see below).
- `fetchImpl` — an optional `fetch` override, for tests or non-standard runtimes.

## Site host

The control API finds the site by the host it is asked for, so that host must
be the site's **public** host. Request-time adapters resolve it in this order:

1. an explicit `siteHost` option, or the `ADSENTINEL_SITE_HOST` environment
   variable, always used when set;
2. otherwise the first value of the `X-Forwarded-Host` request header;
3. otherwise the `Host` request header.

The value is normalised before it is sent: lowercased, the port and a trailing
dot removed (a leading `www.` is kept; the control API ignores it).

```ts
import { siteHostFromHeaders } from '@adsentinel/plugin-core';

siteHostFromHeaders({ host: 'app-upstream:3000', 'x-forwarded-host': 'www.example.com' });
// -> 'www.example.com'
siteHostFromHeaders(request.headers, 'www.example.com'); // explicit host wins
```

When the control API answers `unknown host`, `fetchEdgeBundle` logs one warning
per process naming the host it sent. Behind a reverse proxy, CDN or gateway
that does not forward the public host, set `siteHost` (or
`ADSENTINEL_SITE_HOST`) to fix it.

## License

See [LICENSE](https://github.com/AdSentinel-tech/adsentinel-integrations/blob/main/LICENSE).
