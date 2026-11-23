// Bundles the Snippet entry ONCE with its settings left as a unique placeholder and
// writes it as `dist/snippet-template.js` (+ `.d.ts`), exported as
// `@adsentinel/cloudflare/snippet-template`. `renderSnippet(settings)` then splices a
// site's real settings in, producing that site's ready Snippet script; a server that
// generates Snippets for many sites can do the same without rebuilding.
//
// Run after `tsc`, from the package directory (plugin-core must be built).
import { buildSync } from 'esbuild';
import { writeFileSync } from 'node:fs';

// The token esbuild bakes in place of the settings object. A plain ASCII identifier
// inside a string literal, so minification keeps it verbatim and exactly once.
const PLACEHOLDER = '__AS_EDGE_SETTINGS_PLACEHOLDER__';
const QUOTED_TOKEN = `"${PLACEHOLDER}"`;
// Cloudflare Snippets are limited to 32 KB.
const SNIPPET_SIZE_LIMIT = 32 * 1024;

const result = buildSync({
  entryPoints: ['src/snippet.ts'],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  define: { __AS_EDGE_SETTINGS__: QUOTED_TOKEN },
  write: false,
  logLevel: 'error',
});
const bundle = result.outputFiles[0].text;

const occurrences = bundle.split(QUOTED_TOKEN).length - 1;
if (occurrences !== 1) {
  throw new Error(`expected the settings placeholder exactly once in the bundle, found ${occurrences}`);
}
if (bundle.length > SNIPPET_SIZE_LIMIT / 2) {
  throw new Error(`the snippet template is ${bundle.length} bytes, too close to the ${SNIPPET_SIZE_LIMIT}-byte Snippet limit`);
}

const js = `// Generated at build time from src/snippet.ts — do not edit.

/** The quoted token the settings object is spliced in for. */
export const SNIPPET_SETTINGS_PLACEHOLDER = ${JSON.stringify(QUOTED_TOKEN)};

/** The bundled Snippet, settings still a placeholder. */
export const SNIPPET_TEMPLATE = ${JSON.stringify(bundle)};

/** Cloudflare's size limit for one Snippet, in bytes. */
export const SNIPPET_SIZE_LIMIT = ${SNIPPET_SIZE_LIMIT};

/** The site's ready Snippet script: the template with \`settings\` baked in. */
export function renderSnippet(settings) {
  return SNIPPET_TEMPLATE.split(SNIPPET_SETTINGS_PLACEHOLDER).join(JSON.stringify(settings));
}
`;
const dts = `import type { EdgeSettings } from './edge.js';

/** The quoted token the settings object is spliced in for. */
export declare const SNIPPET_SETTINGS_PLACEHOLDER: string;
/** The bundled Snippet, settings still a placeholder. */
export declare const SNIPPET_TEMPLATE: string;
/** Cloudflare's size limit for one Snippet, in bytes. */
export declare const SNIPPET_SIZE_LIMIT: number;
/** The site's ready Snippet script: the template with \`settings\` baked in. */
export declare function renderSnippet(settings: EdgeSettings): string;
`;
writeFileSync('dist/snippet-template.js', js);
writeFileSync('dist/snippet-template.d.ts', dts);
process.stdout.write(`snippet template: ${bundle.length} bytes (limit ${SNIPPET_SIZE_LIMIT})\n`);
