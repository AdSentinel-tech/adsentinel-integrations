# @adsentinel/vite

A Vite plugin that integrates AdSentinel into your site by injecting its two
serving tags into your app's HTML `<head>` — at build and in the dev server.

It is a thin, idiomatic wrapper over
[`@adsentinel/plugin-core`](../plugin-core): the plugin fetches your site's
serving bundle from the AdSentinel control API and injects the ready-made tags
through Vite's `transformIndexHtml` hook.

## Install

```sh
npm install @adsentinel/vite
```

`vite` is a peer dependency (Vite 5, 6, 7 or 8).

## Usage

In your `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import { adsentinel } from '@adsentinel/vite';

export default defineConfig({
  plugins: [
    adsentinel({
      // controlOrigin: 'https://page-kit.io', // optional, this is the default
      apiId: process.env.ADSENTINEL_API_ID!,   // console -> Domain -> Serving
      apiKey: process.env.ADSENTINEL_API_KEY!, // console -> Domain -> Serving
      siteHost: 'example.com',                  // the host the tags are served for
    }),
  ],
});
```

Keep `apiKey` out of source control — read it from an environment variable or a
secrets manager.

### Options

| Option         | Type               | Required | Default                 | Description                                              |
| -------------- | ------------------ | -------- | ----------------------- | -------------------------------------------------------- |
| `apiId`        | `string`           | yes      | —                       | The site's plugin API id (console → Domain → Serving).   |
| `apiKey`       | `string`           | yes      | —                       | The site's plugin API key.                               |
| `siteHost`     | `string`           | yes      | —                       | The host the serving tags are requested for.             |
| `controlOrigin`| `string`           | no       | `https://page-kit.io`   | The control / serving origin.                            |
| `fetchImpl`    | `typeof fetch`     | no       | global `fetch`          | A custom fetch (tests, proxies). Defaults to the global. |

## Important: a build bakes the tags — rotate ⇒ rebuild

AdSentinel's serving tags encode your site's current **generation** and serving
host. This is a **build-time** plugin:

- **Build** (`vite build`): `transformIndexHtml` runs once and the resulting
  tags are written into the static `index.html`. **The build freezes whichever
  tags were current at build time.** If you later rotate your serving
  credentials or bump the generation in the AdSentinel console, the built output
  still carries the old tags — you must **rebuild and redeploy** to pick up the
  new ones.
- **Dev** (`vite dev`): the hook runs on every page request, so a rotation is
  reflected on the next reload with no restart.

If you need tags that update without a redeploy, serve them at the edge
(the Cloudflare publisher edge / dynamic first-party integration) rather than
baking them into a static build.

## Fail-open

AdSentinel never breaks your build or dev server. If the control API is
unreachable, the credentials are rejected, the site is inactive, or the bundle
carries no tags, the plugin **injects nothing, logs a `[@adsentinel/vite]`
warning, and returns your HTML unchanged.** It never throws and never fails the
build.

## License

See [LICENSE](https://github.com/AdSentinel-tech/adsentinel-integrations/blob/main/LICENSE).
