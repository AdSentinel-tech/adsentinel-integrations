---
'@adsentinel/plugin-core': patch
'@adsentinel/react': patch
'@adsentinel/nuxt': patch
'@adsentinel/express': patch
'@adsentinel/vite': patch
'@adsentinel/webpack': patch
'@adsentinel/astro': patch
'@adsentinel/cloudflare': minor
---

Move to the public `AdSentinel-tech/adsentinel-integrations` repository: new `repository` URL, compiled `dist/` entry points with full `exports` maps and types, and npm provenance. `@adsentinel/plugin-core` now exports the bundle contract (`EDGE_BUNDLE_CONTRACT_VERSION`, `EDGE_BUNDLE_SCHEMA` and `@adsentinel/plugin-core/edge-bundle.schema.json`) and sends the contract version on every bundle request. First release of `@adsentinel/cloudflare`, the Cloudflare Worker / Snippet edge, now built on `@adsentinel/plugin-core`.
