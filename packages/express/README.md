# @adsentinel/express

Express (and Connect-compatible) middleware that integrates AdSentinel into a
Node app by injecting the two serving tags into the `<head>` of every HTML page
the app returns. It builds on [`@adsentinel/plugin-core`](../plugin-core), which
fetches the tags from the control API and caches them.

## Install

The package is part of the AdSentinel workspace. In a standalone app, install it
alongside Express (its optional peer dependency):

```bash
npm install @adsentinel/express express
```

## Usage

```ts
import express from 'express';
import { adsentinel } from '@adsentinel/express';

const app = express();

// Mount it high, before your routes, so it can rewrite their HTML responses.
app.use(
  adsentinel({
    apiId: process.env.ADSENTINEL_API_ID!,
    apiKey: process.env.ADSENTINEL_API_KEY!,
    // controlOrigin defaults to https://page-kit.io
  }),
);

app.get('/', (_req, res) => {
  res.send('<!doctype html><html><head><title>Home</title></head><body>…</body></html>');
});

app.listen(3000);
```

It is a plain `(req, res, next)` function, so it also works with Connect and any
framework built on it.

## Options

| Option          | Required | Default                 | Description                                           |
| --------------- | -------- | ----------------------- | ----------------------------------------------------- |
| `apiId`         | yes      | —                       | The site's plugin API id (console → Domain → Serving).|
| `apiKey`        | yes      | —                       | The site's plugin API key.                            |
| `controlOrigin` | no       | `https://page-kit.io`   | The control / serving origin.                         |
| `siteHost`      | no       | —                       | The site's public host. When set, always used.        |

Without `siteHost`, the site host is read from the request: the first
`X-Forwarded-Host` value, else the `Host` header (lowercased, port removed). The
same middleware can therefore front virtual hosts; each host is cached
independently.

## Behind a reverse proxy: `siteHost`

The tags are asked for the site's **public** host. Behind a reverse proxy, CDN
or API gateway, the `Host` your app receives is often the proxy's upstream host
(say `app-upstream.internal:3000`), which the control API does not know: it
answers `unknown host`, nothing is injected, and the middleware logs one
warning naming the host it sent.

If the proxy forwards `X-Forwarded-Host`, nothing else is needed. Otherwise pin
the public host, in code or with the `ADSENTINEL_SITE_HOST` environment
variable (the option wins when both are set):

```ts
app.use(
  adsentinel({
    apiId: process.env.ADSENTINEL_API_ID!,
    apiKey: process.env.ADSENTINEL_API_KEY!,
    siteHost: 'www.example.com',
  }),
);
```

```bash
ADSENTINEL_SITE_HOST=www.example.com node server.js
```

## Behaviour

- **HTML only.** Only `text/html` responses are rewritten. The tags are
  prepended to the start of `<head>`. Every other response — JSON, assets,
  redirects, streaming responses such as SSE — passes through untouched and is
  never buffered.
- **One fetch per TTL.** Each middleware instance holds a stale-while-revalidate
  cache, so the control API is hit at most once per TTL per host and never on the
  request's critical path after warm-up.
- **Fail-open, always.** Any error, a null or inactive bundle, or empty tags
  forward the original response unchanged. The middleware never throws into your
  app, never hangs it, preserves status and headers, corrects `Content-Length`
  after injection, and never injects twice.

## Development

```bash
npx nx typecheck @adsentinel/express
npx nx test @adsentinel/express
```

## License

See [LICENSE](https://github.com/AdSentinel-tech/adsentinel-integrations/blob/main/LICENSE).
