// colorTribes.selfcheck.mjs — amber means one thing, red means one thing, pink stays live (KC-1 DS rules 5 and 6, #1126).
import assert from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const SRC = new URL('..', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(SRC).filter((p) => /\.(jsx?|css|mjs)$/.test(p) && !p.endsWith('.selfcheck.mjs')).map((p) => ({ rel: relative(SRC, p), src: readFileSync(p, 'utf8') }));
const tokens = readFileSync(join(SRC, 'styles/tokens.css'), 'utf8');
const hex = (name) => (tokens.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`)) || [])[1];
const hue = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b); const d = mx - Math.min(r, g, b); const x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (x * 60 + 360) % 360; };
const gap = (a, b) => { const d = Math.abs(hue(a) - hue(b)); return Math.min(d, 360 - d); };

ok('three colours, three tokens: structure red, Davis amber, live pink, and a fault is the red', () => {
  assert.equal(hex('--kc-red'), '#ff4d00'); assert.equal(hex('--kc-davis'), '#ffcd82'); assert.equal(hex('--accent'), '#ff2d6f');
  assert.match(tokens, /--kc-warn:\s*var\(--kc-red\);/, 'a warning or fault IS the structure red');
  assert.match(tokens, /--kc-live:\s*var\(--accent\);/, 'live is still pink');
  assert.ok(gap(hex('--kc-red'), hex('--accent')) >= 15, `red and live pink are different hues (${gap(hex('--kc-red'), hex('--accent')).toFixed(0)} degrees apart)`);
  assert.ok(gap(hex('--kc-red'), hex('--kc-davis')) >= 15 && gap(hex('--kc-davis'), hex('--accent')) >= 15);
});

ok('no hand-written amber is left: it is the token or nothing', () => {
  const bad = files.filter((f) => f.rel !== 'styles/tokens.css' && /#ffb000|rgba?\(\s*255,\s*176,\s*0/i.test(f.src)).map((f) => f.rel);
  assert.deepEqual(bad, [], `hardcoded old amber in: ${bad.join(', ')}`);
});

ok('amber means one thing: only these files may use it, and a new one has to be added here on purpose', () => {
  const users = files.filter((f) => /--kc-davis/.test(f.src) && f.rel !== 'styles/tokens.css').map((f) => f.rel).sort();
  // #1139: MeterHero's beat-lock wash is amber on purpose — beat-lock is a
  // probabilistic/time-based signal (confidence in the beat), which is
  // amber's family per rules 5/6. It is beat-lock only, never lean.
  // (ux-polish.css, #1124: the HITS heat band keeps the KIN heat hue, amber, frozen and stepped. Heat is Davis; freezing it changes how it renders, TE, not what it is.)
  assert.deepEqual(users, ['components/DavisSigil.jsx', 'panels/stimulus/MeterHero.jsx', 'styles/controls.css', 'styles/layout.css', 'styles/panels.css', 'styles/ux-polish.css'],
    'amber is the probabilistic family (Davis, taste, time-based armed outlines, the spinner). If this list needs a new file, rule 5 has a question to answer first.');
  const panels = readFileSync(join(SRC, 'styles/panels.css'), 'utf8'); const controls = readFileSync(join(SRC, 'styles/controls.css'), 'utf8');
  assert.match(panels, /\.chip-btn\.armed \{ outline: 2px solid var\(--kc-davis\)/); assert.match(panels, /\.big-btn\.armed \{ outline: 2px solid var\(--kc-davis\)/);
  assert.match(controls, /\.spin-readout \{ color: var\(--kc-davis\)/);
});

ok('faults and errors are the red: the pills, the dialog error, the fps needle', () => {
  const css = (f) => readFileSync(join(SRC, f), 'utf8');
  assert.match(css('styles/controls.css'), /\.slider-dialog-error \{[^}]*var\(--kc-warn\)/);
  assert.match(css('styles/layout.css'), /\.fps-needle\.bad \{ background: var\(--kc-warn\)/);
  const tape = css('components/TapeCounter.jsx');
  assert.match(tape, /const FAULT = \{ background: 'rgba\(255, 77, 0, 0\.18\)', color: 'var\(--kc-warn\)', borderColor: 'var\(--kc-warn\)' \}/);
  assert.ok(!/AMBER/.test(tape), 'the constant no longer lies about its colour');
});

ok('the buttons belong to a tribe: EVOLVE and NEW SEED are Davis\'s, FAVORITE is LOIS\'s; a running EVOLVE is still live pink', () => {
  const panel = readFileSync(join(SRC, 'panels/DavisPanel.jsx'), 'utf8');
  assert.match(panel, /big-btn tribe-davis \$\{evolveMode \? 'active' : ''\}/);
  assert.match(panel, /className="big-btn act tribe-lois" onClick=\{saveFavorite\}/);
  assert.match(panel, /className="big-btn act tribe-davis" onClick=\{\(\) => emit\(Events\.DAVIS_EVOLVE, \{ bumpSeed: true \}\)\}/);
  assert.equal((panel.match(/tribe-/g) || []).length, 3, 'exactly these three verbs are tribal');
  const css = readFileSync(join(SRC, 'styles/panels.css'), 'utf8');
  assert.match(css, /\.big-btn\.tribe-davis:not\(\.active\) \{ border-color: var\(--kc-davis\); \}/);
  assert.match(css, /\.big-btn\.tribe-lois \{ border-color: var\(--kc-red\); \}/);
  assert.match(css, /\.big-btn\.active \{ background: var\(--accent\)/, 'live pink is untouched');
});

console.log(`colorTribes.selfcheck: ${n} checks passed`);
