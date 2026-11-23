// Publishes the workspace packages to npm, from CI, with npm Trusted Publishing.
//
//   node tools/publish-packages.mjs [--tag <git tag>] [--dry-run]
//
// With `--tag @adsentinel/react@0.1.1` (the tag `nx release` creates), only that
// package is published, and only if its package.json version matches the tag.
// Without a tag, every package whose current version is not yet on npm is
// published, dependencies first (plugin-core before the adapters).
//
// The packages must already be built. Each is published from its own directory
// with `npm publish --provenance --access public`; the root LICENSE is copied in
// first so the tarball carries it. No token is read here: in GitHub Actions, npm
// exchanges the workflow's OIDC identity for a short-lived publish credential.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const tagIndex = args.indexOf('--tag');
const tag = tagIndex >= 0 ? args[tagIndex + 1] : undefined;

/** Publish order: plugin-core first, since every adapter depends on it. */
function workspacePackages() {
  const all = readdirSync('packages', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = join('packages', entry.name);
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      return { dir, name: manifest.name, version: manifest.version, private: manifest.private === true };
    })
    .filter((pkg) => !pkg.private);
  return all.sort((a, b) => Number(b.name.endsWith('/plugin-core')) - Number(a.name.endsWith('/plugin-core')));
}

function isOnNpm(name, version) {
  const result = spawnSync('npm', ['view', `${name}@${version}`, 'version'], { encoding: 'utf8' });
  return result.status === 0 && result.stdout.trim() === version;
}

let candidates = workspacePackages();
if (tag) {
  const at = tag.lastIndexOf('@');
  const name = tag.slice(0, at);
  const version = tag.slice(at + 1);
  candidates = candidates.filter((pkg) => pkg.name === name);
  if (candidates.length !== 1) throw new Error(`tag ${tag} names no workspace package`);
  if (candidates[0].version !== version) {
    throw new Error(`tag ${tag} does not match ${candidates[0].name}'s package.json version ${candidates[0].version}`);
  }
}

for (const pkg of candidates) {
  if (pkg.version === '0.0.0') {
    console.log(`skip ${pkg.name}: version 0.0.0 (never released; add a version plan)`);
    continue;
  }
  if (isOnNpm(pkg.name, pkg.version)) {
    console.log(`skip ${pkg.name}@${pkg.version}: already on npm`);
    continue;
  }
  copyFileSync('LICENSE', join(pkg.dir, 'LICENSE'));
  const publishArgs = ['publish', '--provenance', '--access', 'public'];
  if (dryRun) publishArgs.push('--dry-run');
  console.log(`publish ${pkg.name}@${pkg.version}${dryRun ? ' (dry run)' : ''}`);
  execFileSync('npm', publishArgs, { cwd: pkg.dir, stdio: 'inherit' });
}
