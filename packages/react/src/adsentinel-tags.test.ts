/**
 * `<AdSentinelTags>` emits the serving tags into `<head>` when the site is
 * active, renders nothing when it is not, and never throws into the host render.
 *
 * The component is async (a Server Component), so the tests await it directly to
 * get its element — the way an RSC is unit-tested without a full server renderer
 * — then assert the element and a real server-rendered HTML string. No JSX in
 * this file: the element is inspected via `react-dom/server`, so the suite stays
 * a plain `*.test.ts` collected by the `libs` project.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { EdgeBundle, PluginSettings } from '@adsentinel/plugin-core';
import { AdSentinelTags } from './adsentinel-tags.js';

const TAGS = '<script src="https://page-kit.io/sdk.js"></script><script src="https://page-kit.io/cfg.js"></script>';

function bundle(overrides: Partial<EdgeBundle> = {}): EdgeBundle {
  return {
    host: 'example.com',
    active: true,
    generation: 1,
    mode: 'first-party',
    origin: 'https://example.com',
    servingHost: 'page-kit.io',
    routePrefixes: ['/plugin-support/'],
    ownPaths: [],
    tagId: 'tag_1',
    markerPrefix: 'as',
    tags: TAGS,
    ttlSeconds: 300,
    ...overrides,
  };
}

function fakeFetch(body: unknown, ok = true): typeof fetch {
  return (async () => ({ ok, json: async () => body }) as Response) as unknown as typeof fetch;
}

const settings = (fetchImpl: typeof fetch): PluginSettings => ({
  controlOrigin: 'https://page-kit.io',
  apiId: 'id',
  apiKey: 'key',
  siteHost: 'example.com',
  fetchImpl,
});

describe('AdSentinelTags', () => {
  it('renders the tags verbatim into <head> when the bundle is active', async () => {
    const element = await AdSentinelTags({ settings: settings(fakeFetch(bundle())) });
    expect(element).not.toBeNull();
    const html = renderToStaticMarkup(element);
    // The opaque tags string is written out byte-for-byte, inside <head>.
    expect(html).toBe(`<head>${TAGS}</head>`);
    expect(html).toContain(TAGS);
  });

  it('renders nothing when the bundle is null (fail-open)', async () => {
    const throwing = (() => {
      throw new Error('control plane down');
    }) as unknown as typeof fetch;
    const element = await AdSentinelTags({ settings: settings(throwing) });
    expect(element).toBeNull();
    expect(renderToStaticMarkup(element)).toBe('');
  });

  it('renders nothing when the site is inactive', async () => {
    const element = await AdSentinelTags({ settings: settings(fakeFetch(bundle({ active: false }))) });
    expect(element).toBeNull();
    expect(renderToStaticMarkup(element)).toBe('');
  });

  it('renders nothing when the tags are empty', async () => {
    const element = await AdSentinelTags({ settings: settings(fakeFetch(bundle({ tags: '' }))) });
    expect(element).toBeNull();
    expect(renderToStaticMarkup(element)).toBe('');
  });

  it('does not throw when the response is malformed (fail-open)', async () => {
    const element = await AdSentinelTags({ settings: settings(fakeFetch('not a bundle')) });
    expect(element).toBeNull();
  });
});
