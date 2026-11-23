/**
 * The version of the wire contract between the plugins and the control API's
 * `GET /plugin-support/edge-bundle` route.
 *
 * The contract is the `EdgeBundle` shape (`types.ts`), published as a JSON
 * Schema (`edge-bundle-schema.ts`, shipped as
 * `@adsentinel/plugin-core/edge-bundle.schema.json`). Rules:
 *
 *   - adding an optional field to the response is NOT a contract change: every
 *     adapter ignores fields it does not know;
 *   - removing a field, renaming one, or changing a field's type or meaning IS
 *     a change: bump this constant, publish a new schema, and keep the control
 *     API answering the previous version until no supported plugin speaks it.
 *
 * Every bundle request carries the version in `CONTRACT_VERSION_HEADER`, so the
 * control API can tell which shape the caller expects.
 */

/** The contract version this package speaks. */
export const EDGE_BUNDLE_CONTRACT_VERSION = 1;

/** The request header carrying `EDGE_BUNDLE_CONTRACT_VERSION`. */
export const CONTRACT_VERSION_HEADER = 'adsentinel-plugin-contract';
