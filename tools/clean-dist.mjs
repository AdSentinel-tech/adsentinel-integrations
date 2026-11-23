// Removes the current package's `dist/` before a build, so a deleted source
// file never lingers in a published tarball. Run from the package directory.
import { rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
