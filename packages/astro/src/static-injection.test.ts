/**
 * `injectTagsIntoStaticBuild` bakes the tags into every built HTML page that has
 * a `<head>` when the bundle is active, and changes nothing — never throwing —
 * when the bundle is null, inactive or empty.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { injectTagsIntoStaticBuild } from './static-injection.js';
import type { StaticInjectionLogger } from './static-injection.js';
import type { EdgeBundle, PluginSettings } from '@adsentinel/plugin-core';

const TAGS = '<script data-adsentinel="loader"></script>';

function bundle(overrides: Partial<EdgeBundle> = {}): EdgeBundle {
  return {
    host: 'example.com',
    active: true,
    generation: 1,
    mode: 'first-party',
    origin: 'https://example.com',
    servingHost: 'example.com',
    routePrefixes: ['abc'],
    ownPaths: ['/sdk.js'],
    tagId: 'tag',
    markerPrefix: 'as',
    tags: TAGS,
    ttlSeconds: 300,
    ...overrides,
  };
}

function fetchReturning(body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
}

function settingsWith(fetchImpl: typeof fetch): PluginSettings {
  return { controlOrigin: 'https://page-kit.io', apiId: 'id', apiKey: 'key', siteHost: 'example.com', fetchImpl };
}

function recordingLogger(): StaticInjectionLogger & { infos: string[]; warns: string[] } {
  const infos: string[] = [];
  const warns: string[] = [];
  return { infos, warns, info: (m) => infos.push(m), warn: (m) => warns.push(m) };
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'adsentinel-astro-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const PAGE_WITH_HEAD = '<!doctype html><html><head><title>Home</title></head><body>x</body></html>';
const PAGE_NO_HEAD = '<html><body>no head here</body></html>';

async function seedPages(): Promise<void> {
  await writeFile(join(dir, 'index.html'), PAGE_WITH_HEAD);
  await mkdir(join(dir, 'about'), { recursive: true });
  await writeFile(join(dir, 'about', 'index.html'), PAGE_WITH_HEAD);
  await writeFile(join(dir, 'empty.html'), PAGE_NO_HEAD);
}

describe('injectTagsIntoStaticBuild', () => {
  it('bakes the tags into every page with a <head>, recursively', async () => {
    await seedPages();
    const logger = recordingLogger();
    await injectTagsIntoStaticBuild({ dir: pathToFileURL(dir + '/'), settings: settingsWith(fetchReturning(bundle())), logger });

    expect(await readFile(join(dir, 'index.html'), 'utf8')).toBe(
      `<!doctype html><html><head>${TAGS}<title>Home</title></head><body>x</body></html>`,
    );
    expect(await readFile(join(dir, 'about', 'index.html'), 'utf8')).toBe(
      `<!doctype html><html><head>${TAGS}<title>Home</title></head><body>x</body></html>`,
    );
    // No <head>: left untouched, counted as not injected.
    expect(await readFile(join(dir, 'empty.html'), 'utf8')).toBe(PAGE_NO_HEAD);
    expect(logger.infos.join(' ')).toContain('2 page(s)');
  });

  it('changes nothing and warns when the bundle is inactive', async () => {
    await seedPages();
    const logger = recordingLogger();
    await injectTagsIntoStaticBuild({ dir: pathToFileURL(dir + '/'), settings: settingsWith(fetchReturning(bundle({ active: false }))), logger });

    expect(await readFile(join(dir, 'index.html'), 'utf8')).toBe(PAGE_WITH_HEAD);
    expect(logger.warns.length).toBe(1);
    expect(logger.infos.length).toBe(0);
  });

  it('changes nothing and warns when the bundle has empty tags', async () => {
    await seedPages();
    const logger = recordingLogger();
    await injectTagsIntoStaticBuild({ dir: pathToFileURL(dir + '/'), settings: settingsWith(fetchReturning(bundle({ tags: '' }))), logger });

    expect(await readFile(join(dir, 'index.html'), 'utf8')).toBe(PAGE_WITH_HEAD);
    expect(logger.warns.length).toBe(1);
  });

  it('changes nothing and warns, never throwing, when the fetch fails', async () => {
    await seedPages();
    const logger = recordingLogger();
    const failing = (async () => {
      throw new Error('control plane down');
    }) as unknown as typeof fetch;

    await expect(
      injectTagsIntoStaticBuild({ dir: pathToFileURL(dir + '/'), settings: settingsWith(failing), logger }),
    ).resolves.toBeUndefined();

    expect(await readFile(join(dir, 'index.html'), 'utf8')).toBe(PAGE_WITH_HEAD);
    expect(logger.warns.length).toBe(1);
  });
});

describe('injectTagsIntoStaticBuild site host', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends the explicit siteHost, normalised', async () => {
    const fetchImpl = fetchReturning(bundle());
    await injectTagsIntoStaticBuild({
      dir: pathToFileURL(dir + '/'),
      settings: { ...settingsWith(fetchImpl), siteHost: 'WWW.Example.com:443' },
      logger: recordingLogger(),
      listHtmlFiles: async () => [],
    });
    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(new URL(url).searchParams.get('host')).toBe('www.example.com');
  });

  it('falls back to ADSENTINEL_SITE_HOST', async () => {
    vi.stubEnv('ADSENTINEL_SITE_HOST', 'www.example.com');
    const fetchImpl = fetchReturning(bundle());
    await injectTagsIntoStaticBuild({
      dir: pathToFileURL(dir + '/'),
      settings: { ...settingsWith(fetchImpl), siteHost: undefined },
      logger: recordingLogger(),
      listHtmlFiles: async () => [],
    });
    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(new URL(url).searchParams.get('host')).toBe('www.example.com');
  });

  it('injects nothing and warns when no host is configured', async () => {
    const fetchImpl = fetchReturning(bundle());
    const logger = recordingLogger();
    await injectTagsIntoStaticBuild({
      dir: pathToFileURL(dir + '/'),
      settings: { ...settingsWith(fetchImpl), siteHost: undefined },
      logger,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(logger.warns.join(' ')).toContain('siteHost');
  });
});
