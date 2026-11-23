/**
 * `AdSentinelPlugin` injects the serving tags into the emitted HTML, through
 * HtmlWebpackPlugin's `beforeEmit` hook when present and the emitted HTML asset
 * otherwise, and fails open on every bad-bundle path — null, inactive, empty or
 * a fetch error — without ever throwing or failing the build.
 *
 * The compiler, compilation and HtmlWebpackPlugin here are hand-rolled fakes:
 * the plugin only touches a small, well-defined slice of the Webpack API, and
 * faking it keeps the test a pure unit with no bundler run and no network.
 */
import { describe, it, expect, vi } from 'vitest';
import { AdSentinelPlugin } from './plugin.js';
import type { EdgeBundle } from '@adsentinel/plugin-core';
import type { Compiler } from 'webpack';

const TAGS = '<script src="/sdk.js"></script><script>window.__as=1</script>';

const BUNDLE: EdgeBundle = {
  host: 'example.com',
  active: true,
  generation: 3,
  mode: 'first-party',
  origin: 'https://example.com',
  servingHost: 'example.com',
  routePrefixes: ['abc'],
  ownPaths: ['/sdk.js'],
  tagId: 'tag-123',
  markerPrefix: 'as',
  tags: TAGS,
  ttlSeconds: 300,
};

const HTML = '<!doctype html><html><head><title>Hi</title></head><body>x</body></html>';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A fetch that always yields `body`, counting its calls so memoisation is observable. */
function fetchReturning(body: unknown, status = 200) {
  return vi.fn(async () => jsonResponse(body, status)) as unknown as typeof fetch;
}

// --- Minimal fakes of the Webpack surface the plugin uses ------------------

class FakeWaterfallHook<T> {
  private fn?: (data: T) => Promise<T>;
  tapPromise(_name: string, fn: (data: T) => Promise<T>): void {
    this.fn = fn;
  }
  call(data: T): Promise<T> {
    return this.fn ? this.fn(data) : Promise.resolve(data);
  }
  get tapped(): boolean {
    return this.fn !== undefined;
  }
}

class FakeProcessAssetsHook {
  private fn?: () => Promise<void>;
  tapPromise(_options: unknown, fn: () => Promise<void>): void {
    this.fn = fn;
  }
  async call(): Promise<void> {
    if (this.fn) await this.fn();
  }
  get tapped(): boolean {
    return this.fn !== undefined;
  }
}

class FakeSyncHook<T> {
  private fn?: (arg: T) => void;
  tap(_name: string, fn: (arg: T) => void): void {
    this.fn = fn;
  }
  call(arg: T): void {
    this.fn?.(arg);
  }
}

class RawSource {
  constructor(private readonly value: string) {}
  source(): string {
    return this.value;
  }
}

class WebpackError extends Error {}

const webpack = {
  Compilation: { PROCESS_ASSETS_STAGE_OPTIMIZE_INLINE: 10 },
  sources: { RawSource },
  WebpackError,
};

interface HtmlBeforeEmitData {
  html: string;
  outputName: string;
  plugin: unknown;
}

/** Build a fake HtmlWebpackPlugin instance whose static `getHooks` returns `hooks`. */
function htmlWebpackPluginInstance(beforeEmit: FakeWaterfallHook<HtmlBeforeEmitData>): object {
  class HtmlWebpackPlugin {
    static getHooks() {
      return { beforeEmit };
    }
  }
  return new HtmlWebpackPlugin();
}

interface FakeCompilation {
  hooks: { processAssets: FakeProcessAssetsHook };
  warnings: Error[];
  compiler: { webpack: typeof webpack };
  assets: Record<string, RawSource>;
  getAsset(name: string): { name: string; source: RawSource } | undefined;
  updateAsset(name: string, source: RawSource): void;
}

function makeCompilation(assets: Record<string, string> = {}): FakeCompilation {
  const store: Record<string, RawSource> = {};
  for (const [name, html] of Object.entries(assets)) store[name] = new RawSource(html);
  return {
    hooks: { processAssets: new FakeProcessAssetsHook() },
    warnings: [],
    compiler: { webpack },
    assets: store,
    getAsset(name) {
      return store[name] ? { name, source: store[name] } : undefined;
    },
    updateAsset(name, source) {
      store[name] = source;
    },
  };
}

function makeCompiler(plugins: object[]): {
  compiler: Compiler;
  compilationHook: FakeSyncHook<FakeCompilation>;
} {
  const compilationHook = new FakeSyncHook<FakeCompilation>();
  const compiler = {
    hooks: { compilation: compilationHook },
    options: { plugins },
    webpack,
  };
  return { compiler: compiler as unknown as Compiler, compilationHook };
}

/** Run the plugin against a build that uses HtmlWebpackPlugin, returning the injected HTML and the compilation. */
async function runWithHtmlWebpackPlugin(
  plugin: AdSentinelPlugin,
  htmlInputs: string[] = [HTML],
): Promise<{ outputs: string[]; compilation: FakeCompilation; beforeEmit: FakeWaterfallHook<HtmlBeforeEmitData> }> {
  const beforeEmit = new FakeWaterfallHook<HtmlBeforeEmitData>();
  const { compiler, compilationHook } = makeCompiler([htmlWebpackPluginInstance(beforeEmit)]);
  plugin.apply(compiler);
  const compilation = makeCompilation();
  compilationHook.call(compilation);
  const outputs: string[] = [];
  for (const [i, html] of htmlInputs.entries()) {
    const result = await beforeEmit.call({ html, outputName: `page-${i}.html`, plugin: null });
    outputs.push(result.html);
  }
  return { outputs, compilation, beforeEmit };
}

