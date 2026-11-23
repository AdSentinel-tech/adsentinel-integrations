/**
 * `<AdSentinelTags>` — an async React Server Component that emits a site's two
 * serving tags into the document `<head>`, for the Next.js App Router.
 *
 * The App Router gives no hook to post-process the HTML string, so the tags must
 * travel through the React tree. They arrive as one opaque HTML string (two
 * `<script>` elements, built by the control API) that must not be parsed or
 * split, so the component writes it verbatim with `dangerouslySetInnerHTML`
 * onto a `<head>` element.
 *
 * Why that is hydration-safe and why the scripts run:
 *   - A Server Component is never hydrated on the client — its output is sent as
 *     HTML and reconciled from the RSC payload, never re-rendered as client
 *     JavaScript — so `dangerouslySetInnerHTML` here cannot raise a hydration
 *     mismatch the way it could from a Client Component.
 *   - The tags reach the browser inside the server-sent HTML, so the parser
 *     inserts them and runs them on first load. (Only scripts assigned through
 *     `element.innerHTML` *after* load are inert; parser-inserted ones execute.)
 *
 * Fail-open: a null/inactive/empty bundle yields no tags, and the component
 * renders `null` — nothing in the tree, nothing thrown into the host render.
 *
 * The implementation uses `createElement` rather than JSX on purpose: the package
 * compiles with plain `tsc`, no JSX transform and no JSX settings to keep in step
 * with the host app. Host apps still consume
 * it as ordinary JSX — `<AdSentinelTags settings={…} />` — see README.md.
 */
import { createElement } from 'react';
import type { ReactElement } from 'react';
import type { PluginSettings } from '@adsentinel/plugin-core';
import { getAdSentinelTags } from './get-tags.js';

export interface AdSentinelTagsProps {
  /** How to reach the control API for this site (origin + credentials + host). */
  settings: PluginSettings;
}

/**
 * Resolves the site's tags, then renders them into `<head>` — or renders
 * nothing when there are none. Returns a Promise, so it is used as an async
 * Server Component: `<AdSentinelTags settings={…} />`.
 */
export async function AdSentinelTags({ settings }: AdSentinelTagsProps): Promise<ReactElement | null> {
  const tags = await getAdSentinelTags(settings);
  if (!tags) return null;
  return createElement('head', { dangerouslySetInnerHTML: { __html: tags } });
}
