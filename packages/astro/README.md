# `@adsentinel/astro`

The AdSentinel integration for [Astro](https://astro.build). It injects
AdSentinel's two serving tags into the `<head>` of every page, so a publisher
integrates AdSentinel by adding one integration to `astro.config` instead of
editing their templates.

It is built on `@adsentinel/plugin-core`, the framework-agnostic foundation that
fetches the tags from the control API and injects them into HTML, isomorphically
and fail-open.

## Install

```sh
npm install @adsentinel/astro
```

`astro` is a peer dependency — you already have it in an Astro project.

## Usage

Add the integration to `astro.config.mjs` with your site's Serving credentials
(console → Domain → Serving):

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import adsentinel from '@adsentinel/astro';

export default defineConfig({
  integrations: [
    adsentinel({
      apiId: process.env.ADSENTINEL_API_ID,
      apiKey: process.env.ADSENTINEL_API_KEY,
      siteHost: 'example.com',
    }),
  ],
});
```

### Options

| Option         | Required | Default               | Description                                                    |
| -------------- | -------- | --------------------- | -------------------------------------------------------------- |
| `apiId`        | yes      | —                     | The site's plugin API id.                                      |
| `apiKey`       | yes      | —                     | The site's plugin API key.                                     |
| `siteHost`     | static: yes, SSR: no | `ADSENTINEL_SITE_HOST` | The site's public host. When set, always used (see below). |
| `controlOrigin`| no       | `https://page-kit.io` | The control / serving origin. Set this for a first-party host. |

Keep `apiKey` out of source — read it from an environment variable, as above.

### Site host and reverse proxies

The tags are asked for the site's **public** host, lowercased and without a
port. A static build has no request, so it needs `siteHost` (or the
`ADSENTINEL_SITE_HOST` environment variable at build time); without one it
injects nothing and logs a warning.

For SSR, `siteHost` may be left unset: the middleware then uses the request's
`X-Forwarded-Host` (first value), else its `Host` header. Behind a reverse
proxy, CDN or API gateway that does not forward the public host, the server
sees the proxy's upstream host (say `app-upstream.internal:3000`); the control
API answers `unknown host`, nothing is injected, and one warning names the host
that was sent. Pin the public host to fix it:

```js
adsentinel({
  apiId: process.env.ADSENTINEL_API_ID,
  apiKey: process.env.ADSENTINEL_API_KEY,
  siteHost: 'www.example.com',
});
```

or set `ADSENTINEL_SITE_HOST=www.example.com` in the server's environment. The
option wins over the environment variable.

## How it injects

The integration picks a path from your project's `output`:

- **Static (`output: 'static'`, the default).** After the build
  (`astro:build:done`), the current tags are baked into every generated HTML
  file. This is a build-time snapshot: if your tags are rotated on the control
  plane, an already-built site keeps serving the old tags **until it is rebuilt**
  — the same rebuild-on-rotation caveat every build-time integration carries.

- **SSR (`output: 'server'`).** A middleware injects the tags per response
  (`addMiddleware`), fetching them through a stale-while-revalidate cache
  (`createBundleCache`). A tag rotation is picked up within the bundle TTL, with
  no rebuild. The cache fetches the control API at most once per TTL and never
  blocks a response on it after the first load.

## Fail-open

Both paths fail open. A control-plane outage, a bad credential, an inactive or
empty bundle, or malformed HTML injects **nothing** and logs a warning — it
never fails the build and never breaks an SSR response. A site with a
misconfigured integration serves plain, working pages.

## License

See [LICENSE](https://github.com/AdSentinel-tech/adsentinel-integrations/blob/main/LICENSE).
