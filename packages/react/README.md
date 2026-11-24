# @adsentinel/react

Server-side React integration for AdSentinel. It resolves a site's two serving
tags from the control API and injects them into the page `<head>`, idiomatically
and fail-open, for **Next.js** (App Router and Pages Router), **Remix** and
**Vike**.

It is a thin layer over [`@adsentinel/plugin-core`](../plugin-core): that package
fetches the bundle and hands back `tags`, a ready-made HTML string of the two
`<script>` tags; this package renders that string into `<head>` the React way.

## Why server-side only

The tags are the loader for AdSentinel. They must be in the HTML the browser
first parses, so the parser runs them before the page hydrates — a
client-injected loader is both late and defeated by the very blockers AdSentinel
exists to recover. Everything here runs during SSR.

## Fail-open, always

A control-plane outage, a bad credential, an inactive site or an empty bundle
all resolve to **no tags**, and nothing is rendered. No code path throws into
the host render. The site serves exactly as if the plugin were not installed.

## Settings

Every entry point takes a `PluginSettings` (re-exported from the core package):

```ts
import type { PluginSettings } from '@adsentinel/react';

const adSentinelSettings: PluginSettings = {
  controlOrigin: 'https://page-kit.io', // default control/serving origin
  apiId: process.env.ADSENTINEL_API_ID!, // console -> Domain -> Serving
  apiKey: process.env.ADSENTINEL_API_KEY!,
  siteHost: 'www.example.com', // the site's PUBLIC host
};
```

### `siteHost` and reverse proxies

The tags are asked for the site's **public** host (lowercased, port removed).
If `siteHost` is omitted, the `ADSENTINEL_SITE_HOST` environment variable is
used. To derive it from each request instead, use `siteHostFromHeaders`, which
returns the explicit `siteHost` (or `ADSENTINEL_SITE_HOST`) when set, else the
first `X-Forwarded-Host` value, else the `Host` header:

```ts
import { headers } from 'next/headers';
import { siteHostFromHeaders, type PluginSettings } from '@adsentinel/react';

export async function adSentinelSettingsForRequest(): Promise<PluginSettings> {
  return {
    controlOrigin: 'https://page-kit.io',
    apiId: process.env.ADSENTINEL_API_ID!,
    apiKey: process.env.ADSENTINEL_API_KEY!,
    // Behind a reverse proxy that does not forward the public host, pass it:
    // siteHostFromHeaders(await headers(), 'www.example.com')
    siteHost: siteHostFromHeaders(await headers()),
  };
}
```

`siteHostFromHeaders` accepts a Fetch `Headers` (App Router, Remix, Vike) or a
Node headers object (`req.headers` in a custom server). Behind a reverse proxy,
CDN or API gateway, the `Host` the server receives is often the proxy's
upstream host (say `app-upstream.internal:3000`); the control API answers
`unknown host`, nothing is injected, and one warning names the host that was
sent. Forward `X-Forwarded-Host`, or set `siteHost` / `ADSENTINEL_SITE_HOST` to
the public host.

## Public surface

| Export | Shape | Use it for |
| --- | --- | --- |
| `getAdSentinelTags(settings)` | `Promise<string>` | Pages Router `_document`, Remix, Vike — anywhere you control the document markup. `''` when there is nothing to inject. |
| `tagsFromBundle(bundle)` | `string` | The same, from a bundle you already hold (e.g. a cached one). |
| `<AdSentinelTags settings={…} />` | async Server Component | Next.js App Router, which has no document-string hook. |
| `siteHostFromHeaders(headers, siteHost?)` | `string \| undefined` | The request's public site host (explicit, else `X-Forwarded-Host`, else `Host`). |
| `PluginSettings`, `EdgeBundle` | types | Typing your config (re-exported from `@adsentinel/plugin-core`). |

### Caching

`getAdSentinelTags` fetches the control API on every call. For a page served on
every request, cache the bundle with `createBundleCache` from the core package
and turn it into tags with `tagsFromBundle`:

