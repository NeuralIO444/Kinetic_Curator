// #1033 (M8): square corners everywhere. No nonzero border-radius in app/src.
// ALLOW is an explicit list of "path|selector" entries (the line that opens the rule, so adding lines elsewhere in the
// file does not break it); it starts empty (the LOIS pill is square).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = new URL('..', import.meta.url).pathname;
// #1122 — deliberate exceptions to square-corners: the mockup's pill chrome
// (5px pill rectangles Matt approved) and the two true circles (KIN heat,
// voice drift). Everything else stays square.
const ALLOW = [
  'styles/layout.css|.palette-strip .tb-pill {', // mockup pill rectangle, 5px
  'styles/layout.css|.tb-circle {', // KIN heat circle
  'styles/layout.css|.tb-voice {', // voice drift circle
  'styles/ux-polish.css|.hit-pill {', // HITS slot is a real pill (Matt 2026-10-08)
  'styles/ux-polish.css|.hit-pill-main {', // its left end follows the pill
  'styles/ux-polish.css|.hit-pill-act {', // round hover on the two actions
];
const selectorOf = (lines, i) => { for (let k = i; k >= 0; k--) if (lines[k].includes('{')) return lines[k].trim(); return ''; };
const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

const bad = [];
for (const p of walk(SRC)) {
  const rel = relative(SRC, p);
  if (!/\.(css|jsx?|mjs)$/.test(rel) || rel.endsWith('.selfcheck.mjs')) continue;
  const lines = readFileSync(p, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const m = line.match(/border-?[rR]adius\s*[:=]\s*['"`]?([^;,'"`}]+)/);
    if (!m || /^\s*0(px)?\s*$/.test(m[1]) || ALLOW.includes(`${rel}|${selectorOf(lines, i)}`)) return;
    bad.push(`${rel}:${i + 1}  border-radius ${m[1].trim()}`);
  });
}
if (bad.length) { console.error('nonzero radii (square corners everywhere, §1.4):\n' + bad.join('\n')); process.exit(1); }
console.log('radii.selfcheck: ok');
