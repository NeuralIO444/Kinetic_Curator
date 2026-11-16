// node src/gl/liveResolve.dishFluid.selfcheck.mjs
// #1997 — the ferrofluid on the live resolver, re-pinned by #2178. The resolver stays a pure
// function of its recorded input stream: input.dishFluid (+ dishFluidMagnets / dishFluidDial)
// is the fluid's whole contribution. Until #2178 the fluid's body was ordinary `fluid:` items
// appended to the top content layer — inside the hashed output. The channel moved the body
// to the renderer (GPU seating from the published density); the resolver's whole contribution
// is now the plan ANNOTATION (the bedrock mask + the channel descriptor), which lives on the
// published plan, never in the resolved layers. Pinned here:
//   off parity      no fluid keys → frames byte-identical between independent resolvers, no
//                   dishFluid key in the snapshot, no descriptor published. With the fluid
//                   present at COUPLE 0 and PULL 0 (since the one force seam, PULL leans the
//                   stage's own marks — pinned in engine/dishFluidDrift.selfcheck.mjs), frames are byte-identical to the no-fluid run WHOLE
//                   (nothing to strip — there are no body items), while the descriptor
//                   publishes from the first frame: the body is presentation now, and the
//                   culture never reads the fluid while uncoupled
//   coupling        COUPLE up → the frames diverge from the uncoupled run, while frames
//                   before any biased generation can occur stay identical (one-frame-behind)
//   start delay     starting the fluid one frame later cannot change any frame before the
//                   first biased generation either; the late run's first frame publishes
//                   no descriptor
//   snapshot        a mid-run snapshot (through JSON) carries the fluid + the culture's
//                   fluid-bias rider, and a fresh resolver restored from it continues
//                   bit-identically, descriptor publishing throughout; checkResolverSnapshot
//                   accepts the genuine keys and refuses malformed fluid / rider shapes
//   births      K1 slice 3c (#2186): input.dishBirthRecord logs the biased culture's births without changing a frame;
//               input.dishBirthReplay reproduces those frames with NO fluid at all; input.dishFluidExternal publishes the
//               host's density on the plan and the culture reads it; all absent = the pre-3c resolver
//   cells       K1 slice 4b: input.dishFluidCells (the GPU field as a recorded, sparse, 8-bit input) drives the culture and
//               the plan; a JSON round-trip through the input log replays the very same frames; a malformed object is inert
//   vocabulary      on a stage with nothing dealt (a swarm layer with no particles), the
//                   descriptor's vocabulary is the stage's own asset pool — every shape a
//                   real pool asset, wider than the marks chapter (letters/stamps ride the
//                   pool), and the poem-only alphabets never appear (not pool assets)
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLiveResolver, checkResolverSnapshot, getLastDishFluidPlan, getLastDishBirths } from './liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { ASSETS } from '../data/assets/index.js';
import { ASSETS_KANA } from '../data/assets/assets-kana.js';
import { ASSETS_KANJI } from '../data/assets/assets-kanji.js';
import { quietStamp } from '../engine/dishLifeQuiet.mjs';
import { fluidStamp } from '../engine/dishFluid.mjs';
import { packFluidCells } from '../engine/dishFluidCells.mjs';
import { packCultureCells } from '../engine/dishCultureCells.mjs';
import { createPerformanceRecorder, verifyPerformance, checkPerformance } from './performanceFile.mjs';
import { createInputLog, replayInputs } from '../engine/kernel/replay/inputLog.js';

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
    over.dishFluidDial = { flow: 0.5, pull: fluid.pull ?? 0.7, couple: fluid.couple };
  }
  return baseInput(over);
};
/** Resolve n frames, fingerprinting each frame whole, plus the plan annotation the frame
 *  published (descriptor present or not — the channel's door). */
const run = (r, n, fluid) => {
  const frames = [];
  for (let f = 0; f < n; f++) {
    const layers = r.resolveLayers(inputAt(f, fluid));
    const plan = getLastDishFluidPlan();
    frames.push({ full: hash(layers), descriptor: !!(plan && plan.fieldBody), planActive: !!(plan && plan.active) });
  }
  return frames;
};
const N = 60;

