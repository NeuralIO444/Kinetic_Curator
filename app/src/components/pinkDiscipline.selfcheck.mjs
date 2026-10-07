// #1030 (M4): pink means live. Chrome never hardcodes the live pink — it uses
// var(--kc-live) (live/armed/executing) and var(--kc-warn) / var(--kc-ok) for the rest.
// tokens.css defines it; palettes and the MeterHero canvas fallback own their own hex.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = new URL('..', import.meta.url).pathname;
const ALLOWED = new Set(['styles/tokens.css', 'data/palettes.js', 'panels/stimulus/MeterHero.jsx']);
const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

const bad = [];
for (const p of walk(SRC)) {
  const rel = relative(SRC, p);
  if (!/\.(jsx?|css|mjs)$/.test(rel) || rel.endsWith('.selfcheck.mjs') || ALLOWED.has(rel)) continue;
  readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
    if (/#ff2d6f/i.test(l) || /rgba\(\s*255,\s*45,\s*111,\s*(0?\.9|1)\s*\)/.test(l)) bad.push(`${rel}:${i + 1}`);
  });
}
const tok = readFileSync(join(SRC, 'styles/tokens.css'), 'utf8');
for (const t of ['--kc-live', '--kc-ok', '--kc-warn']) if (!tok.includes(t + ':')) bad.push(`tokens.css missing ${t}`);
const panels = readFileSync(join(SRC, 'styles/panels.css'), 'utf8');
if (!/\.chip-btn\.armed\s*\{[^}]*var\(--kc-warn\)/.test(panels)) bad.push('.chip-btn.armed must use --kc-warn');
if (bad.length) { console.error('pink discipline:\n' + bad.join('\n')); process.exit(1); }
console.log('pinkDiscipline.selfcheck: ok');
