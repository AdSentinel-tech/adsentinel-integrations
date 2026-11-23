// Writes one site's ready Cloudflare Snippet, settings baked in.
//
// usage: node scripts/build-snippet.mjs <site host> <api id> <api key> [control origin]
//        -> artifacts/<site host>.snippet.js
// Build the package first (`npx nx build cloudflare`). The api key ends up inside the
// generated file: keep that file out of version control.
import { mkdirSync, writeFileSync } from 'node:fs';
import { renderSnippet, SNIPPET_SIZE_LIMIT } from '../dist/snippet-template.js';

const [siteHost, apiId, apiKey, controlOrigin = 'https://page-kit.io'] = process.argv.slice(2);
if (!siteHost || !apiId || !apiKey) {
  console.error('usage: build-snippet.mjs <site host> <api id> <api key> [control origin]');
  process.exit(1);
}
const snippet = renderSnippet({ controlOrigin, apiId, apiKey, siteHost });
mkdirSync('artifacts', { recursive: true });
const out = `artifacts/${siteHost}.snippet.js`;
writeFileSync(out, snippet);
console.log(`${out}: ${snippet.length} bytes (limit ${SNIPPET_SIZE_LIMIT}, margin ${SNIPPET_SIZE_LIMIT - snippet.length})`);
