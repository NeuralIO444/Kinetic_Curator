// #1461 step 3 — the scrub strip's model: bars when the take has them, time when it does not, snapping, clamps, wiring.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { withResolveTap, setResolveTap, setResolveOutputTap } from '../gl/resolveTap.mjs';
import { createPerformanceRecorder } from '../gl/performanceFile.mjs';
import { startPlayback, stopPlayback, getPlayback, seekPlayback } from '../gl/playback.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { createClockRecorder } from './clockRecord.js';
import { takeStripModel } from './takeStrip.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
const stable = {
  canvasW: 640,
  canvasH: 480,
  layers: [L('a')],
  activeLayerId: 'a',
  layerSnapshots: {},
  seedOffsets: null,
  paletteId: 'bone',
  paletteOverrides: null,
  userPalettes: [],
  caGrid: null,
  enabledAssets: null,
  assetWeightOverrides: {},
  customAssets: [],
  lockedParams: {},
  batchPaused: false,
  focusSwap: false,
  perfClampOverride: null,
  scaleMul: 1,
  alphaBoost: 0,
  phraseWrapGen: 0,
  reducedMotion: false,
  quality: 'balanced',
  perfTier1: false,
  assetThin: false,
  slowRender: false,
  effectiveScale: [0.5, 1.5],
  effectiveAlpha: [20, 100],
  assetAttach: {},
  attractor: null,
  dishPins: [],
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 30 },
};
/** An 8.3 s take at 120 BPM: bars at 2, 4, 6 and 8 s; the clock section is optional. */
function take({ withClock }) {
  const rec = createPerformanceRecorder();
  const r = withResolveTap(createLiveResolver);
  setResolveTap((i) => rec.onInput(i));
  setResolveOutputTap((o) => rec.onOutput(o));
  let frame = 0;
  const clock = createClockRecorder({ initialBpm: 120, getFrame: () => frame });
  let t = 0;
  for (frame = 0; frame < 500; frame++) {
    t += 1000 / 60;
    r.resolveLayers({ ...stable, seed: 5, loopTimeMs: t, dtSec: 1 / 60 });
  }
  setResolveTap(null);
  setResolveOutputTap(null);
  r.dispose();
  const perf = rec.finish();
  return withClock ? { ...perf, clock: clock.finish() } : perf;
}
const withBars = take({ withClock: true });
const noBars = take({ withClock: false });

ok("a take with a clock reads BAR n / m, and the last bar is the take's real count", () => {
  const m = takeStripModel(withBars);
  assert.equal(m.hasBars, true);
  assert.ok(m.lastBar >= 3, `bars (${m.lastBar})`);
  assert.equal(m.labelFor(0), `BAR 1 / ${m.lastBar + 1}`);
  assert.equal(m.labelFor(withBars.frames - 1), `BAR ${m.lastBar + 1} / ${m.lastBar + 1}`);
  assert.equal(m.positionOf(0), 0);
  assert.equal(m.positionOf(withBars.frames - 1), 1);
});

ok('a drag snaps to a downbeat, and the downbeat is the same frame the bar lookup gives', () => {
  const m = takeStripModel(withBars);
  for (const p of [0, 0.2, 0.37, 0.5, 0.81, 1]) {
    const f = m.frameForPosition(p);
    assert.ok(Number.isInteger(f) && f >= 0 && f < withBars.frames);
    const bar = Number(m.labelFor(f).match(/BAR (\d+)/)[1]) - 1;
    assert.equal(m.frameForBarNumber(bar), f, `p=${p} lands exactly on bar ${bar + 1}'s downbeat`);
  }
  assert.equal(m.frameForBarNumber(9999), null);
});

ok('a take with no clock reads minutes and seconds and scrubs by time (no snapping)', () => {
  const m = takeStripModel(noBars);
  assert.equal(m.hasBars, false);
  assert.match(m.labelFor(0), /^0:00 \/ 0:0\d$/);
  const f = m.frameForPosition(0.5);
  assert.ok(Math.abs(f - (noBars.frames - 1) / 2) <= 1);
  assert.match(m.labelFor(noBars.frames - 1), /^0:0\d \/ 0:0\d$/);
  assert.equal(m.frameForBarNumber(2), null);
});

ok('junk positions clamp to the take; a one-frame take does not divide by zero', () => {
  const m = takeStripModel(withBars);
  for (const p of [-5, NaN, undefined, 9, Infinity]) {
    const f = m.frameForPosition(p);
    assert.ok(f >= 0 && f <= withBars.frames - 1);
  }
  assert.equal(m.positionOf(NaN), 0);
  assert.equal(m.positionOf(1e9), 1);
});

ok('the strip drives playback: a drag seeks the take to that frame, and it plays on from there', () => {
  startPlayback(withBars);
  const m = takeStripModel(getPlayback().perf);
  const f = m.frameForPosition(0.6);
  seekPlayback(f);
  assert.equal(getPlayback().frame, f);
  assert.equal(getPlayback().ended, false);
  stopPlayback();
});

ok('wired: in the gap beside STOP, read from the playback holder, absent when no take plays, no store', () => {
  const bar = src('../components/MasterBar.jsx');
  assert.match(bar, /<TakeStrip \/>\s*<div className="master-right">/);
  const strip = src('../components/TakeStrip.jsx').replace(/\/\/.*$/gm, '');
  assert.match(strip, /if \(!pb \|\| !model\) return null;/);
  assert.match(strip, /seekPlayback\(f\)/);
  assert.ok(!/useStore|getState|\bemit\(/.test(strip), 'a drag seeks; it writes no state and emits nothing');
  assert.match(strip, /setInterval\(/, 'the cursor is sampled on a timer, not per frame');
  const pure = src('./takeStrip.mjs').replace(/\/\/.*$/gm, '');
  assert.ok(!/Date\.now|performance\.now|Math\.random|setTimeout|setInterval|document|window/.test(pure));
});

console.log(`takeStrip.selfcheck: ${n} checks passed`);
