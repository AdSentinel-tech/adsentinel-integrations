/**
 * The wire constants of the control API's `/plugin-support` surface, shared by
 * every framework adapter.
 *
 * The header names are the exact ones the control API checks before it answers
 * the bundle route, and that the Cloudflare edge (`@adsentinel/cloudflare`)
 * sends. A mismatch here is a 403, so they are defined once and imported
 * everywhere.
 */

/** The manifest route a plugin fetches: generation, serving host, path sets and the ready-made tags HTML. */
export const BUNDLE_PATH = '/plugin-support/edge-bundle';

/** The request header carrying the site's plugin API id. */
export const API_ID_HEADER = 'adsentinel-plugin-api-id';

/** The request header carrying the site's plugin API key. */
export const API_KEY_HEADER = 'adsentinel-plugin-api-key';

/** The bundle's lifetime when the control API does not state one. Matches the control API's default bundle lifetime. */
export const DEFAULT_TTL_SECONDS = 300;

/** The default control / serving origin a framework adapter talks to when the host app does not override it. */
export const DEFAULT_CONTROL_ORIGIN = 'https://page-kit.io';
