/**
 * The shapes a framework adapter talks to.
 *
 * `EdgeBundle` mirrors the JSON the control API returns from
 * `GET /plugin-support/edge-bundle?host=<site host>`, where `tags` is a
 * ready-made HTML string of the two script tags (empty when the site is
 * inactive). The same shape is published as a JSON Schema,
 * `@adsentinel/plugin-core/edge-bundle.schema.json`, versioned by
 * `EDGE_BUNDLE_CONTRACT_VERSION`.
 */

/** What an adapter supplies to reach the control API for one site. */
export interface PluginSettings {
  /** The control / serving origin, e.g. `https://page-kit.io`. */
  controlOrigin: string;
  /** The site's plugin credentials (console -> Domain -> Serving). */
  apiId: string;
  apiKey: string;
  /** The host the bundle is asked for. The control API requires it; adapters pass the page's host. */
  siteHost?: string;
  /** The fetch to use; defaults to the global `fetch`. Injectable so tests need no network. */
  fetchImpl?: typeof fetch;
}

/** How the site is served: from the shared serving host, or from the publisher's own host. */
export type ServingMode = 'hosted' | 'first-party';

/** The manifest the control API returns for a site. */
export interface EdgeBundle {
  /** The site's normalized domain. */
  host: string;
  /** Whether serving is live for the site. An inactive site gets empty `tags`. */
  active: boolean;
  /** The serving generation; changes whenever the site's tags are re-rolled. */
  generation: number;
  mode: ServingMode;
  /** The site's origin, e.g. `https://www.example.com`. */
  origin: string;
  /** The host the tags load from. For a first-party site, the publisher's own host. */
  servingHost: string;
  /** A request whose first path segment is one of these belongs to AdSentinel and is relayed. */
  routePrefixes: string[];
  /** AdSentinel's own endpoint paths: a trailing-slash entry matches by prefix, a bare one by equality. */
  ownPaths: string[];
  /** The id of the current tag pair, or null when inactive. */
  tagId: string | null;
  /** The marker prefix the tags use, or null when inactive. */
  markerPrefix: string | null;
  /** The ready-made HTML of the two script tags, or an empty string when inactive. */
  tags: string;
  /** How long the bundle may be cached, in seconds. */
  ttlSeconds: number;
}

/** A stale-while-revalidate holder of a site's bundle. */
export interface BundleCache {
  /** The current bundle: fresh within its TTL, else the last good one while a refresh runs, else null. */
  get(): Promise<EdgeBundle | null>;
}
