/**
 * The static-build injection path: after a static (SSG) build, bake the current
 * serving tags into the `<head>` of every generated HTML file.
 *
 * Because the tags are baked at build time, a tag rotation on the control plane
 * is NOT picked up by an already-built site until it is rebuilt — the same
 * rebuild-on-rotation caveat the other build-time integrations carry. SSR
 * projects do not have this limitation: their middleware fetches per response.
 *
 * Fail-open throughout: a fetch failure or a null / inactive / empty bundle
 * injects nothing and logs a warning; a single unreadable file is skipped; the
 * build is never failed.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { fetchEdgeBundle, injectTagsIntoHtml, normaliseSiteHost, siteHostFromEnv } from '@adsentinel/plugin-core';
import type { PluginSettings } from '@adsentinel/plugin-core';

/** The slice of Astro's integration logger this path uses. */
export interface StaticInjectionLogger {
  info(message: string): void;
  warn(message: string): void;
}

export interface StaticInjectionParams {
  /** The client build output directory, as Astro's `astro:build:done` provides it. */
  dir: URL;
  /** The site's resolved settings. */
  settings: PluginSettings;
  /** Where to report what was (or was not) injected. */
  logger: StaticInjectionLogger;
  /** How to enumerate the HTML files under `dir`. Injectable for tests; defaults to a recursive walk. */
  listHtmlFiles?: (dir: URL) => Promise<string[]>;
}

/** Every `.html` file under `dir`, recursively, as absolute paths. */
export async function defaultListHtmlFiles(dir: URL): Promise<string[]> {
  const root = fileURLToPath(dir);
  const found: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith('.html')) found.push(full);
    }
  }
  await walk(root);
  return found;
}

/**
 * Fetch the bundle once and inject its tags into every built HTML page.
 *
 * Returns without changing anything (and warns) when there is no active bundle,
 * so a control-plane problem leaves a plain, working site rather than a failed
 * build.
 */
export async function injectTagsIntoStaticBuild(params: StaticInjectionParams): Promise<void> {
  const { dir, logger } = params;
  try {
    // A static build has no request: the public host must be configured.
    const siteHost = normaliseSiteHost(params.settings.siteHost) ?? siteHostFromEnv();
    if (!siteHost) {
      logger.warn('[adsentinel] no siteHost (option or ADSENTINEL_SITE_HOST) for the static build; injected nothing.');
      return;
    }
    const settings = { ...params.settings, siteHost };
    const bundle = await fetchEdgeBundle(settings);
    if (!bundle || !bundle.active || !bundle.tags) {
      logger.warn('[adsentinel] no active serving bundle; injected nothing into the static build.');
      return;
    }

    const listHtmlFiles = params.listHtmlFiles ?? defaultListHtmlFiles;
    const files = await listHtmlFiles(dir);
    let injected = 0;
    for (const file of files) {
      try {
        const html = await readFile(file, 'utf8');
        const next = injectTagsIntoHtml(html, bundle.tags);
        if (next !== html) {
          await writeFile(file, next);
          injected += 1;
        }
      } catch {
        // One unreadable or unwritable page must not fail the whole build.
      }
    }
    logger.info(`[adsentinel] injected serving tags into ${injected} page(s).`);
  } catch {
    logger.warn('[adsentinel] tag injection into the static build failed; injected nothing.');
  }
}
