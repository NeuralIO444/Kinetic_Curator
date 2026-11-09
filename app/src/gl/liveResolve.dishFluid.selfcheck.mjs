// node src/gl/liveResolve.dishFluid.selfcheck.mjs
// #1997 — the ferrofluid on the live resolver. The resolver stays a pure function of its
// recorded input stream: input.dishFluid (+ dishFluidMagnets / dishFluidDial) is the fluid's
// whole contribution. Pinned here:
//   off parity      no fluid keys → frames byte-identical, no dishFluid key in the snapshot;
//                   fluid keys present with COUPLE 0 → the culture's frames are still
//                   byte-identical to the no-fluid run (the fluid uncoupled perturbs nothing)
//   coupling        COUPLE up → the culture's frames diverge from the uncoupled run (the
//                   fluid's published density biases its births), while frames before any
//                   biased generation can occur stay identical (the one-frame-behind read)
//   start delay     starting the fluid one frame later cannot change any frame before the
//                   first biased generation either — both early frames stay identical
//   snapshot        a mid-run snapshot (through JSON) carries the fluid + the culture's
//                   fluid-bias rider, and a fresh resolver restored from it continues
//                   bit-identically; checkResolverSnapshot accepts the genuine keys and
//                   refuses malformed fluid / rider shapes
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLiveResolver, checkResolverSnapshot } from './liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { quietStamp } from '../engine/dishLifeQuiet.mjs';
import { fluidStamp } from '../engine/dishFluid.mjs';

const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
const lp = (over = {}) => ({ ...DEFAULT_LAYOUT_PARAMS, count: 60, particleCount: 60, ...over });
const baseInput = (over = {}) => ({
  layers: [L('lyr-a')],
  activeLayerId: 'lyr-a',
  layerSnapshots: {},
  seed: 4242,
  seedOffsets: null,
  paletteId: 'bone',
  paletteOverrides: null,
  userPalettes: [],
  layoutParams: lp({ mode: 'random' }),
  caGrid: null,
  enabledAssets: null,
  assetWeightOverrides: {},
  customAssets: [],
  quality: 'balanced',
  lockedParams: {},
  batchPaused: false,
  focusSwap: false,
  loopTimeMs: 0,
  dtSec: 1 / 60,
  perfClampOverride: null,
  perfTier1: false,
  assetThin: false,
  slowRender: false,
  scaleMul: 1,
  alphaBoost: 0,
  effectiveScale: [0.5, 1.5],
  effectiveAlpha: [20, 100],
  phraseWrapGen: 0,
  attractor: null,
  mixSeconds: 0,
  canvasW: 1280,
  canvasH: 720,
  ...over,
});

function canon(v, d = 0) {
  if (v === null || v === undefined) return 'n';
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v) ? String(v) : `#${v}`;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'boolean') return v ? 'T' : 'F';
  if (t === 'function') return 'fn';
  if (d > 12) return '…';
  if (ArrayBuffer.isView(v)) return `[${Array.from(v).join(',')}]`;
  if (Array.isArray(v)) return `[${v.map((x) => canon(x, d + 1)).join(',')}]`;
  if (v instanceof Map) return canon([...v.entries()], d + 1);
  if (v instanceof Set) return canon([...v.values()], d + 1);
  return `{${Object.keys(v)
    .filter((k) => v[k] !== undefined)
    .sort()
    .map((k) => `${k}:${canon(v[k], d + 1)}`)
    .join(',')}}`;
}
const hash = (o) => createHash('sha256').update(canon(o)).digest('hex').slice(0, 20);

const DT = 16.7;
const MAGNETS = [{ x: 0.5, y: 0.5 }];
/** Frame f's input: the quiet culture always runs; the fluid runs per `fluid` ({from, couple}). */
const inputAt = (f, fluid) => {
  const t = f * DT;
  const over = { loopTimeMs: t, dtSec: DT / 1000, dishLife: quietStamp(t, { strength: 0.35, boost: 0, shed: 0 }) };
  if (fluid && f >= fluid.from) {
    over.dishFluid = fluidStamp(t, { shed: 0 });
    over.dishFluidMagnets = MAGNETS;
    over.dishFluidDial = { flow: 0.5, pull: 0.7, couple: fluid.couple };
  }
  return baseInput(over);
};
const run = (r, n, fluid) => {
  const hs = [];
  for (let f = 0; f < n; f++) hs.push(hash(r.resolveLayers(inputAt(f, fluid))));
  return hs;
};
const N = 60;