```ts
import { createBundleCache } from '@adsentinel/plugin-core';
import { tagsFromBundle } from '@adsentinel/react';

// Module scope: one SWR cache per server process, hit at most once per TTL.
const cache = createBundleCache(adSentinelSettings);

export async function adSentinelTags(): Promise<string> {
  return tagsFromBundle(await cache.get());
}
```

---

## Next.js — App Router

Render the async Server Component in the root layout. It writes the tags into
`<head>` and renders nothing when the site is inactive. A Server Component is
never hydrated on the client, so injecting raw HTML here cannot cause a
hydration mismatch.

```tsx
// app/layout.tsx
import { AdSentinelTags } from '@adsentinel/react';
import { adSentinelSettings } from '@/lib/adsentinel';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <AdSentinelTags settings={adSentinelSettings} />
      <body>{children}</body>
    </html>
  );
}
```

The App Router manages `<head>` itself; `<AdSentinelTags>` emits a `<head>` whose
contents the document head absorbs, so the loader scripts are parsed and run on
first load.

## Next.js — Pages Router

The Pages Router builds the document in `_document`, which renders only on the
server and is never hydrated — so there is no hydration concern. `next/document`
does not want non-`<head>` elements inside `<Head>`, and the opaque tags string
is two `<script>` elements rather than one inline script, so the clean place to
inject it is the HTML string itself, with `injectTagsIntoHtml` from the core
package. Do it once in a custom server (or any response middleware that sees the
rendered HTML):

```ts
// server.ts (custom Next server)
import { getAdSentinelTags } from '@adsentinel/react';
import { injectTagsIntoHtml } from '@adsentinel/plugin-core';
import { adSentinelSettings } from './lib/adsentinel';

// Render the page as usual, then splice the tags into <head> before sending:
const html = await renderPageToHtml(req, res);
const tags = await getAdSentinelTags(adSentinelSettings);
res.send(injectTagsIntoHtml(html, tags)); // no-op when tags is ''
```

`injectTagsIntoHtml` places the tags right after the opening `<head>`, before any
existing children, and returns the HTML untouched when there is nothing to
inject.

## Remix (and React Router v7 framework mode)

Resolve the tags in the root `loader` and render them in `root.tsx`. Keep them in
the `Layout` export so they appear on error and hydrate-fallback pages too. The
`<script dangerouslySetInnerHTML>` wrapper is server-rendered; mark it
`suppressHydrationWarning` so React leaves the server bytes untouched on the
client.

```tsx
// app/root.tsx
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from '@remix-run/react';
import { getAdSentinelTags } from '@adsentinel/react';
import { adSentinelSettings } from '~/lib/adsentinel.server';

export async function loader() {
  return { adSentinelTags: await getAdSentinelTags(adSentinelSettings) };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useLoaderData<typeof loader>();
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
        {data?.adSentinelTags ? (
          <script
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: data.adSentinelTags }}
          />
        ) : null}
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
```

## Vike

Resolve the tags in the `onRenderHtml` hook and interpolate them into `<head>`
with `dangerouslySkipEscape`, which emits the string unescaped. `onRenderHtml`
runs only on the server, so there is no hydration concern for the head bytes.

```ts
// renderer/+onRenderHtml.ts
import { escapeInject, dangerouslySkipEscape } from 'vike/server';
import { renderToString } from 'react-dom/server';
import { getAdSentinelTags } from '@adsentinel/react';
import { adSentinelSettings } from '../lib/adsentinel';

export async function onRenderHtml(pageContext: PageContextServer) {
  const pageHtml = renderToString(/* <App /> */);
  const adSentinelTags = await getAdSentinelTags(adSentinelSettings);

  return escapeInject`<!DOCTYPE html>
    <html lang="en">
      <head>${dangerouslySkipEscape(adSentinelTags)}</head>
      <body><div id="page-root">${dangerouslySkipEscape(pageHtml)}</div></body>
    </html>`;
}
```

With `vike-react`, `onRenderHtml` is provided for you; use a `+Head.tsx` that
renders the tags via `dangerouslySetInnerHTML` instead, or post-process the HTML
string with `injectTagsIntoHtml` from `@adsentinel/plugin-core`.

## License

See [LICENSE](https://github.com/AdSentinel-tech/adsentinel-integrations/blob/main/LICENSE).
