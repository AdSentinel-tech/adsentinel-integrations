/**
 * `injectTagsIntoHtml` prepends the tags at the start of `<head>` and is a
 * no-op on empty tags or a document with no head.
 */
import { describe, it, expect } from 'vitest';
import { injectTagsIntoHtml } from './inject-tags.js';

const TAGS = '<script src="/sdk.js"></script>';

describe('injectTagsIntoHtml', () => {
  it('prepends the tags right after the opening <head>, before existing children', () => {
    const html = '<!doctype html><html><head><title>Hi</title></head><body>x</body></html>';
    expect(injectTagsIntoHtml(html, TAGS)).toBe(
      '<!doctype html><html><head><script src="/sdk.js"></script><title>Hi</title></head><body>x</body></html>',
    );
  });

  it('keeps head attributes and inserts after the opening tag', () => {
    const html = '<head lang="en" data-x>content</head>';
    expect(injectTagsIntoHtml(html, TAGS)).toBe('<head lang="en" data-x><script src="/sdk.js"></script>content</head>');
  });

  it('matches the head tag case-insensitively', () => {
    const html = '<HTML><HEAD><TITLE>Hi</TITLE></HEAD></HTML>';
    expect(injectTagsIntoHtml(html, TAGS)).toBe('<HTML><HEAD><script src="/sdk.js"></script><TITLE>Hi</TITLE></HEAD></HTML>');
  });

  it('returns the html unchanged when tags is empty', () => {
    const html = '<head></head>';
    expect(injectTagsIntoHtml(html, '')).toBe(html);
  });

  it('returns the html unchanged when there is no head', () => {
    const html = '<html><body>no head here</body></html>';
    expect(injectTagsIntoHtml(html, TAGS)).toBe(html);
  });
});
