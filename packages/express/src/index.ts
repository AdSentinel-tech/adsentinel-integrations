/**
 * @adsentinel/express — Express/Connect middleware for AdSentinel.
 *
 * Mount it once and every `text/html` response served by the app gets the two
 * serving tags injected into its `<head>`; everything else passes through
 * untouched. It is fail-open: a control-plane outage, a bad credential or
 * malformed HTML never breaks or hangs the host app.
 *
 *   import express from 'express';
 *   import { adsentinel } from '@adsentinel/express';
 *
 *   const app = express();
 *   app.use(adsentinel({ apiId: process.env.ADSENTINEL_API_ID!, apiKey: process.env.ADSENTINEL_API_KEY! }));
 *
 * The control-API fetch, the stale-while-revalidate cache and the head
 * injection come from `@adsentinel/plugin-core`; this package is the
 * Express-specific response buffering around them.
 */
export { adsentinel, DEFAULT_CONTROL_ORIGIN } from './middleware.js';
export type { AdsentinelOptions } from './middleware.js';
