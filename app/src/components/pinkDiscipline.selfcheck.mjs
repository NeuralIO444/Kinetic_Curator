// #1030 (M4): pink means live. Chrome never hardcodes the live pink — it uses
// var(--kc-live) (live/armed/executing) and var(--kc-red) / var(--kc-davis) / var(--kc-ok) for the rest.
// tokens.css defines it; palettes and the MeterHero canvas fallback own their own hex.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = new URL('..', import.meta.url).pathname;
const ALLOWED = new Set(['styles/tokens.css', 'data/palettes.js', 'panels/stimulus/MeterHero.jsx']);
const walk = (d) =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const bad = [];
for (const p of walk(SRC)) {
  const rel = relative(SRC, p);
  if (!/\.(jsx?|css|mjs)$/.test(rel) || rel.endsWith('.selfcheck.mjs') || ALLOWED.has(rel)) continue;
  readFileSync(p, 'utf8')
    .split('\n')
    .forEach((l, i) => {
      if (/#ff2d6f/i.test(l) || /rgba\(\s*255,\s*45,\s*111,\s*(0?\.9|1)\s*\)/.test(l)) bad.push(`${rel}:${i + 1}`);
    });
}
const tok = readFileSync(join(SRC, 'styles/tokens.css'), 'utf8');
for (const t of ['--kc-live', '--kc-ok', '--kc-warn', '--kc-red', '--kc-davis'])
  if (!tok.includes(t + ':')) bad.push(`tokens.css missing ${t}`);
const panels = readFileSync(join(SRC, 'styles/panels.css'), 'utf8');
// #2050 — armed chips render TE now: the mark is the red corner detent, and
// no rule may render the chip boolean in Davis amber. (The old "armed =
// waiting, time-based" reading is superseded by the top-bar legibility
// spec: an arm is a discrete state, not a duration.)
if (/\.chip-btn\.armed\s*\{[^}]*var\(--kc-davis\)/.test(panels))
  bad.push('.chip-btn.armed must not use --kc-davis (armed renders TE since #2050)');
if (!/\.chip-detent\s*\{[^}]*var\(--kc-red\)/.test(panels))
  bad.push('.chip-detent must use --kc-red (the armed detent spends the one red)');
if (bad.length) {
  console.error('pink discipline:\n' + bad.join('\n'));
  process.exit(1);
}
console.log('pinkDiscipline.selfcheck: ok');
