// swayMark.selfcheck.mjs — the presence mark next to BEATS (#1258).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { swayMagnitude, SWAY_DELTA_MAX, SWAY_VISIBLE_THRESHOLD } from '../curator/swayView.mjs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

ok('magnitude: neutral sway is 0, max delta is 1, half is 0.5', () => {
  assert.equal(swayMagnitude({ temperatureDelta: 0 }), 0);
  assert.equal(swayMagnitude({ temperatureDelta: SWAY_DELTA_MAX }), 1);
  assert.equal(swayMagnitude({ temperatureDelta: SWAY_DELTA_MAX / 2 }), 0.5);
});

ok('magnitude: garbage in → 0, never throws, clamps above max', () => {
  assert.equal(swayMagnitude(null), 0);
  assert.equal(swayMagnitude(undefined), 0);
  assert.equal(swayMagnitude({}), 0);
  assert.equal(swayMagnitude({ temperatureDelta: NaN }), 0);
  assert.equal(swayMagnitude({ temperatureDelta: -1 }), 0);
  assert.equal(swayMagnitude({ temperatureDelta: SWAY_DELTA_MAX * 4 }), 1);
});

const visible = (mag, t = SWAY_VISIBLE_THRESHOLD) => Number.isFinite(mag) && mag > t;

ok('visibility: below/at threshold → absent, above → present', () => {
  assert.equal(visible(0), false);
  assert.equal(visible(SWAY_VISIBLE_THRESHOLD), false);
  assert.equal(visible(SWAY_VISIBLE_THRESHOLD + 0.001), true);
  assert.equal(visible(1, 0.99), true);
  assert.equal(visible(1, 1), false);
  assert.equal(visible(NaN), false);
  assert.equal(visible(undefined), false);
});

ok('never named on the surface: no title, no tooltip, no label', () => {
  // (The sway mechanics' own deniability selfcheck scans all UI source for
  // her identifiers — including this file — so this suite must not spell
  // them out; that scan is the identifier check.)
  const jsx = read('./SwayMark.jsx');
  assert.ok(!/title=/.test(jsx), 'no title attribute');
  assert.ok(!/aria-label=/.test(jsx), 'no aria-label (aria-hidden instead)');
  assert.ok(jsx.includes('aria-hidden="true"'), 'screen readers skip the glyph');
});

ok('the Director never renders: the mark reads the store, not the scheduler', () => {
  // (The canonical guard is director.selfcheck's "no UI-surface file
  // references the director scheduler" — this just pins the architecture:
  // the mark imports no scheduler module and reads the published magnitude.)
  const jsx = read('./SwayMark.jsx');
  assert.ok(!jsx.includes('curator/director'), 'no scheduler import');
  assert.ok(jsx.includes('s.swayMagnitude'), 'reads the magnitude from the store');
});

ok('the pick path publishes sway to the store', () => {
  const slice = read('../state/slices/layoutSlice.js');
  assert.ok(slice.includes('swayMagnitude: 0'), 'initial state carries the field');
  assert.ok(/swayMagnitude\(.*\.lastSway\)/.test(slice), 'curate publishes the latest tick sway');
  assert.ok(slice.includes("from '../../curator/swayView.mjs'"), 'magnitude via the sanctioned view reader');
});

ok('placement: the mark sits immediately right of BEATS in the top bar', () => {
  const bar = read('../panels/layout/CuratorBar.jsx');
  assert.ok(bar.includes("import { SwayMark } from '../../components/SwayMark.jsx';"), 'imported');
  const i = bar.indexOf('<BeatButton />');
  assert.ok(i >= 0, 'BEATS found');
  const after = bar.slice(i, i + 400);
  assert.ok(/<BeatButton \/>\s*\{\/\* #1258[\s\S]*?\*\/\}\s*<SwayMark \/>/.test(after), 'SwayMark directly after BeatButton');
});

ok('CSS: Davis amber breath, reduced-motion static, square corners', () => {
  const css = read('../styles/controls.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(css.includes('.sway-mark'), 'class exists');
  assert.ok(/\.sway-mark\s*\{[^}]*animation:\s*sway-breathe/.test(css), 'breathes');
  assert.ok(css.includes('@keyframes sway-breathe'), 'keyframes exist');
  assert.ok(!/\.sway-mark\s*\{[^}]*border-radius/.test(css), 'no border-radius (law #1033)');
  const rm = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.sway-mark\s*\{([^}]*)\}/);
  assert.ok(rm && /animation:\s*none/.test(rm[1]), 'reduced motion: static mark');
  assert.ok(/\.sway-mark\s*\{[^}]*pointer-events:\s*none/.test(css), 'never interactive');
});

console.log(`\nswayMark: ${n} checks passed`);
