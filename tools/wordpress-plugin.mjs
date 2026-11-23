// Lints and packages the WordPress plugin in `wordpress/`.
//
//   node tools/wordpress-plugin.mjs lint     -> `php -l` on every PHP file, and the
//                                              plugin header / readme versions agree
//   node tools/wordpress-plugin.mjs package  -> artifacts/wordpress/adsentinel-wordpress-<version>.zip
//   node tools/wordpress-plugin.mjs version  -> prints the plugin version
//
// The zip holds one `adsentinel/` folder, the layout WordPress expects from an
// uploaded plugin. `php` is required in CI; locally the syntax check is skipped
// with a notice when PHP is not installed.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PLUGIN_DIR = resolve('wordpress');
const PLUGIN_SLUG = 'adsentinel';
const SHIPPED_FILES = ['adsentinel.php', 'readme.txt'];
const OUT_DIR = resolve('artifacts/wordpress');

/** The version in the plugin header, checked against the readme's `Stable tag`. */
function pluginVersion() {
  const header = readFileSync(join(PLUGIN_DIR, 'adsentinel.php'), 'utf8').match(/^\s*\*\s*Version:\s*(\S+)/m)?.[1];
  const stableTag = readFileSync(join(PLUGIN_DIR, 'readme.txt'), 'utf8').match(/^Stable tag:\s*(\S+)/m)?.[1];
  if (!header) throw new Error('adsentinel.php has no "Version:" header');
  if (header !== stableTag) throw new Error(`plugin header version ${header} differs from readme.txt "Stable tag: ${stableTag}"`);
  return header;
}

function lint() {
  const version = pluginVersion();
  const phpFiles = readdirSync(PLUGIN_DIR).filter((name) => name.endsWith('.php'));
  const hasPhp = spawnSync('php', ['--version'], { stdio: 'ignore' }).status === 0;
  if (!hasPhp) {
    if (process.env.CI) throw new Error('php is required in CI to lint the WordPress plugin');
    console.log('php not installed: syntax check skipped (it runs in CI).');
  } else {
    for (const file of phpFiles) execFileSync('php', ['-l', join(PLUGIN_DIR, file)], { stdio: 'inherit' });
  }
  console.log(`WordPress plugin ${version}: ${phpFiles.length} PHP file(s) checked.`);
}

function packageZip() {
  const version = pluginVersion();
  const staging = mkdtempSync(join(tmpdir(), 'adsentinel-wordpress-'));
  try {
    const folder = join(staging, PLUGIN_SLUG);
    mkdirSync(folder);
    for (const file of SHIPPED_FILES) cpSync(join(PLUGIN_DIR, file), join(folder, file));
    const license = resolve('wordpress/LICENSE');
    if (existsSync(license)) cpSync(license, join(folder, 'LICENSE'));
    mkdirSync(OUT_DIR, { recursive: true });
    const zipPath = join(OUT_DIR, `adsentinel-wordpress-${version}.zip`);
    rmSync(zipPath, { force: true });
    execFileSync('zip', ['-r', '-X', zipPath, PLUGIN_SLUG], { cwd: staging, stdio: 'ignore' });
    console.log(zipPath);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

const command = process.argv[2];
if (command === 'lint') lint();
else if (command === 'package') packageZip();
else if (command === 'version') console.log(pluginVersion());
else {
  console.error('usage: wordpress-plugin.mjs <lint|package|version>');
  process.exit(1);
}
