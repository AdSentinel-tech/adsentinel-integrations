# @adsentinel/nuxt

A Nuxt 3 module that injects the two AdSentinel serving tags into the top of the
server-rendered `<head>`, on every SSR response. It is the idiomatic Nuxt shell
around [`@adsentinel/plugin-core`](../plugin-core): the core fetches the tags from
the control API and caches them (stale-while-revalidate); this module wires that
into Nuxt.

- **Server-side only.** The tags are added during SSR via a Nitro server plugin
  hooking `render:html`, so they are in the HTML the browser first parses — no
  client round-trip, and the API key never reaches the client.
- **Fail-open.** When the site is not configured, the control plane is down, or
  the bundle is inactive, the module injects nothing and never breaks rendering.
- **One cache per host.** The site host is derived from the request, so a single
  deployment can serve several hosts; each gets its own SWR cache, shared across
  requests for the life of the server.

## Install

```bash
npm install @adsentinel/nuxt
```

Requires a Nuxt 3 app (`nuxt`, which provides `@nuxt/kit`, `nitropack` and `h3`).

## Usage

Add the module and your site's plugin credentials (console → Domain → Serving) in
`nuxt.config`:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@adsentinel/nuxt'],

  adsentinel: {
    apiId: 'your-plugin-api-id',
    apiKey: 'your-plugin-api-key',
    // controlOrigin defaults to 'https://page-kit.io'
  },
});
```

That is all. On each SSR response the module prepends the two serving tags at the
top of `<head>`.

### Keeping the key out of the repo

`apiId` / `apiKey` are published to the **server** runtime config, so you can set
them from the environment at deploy time instead of committing them:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@adsentinel/nuxt'],
  runtimeConfig: {
    adsentinel: {
      controlOrigin: '',
      apiId: '',
      apiKey: '',
    },
  },
});
```

```bash
# .env — Nuxt maps NUXT_<KEY> onto runtimeConfig
NUXT_ADSENTINEL_API_ID=your-plugin-api-id
NUXT_ADSENTINEL_API_KEY=your-plugin-api-key
NUXT_ADSENTINEL_CONTROL_ORIGIN=https://page-kit.io
```

Values in `runtimeConfig.adsentinel` (and their `NUXT_ADSENTINEL_*` env overrides)
take precedence over the inline module options.

## Options

| Option          | Type     | Default                  | Description                                            |
| --------------- | -------- | ------------------------ | ------------------------------------------------------ |
| `apiId`         | `string` | `''`                     | The site's plugin API id. Required to serve anything.  |
| `apiKey`        | `string` | `''`                     | The site's plugin API key. Required to serve anything. |
| `controlOrigin` | `string` | `'https://page-kit.io'`  | The control / serving origin.                          |

When `apiId` or `apiKey` is empty the module stays completely inert.

## How it works

1. During setup the module resolves the settings (module options, overridden by
   `runtimeConfig.adsentinel` / `NUXT_ADSENTINEL_*`) and publishes them to the
   server runtime config, then registers a Nitro server plugin.
2. The plugin builds a per-host SWR cache factory from `@adsentinel/plugin-core`'s
   `createBundleCache`, and hooks `render:html`.
3. On each render it derives the host from the request, reads the bundle from that
   host's cache (fetched from the control API at most once per TTL), and, when the
   bundle is active with non-empty tags, unshifts the tags onto `html.head`.

See [`src/inject.ts`](./src/inject.ts) for the framework-agnostic core (unit-tested
with a fake fetch) and [`src/runtime/server/plugin.ts`](./src/runtime/server/plugin.ts)
for the Nitro plugin.

## License

See [LICENSE](https://github.com/AdSentinel-tech/adsentinel-integrations/blob/main/LICENSE).
