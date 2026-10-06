// rangeRow.selfcheck.mjs — one slider everywhere (#1027).
//
// Every slider in the app is a RangeRow: same square thumb, same 3px track, same 44px hit area, and
// only the thumb COLOR changes per panel. A bare <input type="range"> anywhere else is how sliders
// drifted apart in the first place (browser-blue thumbs in STIMULI, PLAY and the layer stack), so
// this scans the source and fails on a new one.
import assert from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { RANGE_TONES, RANGE_LAYOUTS, RANGE_TONE_COLORS } from './rangeTones.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const root = new URL('..', import.meta.url).pathname; // app/src
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (/\.(jsx|js|mjs)$/.test(f) && !/\.selfcheck\.mjs$/.test(f)) files.push(p);
  }
})(root);

// The only two files allowed to render a native range input, and why.
const ALLOWED = new Set([
  'components/RangeRow.jsx',     // the house control (RangeRow and DualRangeRow's two inputs)
  'components/MotionTile.jsx',   // a glyph tile, not a param row: its input carries .single-slider + data-tone
]);

const bare = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  if (/<input\b[^>]*type=(?:"range"|\{['"]range['"]\})/s.test(src) || /<input\s*\n?\s*type="range"/.test(src)) {
    const rel = relative(root, f);
    if (!ALLOWED.has(rel)) bare.push(rel);
  }
}

ok('no bare <input type="range"> outside RangeRow.jsx and MotionTile.jsx', () => {
  assert.deepEqual(bare, [], `use <RangeRow layout="bare"> instead of a native range in: ${bare.join(', ')}`);
});

ok('the allowed exceptions still exist and still use the house slider', () => {
  const rr = readFileSync(join(root, 'components/RangeRow.jsx'), 'utf8');
  assert.ok(/className=\{`single-slider/.test(rr), 'RangeRow renders .single-slider');
  const mt = readFileSync(join(root, 'components/MotionTile.jsx'), 'utf8');
  assert.ok(/single-slider motion-slider/.test(mt) && /data-tone="ink"/.test(mt), 'MotionTile must carry .single-slider and data-tone="ink": no private thumb');
});

ok('tones and layouts are the documented ones, with the design-system colors', () => {
  assert.deepEqual([...RANGE_TONES], ['ink', 'build', 'stim']);
  assert.deepEqual([...RANGE_LAYOUTS], ['row', 'stack', 'bare']);
  assert.deepEqual(RANGE_TONE_COLORS, { ink: '#e8e8e0', build: '#ffd400', stim: '#00d9ff' });
});

const css = readFileSync(join(root, 'styles/controls.css'), 'utf8');

ok('controls.css: thumb colors per tone match the design system, default is ink', () => {
  assert.match(css, /--range-thumb:\s*#e8e8e0/);
  assert.match(css, /\[data-tone="build"\]\s*\{\s*--range-thumb:\s*#ffd400/);
  assert.match(css, /\[data-tone="stim"\]\s*\{\s*--range-thumb:\s*#00d9ff/);
});

ok('controls.css: one thumb, 14x18, square, and a 44px hit area; no private thumb left', () => {
  assert.match(css, /\.single-slider \{[^}]*height:\s*44px/);
  assert.match(css, /\.range-row \{[^}]*min-height:\s*44px/);
  assert.match(css, /\.dual-slider \{[^}]*height:\s*44px/);
  // Rules that SIZE a thumb (the locked-state rules only recolor it, which is fine).
  const sized = [...css.matchAll(/::-webkit-slider-thumb\s*\{[^}]*\}/g)].map((m) => m[0]).filter((t) => /width:/.test(t));
  assert.ok(sized.length >= 2, 'the single and the dual thumb are both sized in one place');
  for (const t of sized) {
    assert.match(t, /width:\s*14px/, `thumb width in ${t.slice(0, 60)}`);
    assert.match(t, /height:\s*18px/, `thumb height in ${t.slice(0, 60)}`);
    assert.ok(/var\(--range-thumb\)/.test(t), 'the thumb color comes from --range-thumb');
    assert.ok(!/accent3/.test(t), 'no hard-coded accent on a thumb');
  }
  assert.ok(!/print-desk \.single-slider/.test(css), 'the print desk no longer has its own 20x26 thumb');
});

ok('controls.css: the leftovers this file owned are square', () => {
  assert.ok(!/\.dual-grab \{[^}]*border-radius/.test(css));
  assert.ok(!/\.range-readout:hover \{[^}]*border-radius/.test(css));
});

ok('no browser accent-color is used to tint a slider', () => {
  const panels = readFileSync(join(root, 'styles/panels.css'), 'utf8');
  assert.ok(!/\.mix-slider \{[^}]*accent-color/.test(panels));
});

console.log(`rangeRow.selfcheck: ${n} checks passed`);