// 1. off parity + uncoupled parity
{
  const plain = createLiveResolver();
  const plainHs = run(plain, N, null);
  assert.equal(plain.snapshotState().dishFluid, undefined, 'no fluid, no dishFluid key in the snapshot');
  const uncoupled = createLiveResolver();
  const uncoupledHs = run(uncoupled, N, { from: 0, couple: 0 });
  assert.deepEqual(uncoupledHs, plainHs, 'fluid present at COUPLE 0 = the culture never reads it');
  assert.ok(uncoupled.snapshotState().dishFluid, 'the fluid itself ran (its own key rides)');
  assert.equal(uncoupled.snapshotState().dishLife.fluidGrid, undefined, 'an uncoupled culture carries no state rider');
  plain.dispose();
  uncoupled.dispose();
}

// 2. coupling is real, and nothing moves before the first biased generation can occur
{
  const coupled = createLiveResolver();
  const coupledHs = run(coupled, N, { from: 0, couple: 0.8 });
  const plain = createLiveResolver();
  const plainHs = run(plain, N, null);
  assert.equal(coupledHs[0], plainHs[0], 'frame 0: the fluid has published nothing yet — no bias can act');
  assert.equal(coupledHs[1], plainHs[1], 'frame 1: still no biased generation (the read is one frame behind)');
  const firstDivergence = coupledHs.findIndex((h, i) => h !== plainHs[i]);
  assert.ok(
    firstDivergence > 1 && firstDivergence < N,
    `the coupling lands (first divergence at frame ${firstDivergence})`,
  );
  assert.ok(coupled.snapshotState().dishLife.fluidGrid, 'the biased culture snapshot carries the state rider');
  coupled.dispose();
  plain.dispose();
}

// 3. a one-frame-later fluid start leaves the same early frames identical
{
  const onTime = createLiveResolver();
  const onTimeHs = run(onTime, N, { from: 0, couple: 0.8 });
  const late = createLiveResolver();
  const lateHs = run(late, N, { from: 1, couple: 0.8 });
  assert.equal(lateHs[0], onTimeHs[0], 'the late run’s frame 0 has no fluid at all — identical');
  assert.equal(lateHs[1], onTimeHs[1], 'frame 1 still precedes any biased generation in both runs');
  onTime.dispose();
  late.dispose();
}

// 4. snapshot / restore continues bit-identically; validation gates the new shapes
{
  const a = createLiveResolver();
  run(a, 30, { from: 0, couple: 0.8 });
  const snap = JSON.parse(JSON.stringify(a.snapshotState()));
  assert.ok(snap.dishFluid, 'the snapshot carries the fluid');
  assert.deepEqual(snap.dishFluid.magnets, MAGNETS, 'and its magnets');
  assert.equal(checkResolverSnapshot(snap), true, 'the genuine snapshot validates');
  const restA = run(a, 0, null); // (no-op: a keeps its state)
  void restA;
  const tail = [];
  for (let f = 30; f < N; f++) tail.push(hash(a.resolveLayers(inputAt(f, { from: 0, couple: 0.8 }))));
  const b = createLiveResolver();
  b.restoreState(snap);
  const tailB = [];
  for (let f = 30; f < N; f++) tailB.push(hash(b.resolveLayers(inputAt(f, { from: 0, couple: 0.8 }))));
  assert.deepEqual(tailB, tail, 'restored mid-run, the pair continues bit-identically');
  const fluidShape = {
    wakeMs: 0,
    gridStep: 3,
    magnets: [],
    state: { u: Array(96 * 54).fill(1), v: Array(96 * 54).fill(0) },
  };
  assert.equal(
    checkResolverSnapshot({ ...snap, dishFluid: { ...fluidShape, gridStep: -1 } }),
    false,
    'a negative grid step is refused',
  );
  assert.equal(
    checkResolverSnapshot({
      ...snap,
      dishFluid: { ...fluidShape, magnets: Array.from({ length: 9 }, () => ({ x: 0, y: 0 })) },
    }),
    false,
    'more magnets than the dish holds is refused',
  );
  assert.equal(
    checkResolverSnapshot({ ...snap, dishFluid: { wakeMs: 0, gridStep: 3, magnets: [] } }),
    false,
    'a fluid snapshot without its state rider is refused',
  );
  assert.equal(
    checkResolverSnapshot({ ...snap, dishLife: { ...snap.dishLife, fluidGrid: [0, 1, 2] } }),
    false,
    'a state rider with a wrong-sized grid is refused',
  );
  a.dispose();
  b.dispose();
}

console.log('liveResolve.dishFluid.selfcheck: ok');
