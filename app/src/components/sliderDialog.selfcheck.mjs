// sliderDialog.selfcheck.mjs — the tap-name dialog's logic and wiring (#1127).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { parseBoundsDraft, fitRange, createBoundsStore } from './sliderBounds.mjs';
import { RANGE_SPEC, RANGE_HARD, normalizeLayoutParams, DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const H = RANGE_HARD.rotate;

ok('typed bounds: whole or nothing, inside the hard limits, MAX above MIN', () => {
  assert.deepEqual(parseBoundsDraft({ min: '-360', max: '360' }, H), { ok: true, min: -360, max: 360 });
  assert.equal(parseBoundsDraft({ min: '-900', max: '10' }, H).ok, false, 'past the hard limit');
  assert.equal(parseBoundsDraft({ min: '0', max: '1000' }, H).ok, false);
  assert.equal(parseBoundsDraft({ min: '5', max: '5' }, H).ok, false, 'a zero span has nothing to drag');
  assert.equal(parseBoundsDraft({ min: '9', max: '2' }, H).ok, false);
  for (const bad of [{ min: '', max: '1' }, { min: 'x', max: '1' }, { min: '1', max: null }, {}, null]) assert.equal(parseBoundsDraft(bad, H).ok, false, JSON.stringify(bad));
  assert.match(parseBoundsDraft({ min: 'x', max: '1' }, H).error, /numbers/);
});

ok('fitRange pulls a pair inside new bounds and keeps its order (a reversed pair is a choice)', () => {
  assert.deepEqual(fitRange(-180, 180, -90, 90), [-90, 90]);
  assert.deepEqual(fitRange(-10, 10, -90, 90), [-10, 10], 'widening changes nothing');
  assert.deepEqual(fitRange(50, -50, -20, 20), [20, -20], 'reversed stays reversed');
});

ok('the span is a session store: set, get with fallback, reset, subscribers hear it', () => {
  const s = createBoundsStore(); let heard = 0; const off = s.subscribe(() => { heard += 1; });
  assert.deepEqual(s.get('layout.rotate', [-180, 180]), [-180, 180]);
  s.set('layout.rotate', -360, 360); assert.deepEqual(s.get('layout.rotate', [-180, 180]), [-360, 360]); assert.equal(heard, 1);
  s.reset('layout.rotate'); s.reset('layout.rotate'); assert.deepEqual(s.get('layout.rotate', [-180, 180]), [-180, 180]); assert.equal(heard, 2, 'a reset of nothing is silent');
  off(); s.set('a', 0, 1); assert.equal(heard, 2);
});

ok('the engine accepts a widened span (and no further); the resting spans, macros and defaults are untouched', () => {
  assert.deepEqual(RANGE_SPEC.rotate, { min: -180, max: 180 }); assert.deepEqual(RANGE_SPEC.scale, { min: 0.1, max: 3 });
  assert.deepEqual(normalizeLayoutParams({ rotate: [-400, 700] }).rotate, [-400, 700]);
  assert.deepEqual(normalizeLayoutParams({ rotate: [-9999, 9999] }).rotate, [-720, 720]);
  assert.deepEqual(normalizeLayoutParams({ scale: [0.06, 5.5] }).scale, [0.06, 5.5]);
  assert.deepEqual(normalizeLayoutParams({ alpha: [-5, 150] }).alpha, [0, 100], 'alpha cannot exceed 100');
  assert.deepEqual(normalizeLayoutParams({}).rotate, DEFAULT_LAYOUT_PARAMS.rotate);
  for (const k of ['rotate', 'scale', 'alpha']) assert.ok(RANGE_HARD[k].min <= RANGE_SPEC[k].min && RANGE_HARD[k].max >= RANGE_SPEC[k].max, `${k}: hard limits contain the resting span`);
});

ok('wiring: SCALE, ROTATE and ALPHA open the dialog; a single tap waits for a double-click; ROTATE carries SPIN|RANGE; nothing is saved', () => {
  const r = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const ls = r('../panels/layout/LayoutSliders.jsx');
  for (const k of ['scale', 'rotate', 'alpha']) assert.match(ls, new RegExp(`dialog=\\{\\{ key: 'layout\\.${k}', title: '${k.toUpperCase()}', hard: RANGE_HARD\\.${k}`));
  assert.match(ls, /spin: \{ value: layoutParams\.rotateSpin \?\? 0, onChange: \(v\) => set\('rotateSpin', v\)/);
  const rr = r('./RangeRow.jsx');
  assert.match(rr, /const TAP_NAME_MS = 240;/); assert.match(rr, /clearTimeout\(tapTimer\.current\); \/\/ a double-click is a reset, not a dialog/);
  assert.match(rr, /\{dialogOpen && \(/); assert.match(rr, /onApplySpan=\{applySpan\}/);
  const dlg = r('./SliderDialog.jsx');
  for (const w of ['APPLY', 'RESET DEFAULT', 'CANCEL', 'SLIDER MIN', 'SLIDER MAX', 'SPEED (REV/S)']) assert.ok(dlg.includes(w), w);
  assert.match(dlg, /e\.key === 'Escape'/); assert.match(dlg, /onApplySpan\(b\.min, b\.max, rev\)/);
  // the span never reaches a saved thing
  for (const f of ['../state/projectDocument.js', '../state/recipes.js', '../state/recipeUrls.js', '../state/recipeStack.js']) {
    try { assert.ok(!/sliderBounds|useSliderBounds/.test(r(f)), f); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
  }
});

console.log(`sliderDialog.selfcheck: ${n} checks passed`);
