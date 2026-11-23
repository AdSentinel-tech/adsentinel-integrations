# @adsentinel/webpack

A Webpack plugin that bakes AdSentinel's two serving tags into your site's HTML
at build time. It fetches the site's edge bundle from the control API and
injects the ready-made tags into the `<head>` of every emitted HTML document.

- With [HtmlWebpackPlugin](https://github.com/jantimon/html-webpack-plugin) in
  the build, it injects through that plugin's `beforeEmit` hook.
- Without it, it rewrites each emitted `*.html` asset in
  `compilation.hooks.processAssets`.

The network call and the HTML injection live in `@adsentinel/plugin-core`; this
package is only the Webpack binding.

## Install

```sh
npm install --save-dev @adsentinel/webpack
```

`webpack` is a peer dependency; `html-webpack-plugin` is an optional peer
dependency (the plugin uses it when present and falls back to the emitted HTML
asset when it is not).

## Usage

```js
// webpack.config.js
const { AdSentinelPlugin } = require('@adsentinel/webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  // ...
  plugins: [
    new HtmlWebpackPlugin(),
    new AdSentinelPlugin({
      // controlOrigin defaults to https://page-kit.io
      apiId: process.env.ADSENTINEL_API_ID,
      apiKey: process.env.ADSENTINEL_API_KEY,
      siteHost: 'example.com',
    }),
  ],
};
```

With native ES modules (`webpack.config.mjs`), import it the same way:

```js
import { AdSentinelPlugin } from '@adsentinel/webpack';
```

Find the site's `apiId` / `apiKey` in the AdSentinel console under
**Domain → Serving**.

### Options

| Option          | Required | Default                 | Description                                         |
| --------------- | -------- | ----------------------- | --------------------------------------------------- |
| `apiId`         | yes      | —                       | The site's plugin API id.                           |
| `apiKey`        | yes      | —                       | The site's plugin API key.                          |
| `siteHost`      | yes      | —                       | The host the tags are fetched for.                  |
| `controlOrigin` | no       | `https://page-kit.io`   | The control / serving origin.                       |
| `fetchImpl`     | no       | global `fetch`          | A custom fetch (for tests or a proxied environment).|

## Rebuild on credential or generation rotation

This is a **build-time** plugin: a build bakes the tags that were current when
it ran, exactly as the Vite plugin does. If you rotate the site's plugin
credentials or bump its serving generation in the console, the already-built
HTML keeps the tags it was stamped with. **Rebuild the site** for the new
configuration to take effect.

For HTML that must reflect a rotation without a rebuild, inject the tags at the
edge (the Cloudflare publisher edge) or at request time instead.

## Fail-open

AdSentinel never breaks your build. If the control API is unreachable, the
credentials are wrong, or the site is inactive or has no tags, the plugin
injects nothing and pushes a single **compilation warning** — the build still
succeeds and the HTML ships without the tags.

## License

See [LICENSE](https://github.com/AdSentinel-tech/adsentinel-integrations/blob/main/LICENSE).