// 1. off parity (full frames) + uncoupled parity (whole frames) + the descriptor publishes
{
  const plain = createLiveResolver();
  const plainHs = run(plain, N, null);
  assert.equal(plain.snapshotState().dishFluid, undefined, 'no fluid, no dishFluid key in the snapshot');
  assert.ok(
    plainHs.every((f) => !f.descriptor && !f.planActive),
    'no fluid keys, no descriptor published on any frame',
  );
  const plain2 = createLiveResolver();
  assert.deepEqual(
    run(plain2, N, null).map((f) => f.full),
    plainHs.map((f) => f.full),
    'no fluid keys → frames byte-identical between independent resolvers',
  );
  const uncoupled = createLiveResolver();
  const uncoupledHs = run(uncoupled, N, { from: 0, couple: 0, pull: 0 });
  assert.deepEqual(
    uncoupledHs.map((f) => f.full),
    plainHs.map((f) => f.full),
    'fluid present at COUPLE 0 and PULL 0: every frame is the no-fluid frame, whole — the body is not in the output',
  );
  assert.ok(uncoupledHs[0].descriptor, 'the descriptor publishes from the first frame (the seeded field)');
  assert.ok(uncoupledHs[N - 1].descriptor, 'and the descriptor is still published at the last frame');
  assert.ok(uncoupled.snapshotState().dishFluid, 'the fluid itself ran (its own key rides)');
  assert.equal(uncoupled.snapshotState().dishLife.fluidGrid, undefined, 'an uncoupled culture carries no state rider');
  plain.dispose();
  plain2.dispose();
  uncoupled.dispose();
}

// 2. coupling is real, and nothing moves before the first biased generation can occur
{
  const coupled = createLiveResolver();
  const coupledHs = run(coupled, N, { from: 0, couple: 0.8, pull: 0 }); // PULL 0: this section isolates the culture coupling (the marks' lean is pinned in dishFluidDrift.selfcheck)
  const plain = createLiveResolver();
  const plainHs = run(plain, N, null);
  assert.equal(coupledHs[0].full, plainHs[0].full, 'frame 0: the fluid has published nothing yet — no bias can act');
  assert.equal(
    coupledHs[1].full,
    plainHs[1].full,
    'frame 1: still no biased generation (the read is one frame behind)',
  );
  const firstDivergence = coupledHs.findIndex((f, i) => f.full !== plainHs[i].full);
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
  const onTimeHs = run(onTime, N, { from: 0, couple: 0.8, pull: 0 });
  const late = createLiveResolver();
  const lateHs = run(late, N, { from: 1, couple: 0.8, pull: 0 });
  assert.equal(lateHs[0].descriptor, false, 'the late run’s frame 0 has no fluid at all — no descriptor');
  assert.ok(onTimeHs[0].descriptor, 'the on-time run’s frame 0 already publishes the descriptor');
  assert.equal(lateHs[0].full, onTimeHs[0].full, 'frame 0 identical in both runs');
  assert.equal(lateHs[1].full, onTimeHs[1].full, 'frame 1 still precedes any biased generation in both runs');
  onTime.dispose();
  late.dispose();
}

