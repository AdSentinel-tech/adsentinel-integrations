// Writes the compiled `EDGE_BUNDLE_SCHEMA` to `dist/edge-bundle.schema.json`,
// so the schema ships as a plain JSON file next to the code that exports it.
// Run after `tsc`, from the package directory.
import { writeFileSync } from 'node:fs';
import { EDGE_BUNDLE_SCHEMA } from '../dist/edge-bundle-schema.js';

writeFileSync('dist/edge-bundle.schema.json', JSON.stringify(EDGE_BUNDLE_SCHEMA, null, 2) + '\n');
