---
'@adsentinel/plugin-core': patch
'@adsentinel/nuxt': patch
'@adsentinel/express': patch
'@adsentinel/astro': patch
'@adsentinel/react': patch
---

Ask the edge bundle for the site's public host behind a reverse proxy. The Nuxt module, the Express middleware and the Astro SSR middleware now take an explicit `siteHost` option (also read from the `ADSENTINEL_SITE_HOST` environment variable, and `NUXT_ADSENTINEL_SITE_HOST` for Nuxt), which always wins; otherwise they use the first `X-Forwarded-Host` value, then `Host`. The host sent is lowercased and stripped of its port. When the control API answers `unknown host`, one warning per process names the host sent and points to `siteHost`. `@adsentinel/plugin-core` exports the helpers (`siteHostFromHeaders`, `resolveSiteHost`, `normaliseSiteHost`, `siteHostFromEnv`, `createHostBundleCaches`); `@adsentinel/react` re-exports `siteHostFromHeaders` and falls back to `ADSENTINEL_SITE_HOST`; Astro's `siteHost` becomes optional for SSR.
