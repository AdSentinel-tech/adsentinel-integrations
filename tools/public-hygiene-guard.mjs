// Public hygiene guard: this repository is public, so every file in it must be
// free of internal names, local machine paths and non-English prose.
//
// Checks every tracked or to-be-tracked file (git ls-files, minus ignored ones):
//   - internal company / vendor names and domains (patterns below, any casing);
//   - absolute home-directory paths;
//   - French diacritics, as a cheap signal of non-English text.
//
// Exit code 1 with one line per hit. The patterns are assembled from fragments so
// this file never matches itself.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** The lowercase French accented letters, as code points (the rule is case-insensitive). */
const FRENCH_DIACRITICS = [0xe0, 0xe2, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xee, 0xef, 0xf4, 0xf9, 0xfb, 0xfc, 0xff, 0x153];

const RULES = [
  { name: 'internal company name', pattern: new RegExp(String.raw`\bd[-_ .]?bl` + String.raw`ocks?\b`, 'i') },
  { name: 'third-party vendor name', pattern: new RegExp(String.raw`ad[-_ .]?sh` + 'ield', 'i') },
  { name: 'third-party vendor domain', pattern: new RegExp(String.raw`html[-_.]?lo` + 'ad', 'i') },
  { name: 'retired product domain', pattern: new RegExp(String.raw`adsentinel\.` + 'io', 'i') },
  { name: 'absolute home path', pattern: new RegExp(String.raw`(^|[^\w.])/(home|Users)/[\w.-]+`) },
  { name: 'non-English text (French diacritics)', pattern: new RegExp(`[${String.fromCodePoint(...FRENCH_DIACRITICS)}]`, 'i') },
];

/** Binary files, which cannot carry prose. */
const SKIPPED = [/\.(png|jpe?g|gif|ico|zip|tgz|woff2?)$/i];

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((file) => file && !SKIPPED.some((skip) => skip.test(file)));

const hits = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // deleted in the working tree
  }
  // The file path itself counts too (a folder named after an internal module, say).
  for (const rule of RULES) if (rule.pattern.test(file)) hits.push(`${file}: path matches ${rule.name}`);
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      if (rule.pattern.test(line)) hits.push(`${file}:${index + 1}: ${rule.name}: ${line.trim().slice(0, 120)}`);
    }
  });
}

if (hits.length > 0) {
  console.error(`Public hygiene guard: ${hits.length} problem(s)\n` + hits.join('\n'));
  process.exit(1);
}
console.log(`Public hygiene guard: ${files.length} files clean.`);
