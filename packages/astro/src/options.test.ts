/**
 * `resolveSettings` fills the hosted control origin by default and passes the
 * credentials and host through unchanged.
 */
import { describe, it, expect } from 'vitest';
import { resolveSettings, DEFAULT_CONTROL_ORIGIN } from './options.js';

describe('resolveSettings', () => {
  it('defaults controlOrigin to the hosted serving origin', () => {
    const settings = resolveSettings({ apiId: 'id', apiKey: 'key', siteHost: 'example.com' });
    expect(settings).toEqual({
      controlOrigin: DEFAULT_CONTROL_ORIGIN,
      apiId: 'id',
      apiKey: 'key',
      siteHost: 'example.com',
    });
  });

  it('keeps an explicit controlOrigin', () => {
    const settings = resolveSettings({ controlOrigin: 'https://first-party.example', apiId: 'id', apiKey: 'key', siteHost: 'example.com' });
    expect(settings.controlOrigin).toBe('https://first-party.example');
  });
});
