/**
 * Site host resolution: explicit `siteHost` (or `ADSENTINEL_SITE_HOST`) wins,
 * then the first `X-Forwarded-Host`, then `Host`; every value is normalised the
 * way the edge-bundle endpoint expects (lowercase, no port, no trailing dot).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normaliseSiteHost, resolveSiteHost, siteHostFromEnv, siteHostFromHeaders, SITE_HOST_ENV } from './site-host.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('normaliseSiteHost', () => {
  it('lowercases and strips the port and a trailing dot', () => {
    expect(normaliseSiteHost('WWW.Example.COM:8443')).toBe('www.example.com');
    expect(normaliseSiteHost('example.com.')).toBe('example.com');
  });

  it('keeps a leading www. (the control API drops it itself)', () => {
    expect(normaliseSiteHost('www.example.com')).toBe('www.example.com');
  });

  it('keeps the first value of a comma-separated header', () => {
    expect(normaliseSiteHost('www.example.com, upstream.internal')).toBe('www.example.com');
    expect(normaliseSiteHost(['www.example.com', 'other.example'])).toBe('www.example.com');
  });

  it('accepts a full URL', () => {
    expect(normaliseSiteHost('https://www.example.com/path?q=1')).toBe('www.example.com');
  });

  it('keeps an IPv6 literal intact while dropping its port', () => {
    expect(normaliseSiteHost('[::1]:3000')).toBe('[::1]');
  });

  it('returns undefined for empty input', () => {
    expect(normaliseSiteHost(undefined)).toBeUndefined();
    expect(normaliseSiteHost(null)).toBeUndefined();
    expect(normaliseSiteHost('  ')).toBeUndefined();
    expect(normaliseSiteHost([])).toBeUndefined();
  });
});

describe('resolveSiteHost', () => {
  it('prefers the explicit siteHost over both headers', () => {
    expect(resolveSiteHost({ siteHost: 'www.example.com', forwardedHost: 'proxy.example', host: 'upstream:3000' })).toBe(
      'www.example.com',
    );
  });

  it('uses X-Forwarded-Host when no siteHost is set', () => {
    expect(resolveSiteHost({ forwardedHost: 'www.example.com', host: 'upstream:3000' })).toBe('www.example.com');
  });

  it('falls back to Host', () => {
    expect(resolveSiteHost({ host: 'Example.com:3000' })).toBe('example.com');
  });
});

describe('siteHostFromHeaders', () => {
  it('reads Node-style headers: forwarded host first', () => {
    expect(siteHostFromHeaders({ host: 'upstream:3000', 'x-forwarded-host': 'www.example.com' })).toBe('www.example.com');
  });

  it('reads Fetch Headers: plain host', () => {
    expect(siteHostFromHeaders(new Headers({ host: 'www.example.com' }))).toBe('www.example.com');
  });

  it('uses the explicit siteHost over the headers', () => {
    expect(siteHostFromHeaders({ host: 'upstream', 'x-forwarded-host': 'proxy.example' }, 'WWW.Example.com')).toBe('www.example.com');
  });

  it('uses ADSENTINEL_SITE_HOST when no siteHost is passed', () => {
    vi.stubEnv(SITE_HOST_ENV, 'www.example.com');
    expect(siteHostFromEnv()).toBe('www.example.com');
    expect(siteHostFromHeaders({ host: 'upstream', 'x-forwarded-host': 'proxy.example' })).toBe('www.example.com');
  });

  it('lets an explicit siteHost win over ADSENTINEL_SITE_HOST', () => {
    vi.stubEnv(SITE_HOST_ENV, 'env.example');
    expect(siteHostFromHeaders({ host: 'upstream' }, 'option.example')).toBe('option.example');
  });

  it('returns undefined with no headers and nothing configured', () => {
    expect(siteHostFromHeaders(undefined)).toBeUndefined();
  });
});
