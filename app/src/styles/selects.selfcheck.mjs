// #1033 (M8): one dropdown style. The `select` element rule in tokens.css is the only place
// a select gets its background, border or font. Layout-only overrides (min-height, flex,
// grid-column, max-width, margin, width) are fine.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const SRC = new URL('..', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

let baseRules = 0;
const bad = [];
for (const p of walk(join(SRC, 'styles')).filter((f) => f.endsWith('.css'))) {
  for (const m of strip(readFileSync(p, 'utf8')).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    const selects = sel.split(',').map((s) => s.trim()).filter((s) => /(^|[\s>+~])select(?![\w-])|-select\b/.test(s));
    if (!selects.length) continue;
    if (sel === 'select') { baseRules += 1; continue; }
    if (/^select[:\w-]*$/.test(sel)) continue; // select:hover / :focus-visible / :disabled
    if (/(^|;|\s)(background|border|font|font-size|color)\s*:/.test(m[2])) bad.push(`${sel} restyles a select`);
  }
}
assert.equal(baseRules, 1, 'exactly one `select {}` base rule');
for (const p of walk(SRC).filter((f) => f.endsWith('.jsx'))) {
  for (const m of readFileSync(p, 'utf8').matchAll(/<select\b[^>]*?style=\{\{([^}]*)\}\}/g)) {
    if (/background|border|fontSize|color/.test(m[1])) bad.push(`${p.slice(SRC.length)}: inline select style ${m[1].trim()}`);
  }
}
if (bad.length) { console.error('select style drift:\n' + bad.join('\n')); process.exit(1); }
console.log('selects.selfcheck: ok');