// 4. snapshot / restore continues bit-identically (descriptor publishing); validation gates the shapes
{
  const a = createLiveResolver();
  run(a, 30, { from: 0, couple: 0.8 });
  const snap = JSON.parse(JSON.stringify(a.snapshotState()));
  assert.ok(snap.dishFluid, 'the snapshot carries the fluid');
  assert.deepEqual(snap.dishFluid.magnets, MAGNETS, 'and its magnets');
  assert.equal(checkResolverSnapshot(snap), true, 'the genuine snapshot validates');
  const cont = (r) => {
    const out = [];
    for (let f = 30; f < N; f++) {
      const layers = r.resolveLayers(inputAt(f, { from: 0, couple: 0.8 }));
      const plan = getLastDishFluidPlan();
      out.push({ full: hash(layers), descriptor: !!(plan && plan.fieldBody) });
    }
    return out;
  };
  const tailA = cont(a);
  const b = createLiveResolver();
  b.restoreState(snap);
  const tailB = cont(b);
  assert.deepEqual(
    tailB.map((f) => f.full),
    tailA.map((f) => f.full),
    'restored mid-run, the pair continues bit-identically',
  );
  assert.ok(
    tailA.every((f) => f.descriptor),
    'the descriptor keeps publishing through the continuation',
  );
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

// 5. vocabulary: nothing dealt → the descriptor's vocabulary is the stage's own pool
{
  const r = createLiveResolver();
  for (let f = 0; f < 30; f++) {
    const t = f * DT;
    r.resolveLayers(
      baseInput({
        loopTimeMs: t,
        dtSec: DT / 1000,
        layoutParams: lp({ mode: 'swarm', count: 0, particleCount: 0 }),
        dishFluid: fluidStamp(t, { shed: 0 }),
        dishFluidMagnets: MAGNETS,
        dishFluidDial: { flow: 0.5, pull: 0.7, couple: 0 },
      }),
    );
  }
  const plan = getLastDishFluidPlan();
  assert.ok(plan && plan.fieldBody, 'the descriptor publishes on an empty stage');
  const vocab = plan.fieldBody.poolIds;
  assert.ok(Array.isArray(vocab) && vocab.length > 20, `the vocabulary is the stage pool (${vocab?.length} shapes)`);
  const poolIds = new Set(ASSETS.map((a) => a.id));
  for (const id of vocab) assert.ok(poolIds.has(id), `vocabulary shape ${id} is a pool asset`);
  assert.ok(
    vocab.some((id) => !String(id).startsWith('mrk_')),
    'the vocabulary is wider than the marks chapter — letters and stamps ride the pool',
  );
  const poemOnly = new Set([...ASSETS_KANA, ...ASSETS_KANJI].map((a) => a.id));
  assert.ok(
    vocab.every((id) => !poemOnly.has(id)),
    'poem-only stamps never appear — they are not pool assets',
  );
  r.dispose();
}

// 7. K1 slice 3c — births as data, and a host-owned field
{
  const framesOf = (r, n, over) => {
    const out = [];
    for (let f = 0; f < n; f++)
      out.push(hash(r.resolveLayers({ ...inputAt(f, over.fluid), ...(over.extra ? over.extra(f) : {}) })));
    return out;
  };
  const live = createLiveResolver();
  // PULL 0: the births list carries the culture's half only; the marks' lean reads the field itself (the cells, below)
  const liveHs = framesOf(live, N, { fluid: { from: 0, couple: 0.8, pull: 0 } });
  const rec = createLiveResolver();
  const recHs = framesOf(rec, N, {
    fluid: { from: 0, couple: 0.8, pull: 0 },
    extra: () => ({ dishBirthRecord: true }),
  });
  assert.deepEqual(recHs, liveHs, 'recording births changes no frame');
  const log = getLastDishBirths();
  assert.ok(Array.isArray(log) && log.length > 0, 'a biased run records its births');
  // the recorded list alone (no fluid stamp anywhere) reproduces the live frames
  const replay = createLiveResolver();
  const replayHs = framesOf(replay, N, {
    fluid: null,
    extra: () => ({ dishBirthReplay: JSON.parse(JSON.stringify(log)) }),
  });
  assert.deepEqual(replayHs, liveHs, 'the recorded births reproduce the biased frames without the fluid');
  // absent = off: no log is published, and the plain run is the plain run
  const plain = createLiveResolver();
  framesOf(plain, 5, { fluid: null });
  assert.equal(getLastDishBirths(), null, 'no record request = no log');
  // a host-owned field: the plan publishes the host's array and step, and the culture reads it
  const ext = { step: 777, density: new Float32Array(96 * 54).fill(0.9) };
  const hosted = createLiveResolver();
  let sawExternal = false;
  for (let f = 0; f < 6; f++) {
    hosted.resolveLayers({ ...inputAt(f, { from: 0, couple: 0.8 }), dishFluidExternal: ext });
    const plan = getLastDishFluidPlan();
    if (plan.density === ext.density && plan.step === 777) sawExternal = true;
  }
  assert.ok(sawExternal, 'the published plan carries the host density and its step');
  live.dispose();
  rec.dispose();
  replay.dispose();
  plain.dispose();
  hosted.dispose();
}

// 8. K1 slice 4b — the field as a recorded input: live == replay, no fluid kernel needed
{
  const NN = 96 * 54;
  const cellsAt = (f) => {
    const d = new Float32Array(NN);
    for (let i = 0; i < NN; i++) d[i] = ((i * 37 + f * 11) % 100) / 100; // a varied field that moves every frame
    return packFluidCells(d, f);
  };
  const FR = 40;
  const drive = (r, inputs) => inputs.map((inp) => hash(r.resolveLayers(inp)));
  const withCells = (f) => ({ ...inputAt(f, { from: 0, couple: 0.8 }), dishFluidCells: cellsAt(f) });
  const liveInputs = Array.from({ length: FR }, (_, f) => withCells(f));
  const log = createInputLog();
  for (const inp of liveInputs) log.record(inp);
  const replayInputsArr = [...replayInputs(JSON.parse(JSON.stringify(log.finish())))];
  const a = createLiveResolver();
  const liveHs = drive(a, liveInputs);
  const b = createLiveResolver();
  const replayHs = drive(b, replayInputsArr);
  assert.deepEqual(replayHs, liveHs, 'a JSON round-trip of the recorded cells replays the very same frames');
  // the cells are what the culture reads: a run on the JS fluid differs
  const js = createLiveResolver();
  const jsHs = drive(
    js,
    Array.from({ length: FR }, (_, f) => inputAt(f, { from: 0, couple: 0.8 })),
  );
  assert.notDeepEqual(jsHs, liveHs, 'the recorded field, not the JS kernel, drives the bias');
  // the plan carries the field the readers saw, at the recorded step
  const c = createLiveResolver();
  c.resolveLayers(withCells(5));
  const plan = getLastDishFluidPlan();
  assert.equal(plan.step, 5);
  assert.equal(plan.density.length, NN);
  // a malformed cells object is inert: the JS kernel runs as if it were absent
  const m = createLiveResolver();
  const mHs = drive(
    m,
    Array.from({ length: 10 }, (_, f) => ({ ...inputAt(f, { from: 0, couple: 0.8 }), dishFluidCells: { junk: 1 } })),
  );
  const j2 = createLiveResolver();
  assert.deepEqual(
    mHs,
    drive(
      j2,
      Array.from({ length: 10 }, (_, f) => inputAt(f, { from: 0, couple: 0.8 })),
    ),
    'junk cells = no cells',
  );
  for (const r of [a, b, js, c, m, j2]) r.dispose();
}

// 9. K1 slice 4c — a take recorded with the GPU field stamps gpu.gs.v1, round-trips JSON, and verifies on any device
{
  const NN = 96 * 54;
  const cellsAt = (f) => {
    const d = new Float32Array(NN);
    for (let i = 0; i < NN; i++) d[i] = ((i * 53 + f * 7) % 100) / 100;
    return packFluidCells(d, f);
  };
  const record = (withCells) => {
    const rec = createPerformanceRecorder();
    const r = createLiveResolver();
    for (let f = 0; f < 130; f++) {
      const inp = { ...inputAt(f, { from: 0, couple: 0.8 }), ...(withCells ? { dishFluidCells: cellsAt(f) } : {}) };
      rec.onInput(inp);
      rec.onOutput(r.resolveLayers(inp));
    }
    r.dispose();
    return rec.finish();
  };
  const gpu = record(true);
  assert.equal(gpu.simBackends.fluid, 'gpu.gs.v1');
  assert.equal(gpu.simLaw, 'decisions-exact');
  const back = JSON.parse(JSON.stringify(gpu));
  assert.equal(checkPerformance(back).simBackends.fluid, 'gpu.gs.v1');
  const v = verifyPerformance(back);
  assert.equal(v.ok, true, 'the recorded field replays the take with no GPU');
  assert.deepEqual(v.simUnrunnable, []);
  const js = record(false);
  assert.equal(js.simBackends.fluid, 'js.gs.v1', 'no GPU field = the all-JS stamp, as before');
  assert.equal(js.simLaw, 'js-exact');
}

// 10. K2 slice 2b — the GPU culture's grid as a recorded input: live == replay through the JSON log, and the recorded
// grid (not the JS steps) is what the frame sees
{
  const NN = 96 * 54;
  const gridAt = (f) => {
    const g = new Uint8Array(NN);
    for (let i = 0; i < NN; i++) g[i] = (i * 31 + f * 17) % 9 < 3 ? 1 + ((i + f) % 3) : 0;
    return g;
  };
  const FR = 30;
  const drive = (r, inputs) => inputs.map((inp) => hash(r.resolveLayers(inp)));
  const withCulture = (f) => ({ ...inputAt(f, null), dishCultureCells: packCultureCells(gridAt(f), f) });
  const liveInputs = Array.from({ length: FR }, (_, f) => withCulture(f));
  const log = createInputLog();
  for (const inp of liveInputs) log.record(inp);
  const replayArr = [...replayInputs(JSON.parse(JSON.stringify(log.finish())))];
  const a = createLiveResolver();
  const liveHs = drive(a, liveInputs);
  const b = createLiveResolver();
  assert.deepEqual(
    drive(b, replayArr),
    liveHs,
    'a JSON round-trip of the recorded culture replays the very same frames',
  );
  const js = createLiveResolver();
  const jsHs = drive(
    js,
    Array.from({ length: FR }, (_, f) => inputAt(f, null)),
  );
  assert.notDeepEqual(jsHs, liveHs, 'the recorded grid, not the JS steps, is the culture');
  // junk is inert: the JS culture runs as if the key were absent
  const m = createLiveResolver();
  const mHs = drive(
    m,
    Array.from({ length: FR }, (_, f) => ({ ...inputAt(f, null), dishCultureCells: { gen: 1, idx: [1], v: [1] } })),
  );
  assert.deepEqual(mHs, jsHs, 'a malformed culture-cells object is inert');
  for (const r of [a, b, js, m]) r.dispose();
}

// 11. K2 slice 2b — a take recorded with the GPU culture stamps gpu.life.v1 (and gpu.gs.v1 beside a GPU fluid), round-trips JSON,
// and verifies on any device
{
  const NN = 96 * 54;
  const gridAt = (f) => {
    const g = new Uint8Array(NN);
    for (let i = 0; i < NN; i++) g[i] = (i * 13 + f * 5) % 7 < 2 ? 1 + ((i + f) % 3) : 0;
    return g;
  };
  const record = (withCulture, withFluid) => {
    const rec = createPerformanceRecorder();
    const r = createLiveResolver();
    for (let f = 0; f < 60; f++) {
      const inp = {
        ...inputAt(f, withFluid ? { from: 0, couple: 0.8 } : null),
        ...(withCulture ? { dishCultureCells: packCultureCells(gridAt(f), f) } : {}),
      };
      rec.onInput(inp);
      rec.onOutput(r.resolveLayers(inp));
    }
    r.dispose();
    return rec.finish();
  };
  const gpu = record(true, false);
  assert.equal(gpu.simBackends.culture, 'gpu.life.v1');
  assert.equal(gpu.simBackends.fluid, 'js.gs.v1');
  assert.equal(gpu.simLaw, 'decisions-exact');
  const back = JSON.parse(JSON.stringify(gpu));
  assert.equal(checkPerformance(back).simBackends.culture, 'gpu.life.v1');
  const v = verifyPerformance(back);
  assert.equal(v.ok, true, 'the recorded grid replays the take with no GPU');
  assert.deepEqual(v.simUnrunnable, []);
  const js = record(false, false);
  assert.equal(js.simBackends.culture, 'js.life.v1', 'no GPU grid = the all-JS stamp, as before');
  assert.equal(js.simLaw, 'js-exact');
}

console.log('liveResolve.dishFluid.selfcheck: ok');
