// #1028 (M2): the retired emoji must not creep back into app source.
// LOIS kaomoji files are exempt; FE0F (emoji presentation) counts as a miss anywhere.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RETIRED = [0x1F3A4, 0x2699, 0x1F50A, 0x1F509, 0x1F3B2, 0x1F512, 0x1F513, 0xFE0F];
const EXEMPT = new Set(['LoisPill.jsx', 'loisFace.js']);
const EXT = /\.(jsx?|mjs|css)$/;

const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

const misses = [];
for (const p of walk(new URL('..', import.meta.url).pathname)) {
  const name = p.split('/').pop();
  if (!EXT.test(name) || name.endsWith('.selfcheck.mjs') || EXEMPT.has(name)) continue;
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    for (const ch of line) if (RETIRED.includes(ch.codePointAt(0))) misses.push(`${p}:${i + 1} U+${ch.codePointAt(0).toString(16)}`);
  });
}
if (misses.length) { console.error('retired emoji found:\n' + misses.join('\n')); process.exit(1); }
console.log('retiredEmoji.selfcheck: ok');
