/**
 * The JSON Schema of `EdgeBundle`, the response of
 * `GET /plugin-support/edge-bundle`.
 *
 * This object is the single source of the schema: the build writes it verbatim
 * to `dist/edge-bundle.schema.json` (exported as
 * `@adsentinel/plugin-core/edge-bundle.schema.json`), so a server-side contract
 * test can validate the control API's real answer against the version of the
 * schema a given plugin release ships.
 *
 * Extra properties are allowed on purpose: adding a field is not a contract
 * change (see `contract.ts`).
 */
import { EDGE_BUNDLE_CONTRACT_VERSION } from './contract.js';

export const EDGE_BUNDLE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `urn:adsentinel:plugin-contract:v${EDGE_BUNDLE_CONTRACT_VERSION}:edge-bundle`,
  title: 'EdgeBundle',
  description: 'The serving manifest the control API returns for one site from GET /plugin-support/edge-bundle.',
  'x-contract-version': EDGE_BUNDLE_CONTRACT_VERSION,
  type: 'object',
  required: [
    'host',
    'active',
    'generation',
    'mode',
    'origin',
    'servingHost',
    'routePrefixes',
    'ownPaths',
    'tagId',
    'markerPrefix',
    'tags',
    'ttlSeconds',
  ],
  additionalProperties: true,
  properties: {
    host: { type: 'string', minLength: 1, description: "The site's normalized domain." },
    active: { type: 'boolean', description: 'Whether serving is live for the site. An inactive site gets empty tags.' },
    generation: { type: 'integer', minimum: 0, description: "The serving generation; changes whenever the site's tags are re-rolled." },
    mode: { enum: ['hosted', 'first-party'], description: "How the site is served: from the shared serving host, or from the publisher's own host." },
    origin: { type: 'string', minLength: 1, description: "The site's origin, e.g. https://www.example.com." },
    servingHost: { type: 'string', minLength: 1, description: 'The host the tags load from.' },
    routePrefixes: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      description: 'A request whose first path segment is one of these belongs to AdSentinel and is relayed.',
    },
    ownPaths: {
      type: 'array',
      items: { type: 'string', pattern: '^/' },
      description: "AdSentinel's own endpoint paths: a trailing-slash entry matches by prefix, a bare one by equality.",
    },
    tagId: { type: ['string', 'null'], description: 'The id of the current tag pair, or null when inactive.' },
    markerPrefix: { type: ['string', 'null'], description: 'The marker prefix the tags use, or null when inactive.' },
    tags: { type: 'string', description: 'The ready-made HTML of the two script tags, or an empty string when inactive.' },
    ttlSeconds: { type: 'integer', minimum: 1, description: 'How long the bundle may be cached, in seconds.' },
  },
} as const;
