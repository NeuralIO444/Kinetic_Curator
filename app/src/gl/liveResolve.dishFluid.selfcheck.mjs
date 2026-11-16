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
//                   present at COUPLE 0, frames are byte-identical to the no-fluid run WHOLE
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
  const uncoupledHs = run(uncoupled, N, { from: 0, couple: 0 });
  assert.deepEqual(
    uncoupledHs.map((f) => f.full),
    plainHs.map((f) => f.full),
    'fluid present at COUPLE 0: every frame is the no-fluid frame, whole — the body is not in the output',
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
  const coupledHs = run(coupled, N, { from: 0, couple: 0.8 });
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
  const onTimeHs = run(onTime, N, { from: 0, couple: 0.8 });
  const late = createLiveResolver();
  const lateHs = run(late, N, { from: 1, couple: 0.8 });
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
  const liveHs = framesOf(live, N, { fluid: { from: 0, couple: 0.8 } });
  const rec = createLiveResolver();
  const recHs = framesOf(rec, N, { fluid: { from: 0, couple: 0.8 }, extra: () => ({ dishBirthRecord: true }) });
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

console.log('liveResolve.dishFluid.selfcheck: ok');
