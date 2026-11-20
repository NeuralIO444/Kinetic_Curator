// swayMark.selfcheck.mjs — the presence mark (#1258); since #2389 the faint warmth at the STIMULI meter's edge.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  swayMagnitude,
  SWAY_DELTA_MAX,
  SWAY_VISIBLE_THRESHOLD,
  setSwayMagnitude,
  getSwayMagnitude,
} from '../curator/swayView.mjs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

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

ok('the ephemeral holder: publish then read, garbage stays 0', () => {
  setSwayMagnitude(0.5);
  assert.equal(getSwayMagnitude(), 0.5);
  setSwayMagnitude(-1);
  assert.equal(getSwayMagnitude(), 0);
  setSwayMagnitude(99);
  assert.equal(getSwayMagnitude(), 1);
  setSwayMagnitude(0);
  assert.equal(getSwayMagnitude(), 0);
});

ok('the Director never renders: the mark reads the holder, not the scheduler', () => {
  // (The canonical guard is director.selfcheck's "no UI-surface file
  // references the director scheduler" — this just pins the architecture:
  // the mark imports no scheduler module and reads the published magnitude.)
  const jsx = read('./SwayMark.jsx');
  assert.ok(!jsx.includes('curator/director'), 'no scheduler import');
  assert.ok(
    /useSyncExternalStore\(subscribeSway, getSwayMagnitude\)/.test(jsx),
    'reads the ephemeral holder, and re-renders when the pace starts or stops (#1460)',
  );
  assert.ok(jsx.includes('s.curatePress'), 're-renders on every pick');
});

ok('the pick path publishes sway to the holder (never store state)', () => {
  const slice = read('../state/slices/layoutSlice.js');
  assert.ok(/setSwayMagnitude\(swayMagnitude\(.*\.lastSway\)\)/.test(slice), 'curate publishes the latest tick sway');
  assert.ok(slice.includes("from '../../curator/swayView.mjs'"), 'magnitude via the sanctioned view reader');
  assert.ok(!/swayMagnitude\s*:/.test(slice), 'no sway key in store state (deniability law)');
});

ok('placement (#2389, spec §4 Q18): the mark left the top bar and lives on the STIMULI meter, at its edge', () => {
  const bar = read('../panels/layout/CuratorBar.jsx');
  assert.ok(!bar.includes('SwayMark'), 'the top bar no longer carries the mark');
  assert.ok(!bar.includes('sway-mark'), 'no trace of it in the top bar');
  const meter = read('../panels/stimulus/MeterHero.jsx');
  assert.ok(meter.includes("import { SwayMark } from '../../components/SwayMark.jsx';"), 'the meter imports it');
  assert.ok(
    /<div className="stim-meter-stage">\s*<canvas[\s\S]*?\/>\s*<SwayMark \/>\s*<\/div>/.test(meter),
    'it sits on the meter stage, right after the meter canvas',
  );
  // exactly one trace, anywhere in the UI
  const uses = [meter, bar, read('./SwayMark.jsx')].join('\n').match(/<SwayMark \/>/g) || [];
  assert.equal(uses.length, 1, 'one trace');
});

ok('one trace, still unnamed: no glyph, no text, no title, no tooltip, no aria name', () => {
  const jsx = read('./SwayMark.jsx');
  const tag = jsx.match(/<span[^>]*\/>/);
  assert.ok(tag, 'a self-closing span: nothing inside it to read');
  assert.ok(!/title=|aria-label=|aria-labelledby=|data-tip|tooltip/i.test(tag[0]), 'nothing names it');
  assert.ok(!/\p{Extended_Pictographic}/u.test(jsx), 'no glyph (the crown left with the top bar)');
});

ok('CSS: a warm edge on the meter, breathing; reduced-motion static; square corners; never interactive', () => {
  const css = read('../styles/controls.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(css.includes('.sway-mark'), 'class exists');
  const rule = css.match(/\.sway-mark\s*\{([^}]*)\}/)[1];
  assert.ok(/animation:\s*sway-breathe/.test(rule), 'breathes');
  assert.ok(/position:\s*absolute/.test(rule) && /right:\s*0/.test(rule), 'on the right edge');
  assert.ok(/linear-gradient/.test(rule), 'a warmth, not a glyph');
  assert.ok(css.includes('@keyframes sway-breathe'), 'keyframes exist');
  assert.ok(!/border-radius/.test(rule), 'no border-radius (law #1033)');
  const rm = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.sway-mark\s*\{([^}]*)\}/);
  assert.ok(rm && /animation:\s*none/.test(rm[1]), 'reduced motion: static mark');
  assert.ok(/pointer-events:\s*none/.test(rule), 'never interactive');
  const panels = read('../styles/panels.css');
  assert.ok(/\.stim-meter-stage\s*\{[^}]*position:\s*relative/.test(panels), 'the meter stage holds it');
});

console.log(`\nswayMark: ${n} checks passed`);