// --- Tests -----------------------------------------------------------------

describe('AdSentinelPlugin with HtmlWebpackPlugin (beforeEmit)', () => {
  it('injects the tags into <head> when the bundle is active', async () => {
    const plugin = new AdSentinelPlugin({
      apiId: 'id',
      apiKey: 'key',
      siteHost: 'example.com',
      fetchImpl: fetchReturning(BUNDLE),
    });
    const { outputs, compilation } = await runWithHtmlWebpackPlugin(plugin);
    expect(outputs[0]).toBe(
      '<!doctype html><html><head>' + TAGS + '<title>Hi</title></head><body>x</body></html>',
    );
    expect(compilation.warnings).toHaveLength(0);
  });

  it('leaves the html unchanged and warns once when the bundle is null (bad credentials)', async () => {
    const plugin = new AdSentinelPlugin({
      apiId: 'id',
      apiKey: 'key',
      siteHost: 'example.com',
      fetchImpl: fetchReturning({ error: 'unauthorized' }, 403),
    });
    const { outputs, compilation } = await runWithHtmlWebpackPlugin(plugin);
    expect(outputs[0]).toBe(HTML);
    expect(compilation.warnings).toHaveLength(1);
  });

  it('leaves the html unchanged and warns when the site is inactive', async () => {
    const plugin = new AdSentinelPlugin({
      apiId: 'id',
      apiKey: 'key',
      siteHost: 'example.com',
      fetchImpl: fetchReturning({ ...BUNDLE, active: false, tags: '' }),
    });
    const { outputs, compilation } = await runWithHtmlWebpackPlugin(plugin);
    expect(outputs[0]).toBe(HTML);
    expect(compilation.warnings).toHaveLength(1);
  });

  it('leaves the html unchanged and warns when the bundle carries no tags', async () => {
    const plugin = new AdSentinelPlugin({
      apiId: 'id',
      apiKey: 'key',
      siteHost: 'example.com',
      fetchImpl: fetchReturning({ ...BUNDLE, tags: '' }),
    });
    const { outputs, compilation } = await runWithHtmlWebpackPlugin(plugin);
    expect(outputs[0]).toBe(HTML);
    expect(compilation.warnings).toHaveLength(1);
  });

  it('never throws and fails open when the fetch itself throws', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const plugin = new AdSentinelPlugin({ apiId: 'id', apiKey: 'key', siteHost: 'example.com', fetchImpl });
    const run = runWithHtmlWebpackPlugin(plugin);
    await expect(run).resolves.toBeDefined();
    const { outputs, compilation } = await run;
    expect(outputs[0]).toBe(HTML);
    expect(compilation.warnings).toHaveLength(1);
  });

  it('fetches the bundle only once and warns once across several HTML files', async () => {
    const fetchImpl = fetchReturning({ error: 'boom' }, 500);
    const plugin = new AdSentinelPlugin({ apiId: 'id', apiKey: 'key', siteHost: 'example.com', fetchImpl });
    const { outputs, compilation } = await runWithHtmlWebpackPlugin(plugin, [HTML, HTML, HTML]);
    expect(outputs).toEqual([HTML, HTML, HTML]);
    expect(fetchImpl as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
    expect(compilation.warnings).toHaveLength(1);
  });
});

describe('AdSentinelPlugin without HtmlWebpackPlugin (processAssets fallback)', () => {
  it('rewrites each emitted *.html asset when the bundle is active', async () => {
    const plugin = new AdSentinelPlugin({
      apiId: 'id',
      apiKey: 'key',
      siteHost: 'example.com',
      fetchImpl: fetchReturning(BUNDLE),
    });
    const { compiler, compilationHook } = makeCompiler([]);
    plugin.apply(compiler);
    const compilation = makeCompilation({ 'index.html': HTML, 'app.js': 'console.log(1)' });
    compilationHook.call(compilation);
    expect(compilation.hooks.processAssets.tapped).toBe(true);
    await compilation.hooks.processAssets.call();

    expect(compilation.getAsset('index.html')!.source.source()).toBe(
      '<!doctype html><html><head>' + TAGS + '<title>Hi</title></head><body>x</body></html>',
    );
    // A non-HTML asset is untouched.
    expect(compilation.getAsset('app.js')!.source.source()).toBe('console.log(1)');
    expect(compilation.warnings).toHaveLength(0);
  });

  it('leaves the html asset unchanged and warns when the bundle is null', async () => {
    const plugin = new AdSentinelPlugin({
      apiId: 'id',
      apiKey: 'key',
      siteHost: 'example.com',
      fetchImpl: fetchReturning({ error: 'nope' }, 403),
    });
    const { compiler, compilationHook } = makeCompiler([]);
    plugin.apply(compiler);
    const compilation = makeCompilation({ 'index.html': HTML });
    compilationHook.call(compilation);
    await compilation.hooks.processAssets.call();

    expect(compilation.getAsset('index.html')!.source.source()).toBe(HTML);
    expect(compilation.warnings).toHaveLength(1);
  });
});
