/**
 * `isOwnPath` is the same inclusion test as the edge's `isOurPath`: a route
 * prefix as the first segment, or one of our own endpoint paths.
 */
import { describe, it, expect } from 'vitest';
import { isOwnPath } from './own-path.js';

const BUNDLE = {
  routePrefixes: ['abc', 'def'],
  ownPaths: ['/sdk.js', '/s/', '/report', '/script/'],
};

describe('isOwnPath', () => {
  it('matches a route prefix as the first path segment', () => {
    expect(isOwnPath('/abc/encoded/thing', BUNDLE)).toBe(true);
    expect(isOwnPath('/def/x', BUNDLE)).toBe(true);
  });

  it('matches a trailing-slash own path by prefix', () => {
    expect(isOwnPath('/s/anything/here', BUNDLE)).toBe(true);
    expect(isOwnPath('/script/runtime.js', BUNDLE)).toBe(true);
  });

  it('matches a bare own path by equality', () => {
    expect(isOwnPath('/sdk.js', BUNDLE)).toBe(true);
    expect(isOwnPath('/report', BUNDLE)).toBe(true);
  });

  it('matches a bare own path followed by a query string', () => {
    expect(isOwnPath('/report?x=1', BUNDLE)).toBe(true);
  });

  it('does not match a foreign path', () => {
    expect(isOwnPath('/index.html', BUNDLE)).toBe(false);
    expect(isOwnPath('/abcdef/x', BUNDLE)).toBe(false); // first segment is "abcdef", not a prefix
    expect(isOwnPath('/reporting', BUNDLE)).toBe(false); // not equal to "/report" and no query
  });
});
