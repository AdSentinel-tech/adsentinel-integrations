# AdSentinel integrations

Official integrations that add [AdSentinel](https://page-kit.io) to a website: they fetch
the site's two serving tags from the AdSentinel control API and inject them at the top of
every page's `<head>`, and they never break the site if AdSentinel is unreachable
(fail-open).

You need the site's **API id** and **API key** from the AdSentinel console
(site → Serving). Keep the API key server-side: every integration here runs on the server,
at build time or at the edge, never in the browser.

| Package | For | npm |
| --- | --- | --- |
| [`@adsentinel/react`](packages/react) | Next.js (App and Pages Router), Remix / React Router, Vike | [![npm](https://img.shields.io/npm/v/@adsentinel/react)](https://www.npmjs.com/package/@adsentinel/react) |
| [`@adsentinel/nuxt`](packages/nuxt) | Nuxt 3 | [![npm](https://img.shields.io/npm/v/@adsentinel/nuxt)](https://www.npmjs.com/package/@adsentinel/nuxt) |
| [`@adsentinel/astro`](packages/astro) | Astro (static and SSR) | [![npm](https://img.shields.io/npm/v/@adsentinel/astro)](https://www.npmjs.com/package/@adsentinel/astro) |
| [`@adsentinel/express`](packages/express) | Express / Connect servers | [![npm](https://img.shields.io/npm/v/@adsentinel/express)](https://www.npmjs.com/package/@adsentinel/express) |
| [`@adsentinel/vite`](packages/vite) | Vite apps (build and dev) | [![npm](https://img.shields.io/npm/v/@adsentinel/vite)](https://www.npmjs.com/package/@adsentinel/vite) |
| [`@adsentinel/webpack`](packages/webpack) | Webpack 5 apps | [![npm](https://img.shields.io/npm/v/@adsentinel/webpack)](https://www.npmjs.com/package/@adsentinel/webpack) |
| [`@adsentinel/cloudflare`](packages/cloudflare) | Any site behind Cloudflare (Worker or Snippet) | [![npm](https://img.shields.io/npm/v/@adsentinel/cloudflare)](https://www.npmjs.com/package/@adsentinel/cloudflare) |
| [`@adsentinel/plugin-core`](packages/plugin-core) | Writing a new integration | [![npm](https://img.shields.io/npm/v/@adsentinel/plugin-core)](https://www.npmjs.com/package/@adsentinel/plugin-core) |
| [WordPress plugin](wordpress) | WordPress 5.5+ | [GitHub releases](https://github.com/AdSentinel-tech/adsentinel-integrations/releases) |

## Quick start

### Next.js (App Router)

```sh
npm install @adsentinel/react
```

```tsx
// app/layout.tsx
import { AdSentinelTags } from '@adsentinel/react';

const settings = {
  controlOrigin: 'https://page-kit.io',
  apiId: process.env.ADSENTINEL_API_ID!,
  apiKey: process.env.ADSENTINEL_API_KEY!,
  siteHost: 'www.example.com',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <AdSentinelTags settings={settings} />
      <body>{children}</body>
    </html>
  );
}
```

Pages Router, Remix and Vike: see [`packages/react`](packages/react).

### Nuxt 3

```sh
npm install @adsentinel/nuxt
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@adsentinel/nuxt'],
  // or set NUXT_ADSENTINEL_API_ID / NUXT_ADSENTINEL_API_KEY at runtime
  adsentinel: { apiId: 'your-plugin-api-id', apiKey: 'your-plugin-api-key' },
});
```

### Astro

```sh
npm install @adsentinel/astro
```

```js
// astro.config.mjs
import adsentinel from '@adsentinel/astro';

export default {
  integrations: [
    adsentinel({ apiId: process.env.ADSENTINEL_API_ID, apiKey: process.env.ADSENTINEL_API_KEY, siteHost: 'www.example.com' }),
  ],
};
```

### Express

```sh
npm install @adsentinel/express
```

```js
import express from 'express';
import { adsentinel } from '@adsentinel/express';

const app = express();
app.use(adsentinel({ apiId: process.env.ADSENTINEL_API_ID, apiKey: process.env.ADSENTINEL_API_KEY }));
```

### Vite

```sh
npm install -D @adsentinel/vite
```

```js
// vite.config.js
import { adsentinel } from '@adsentinel/vite';

export default {
  plugins: [adsentinel({ apiId: process.env.ADSENTINEL_API_ID, apiKey: process.env.ADSENTINEL_API_KEY, siteHost: 'www.example.com' })],
};
```

### Webpack

```sh
npm install -D @adsentinel/webpack
```

```js
// webpack.config.mjs
import { AdSentinelPlugin } from '@adsentinel/webpack';

export default {
  plugins: [new AdSentinelPlugin({ apiId: process.env.ADSENTINEL_API_ID, apiKey: process.env.ADSENTINEL_API_KEY, siteHost: 'www.example.com' })],
};
```

Build-time integrations (Vite, Webpack, static Astro) bake the tags into the built HTML:
rebuild after the tags are re-rolled in the console.

### Cloudflare

```sh
npm install @adsentinel/cloudflare
```

Deploy it as a Worker on your zone, or render a Snippet: see
[`packages/cloudflare`](packages/cloudflare).

### WordPress

Download `adsentinel-wordpress-<version>.zip` from the
[releases](https://github.com/AdSentinel-tech/adsentinel-integrations/releases), upload it
in wp-admin → Plugins → Add New → Upload Plugin, then enter the API id and key in
**AdSentinel → Settings**.

## How it works

Every integration calls one endpoint of the control API:

```
GET {controlOrigin}/plugin-support/edge-bundle?host=<site host>
adsentinel-plugin-api-id: <api id>
adsentinel-plugin-api-key: <api key>
adsentinel-plugin-contract: 1
```

and receives an `EdgeBundle` (the serving tags, the paths AdSentinel serves, a TTL). The
shape is versioned and published as a JSON Schema in
[`@adsentinel/plugin-core`](packages/plugin-core) (`@adsentinel/plugin-core/edge-bundle.schema.json`).
Responses are cached for their TTL, and a failed refresh keeps the last good bundle.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
