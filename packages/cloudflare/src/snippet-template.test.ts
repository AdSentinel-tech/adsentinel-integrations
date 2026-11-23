/**
 * The built Snippet template: the placeholder appears exactly once, and
 * `renderSnippet` bakes a site's settings in as a JSON object literal.
 * Runs against `dist/` (the package is built before its tests).
 */
import { describe, it, expect } from 'vitest';
import { renderSnippet, SNIPPET_SETTINGS_PLACEHOLDER, SNIPPET_SIZE_LIMIT, SNIPPET_TEMPLATE } from '../dist/snippet-template.js';

const SETTINGS = { controlOrigin: 'https://page-kit.io', apiId: 'as_id', apiKey: 'k$&ey', siteHost: 'www.example.com' };

describe('snippet template', () => {
  it('contains the placeholder exactly once and fits the Snippet limit', () => {
    expect(SNIPPET_TEMPLATE.split(SNIPPET_SETTINGS_PLACEHOLDER).length - 1).toBe(1);
    expect(SNIPPET_TEMPLATE.length).toBeLessThan(SNIPPET_SIZE_LIMIT);
  });

  it('bakes the settings in verbatim, even with replacement-pattern characters', () => {
    const snippet = renderSnippet(SETTINGS);
    expect(snippet).not.toContain(SNIPPET_SETTINGS_PLACEHOLDER);
    expect(snippet).toContain(JSON.stringify(SETTINGS));
  });
});
