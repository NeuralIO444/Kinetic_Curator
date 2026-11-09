// node src/gl/liveResolve.dishFluid.selfcheck.mjs
// #1997 — the ferrofluid on the live resolver. The resolver stays a pure function of its
// recorded input stream: input.dishFluid (+ dishFluidMagnets / dishFluidDial) is the fluid's
// whole contribution. Pinned here:
//   off parity      no fluid keys → frames byte-identical between independent resolvers, and
//                   no dishFluid key in the snapshot. With the fluid present, the frames less
//                   the attached body (the `fluid:` items stripped) are byte-identical to the
//                   no-fluid run at COUPLE 0 — the body is the fluid's ONLY visible difference,
//                   and the culture never reads the fluid while uncoupled
//   attachment      with the fluid on, the resolved layers carry the body: ordinary `fluid:`
//                   items on the top content layer, present from the first frame (the seeded
//                   field) — and absent entirely when the stamp has not started yet
//   coupling        COUPLE up → the culture's frames (body stripped) diverge from the
//                   uncoupled run, while frames before any biased generation can occur stay
//                   identical (the one-frame-behind read)
//   start delay     starting the fluid one frame later cannot change any stripped frame
//                   before the first biased generation either
//   snapshot        a mid-run snapshot (through JSON) carries the fluid + the culture's
//                   fluid-bias rider, and a fresh resolver restored from it continues
//                   bit-identically — full frames, attached body included; checkResolverSnapshot
//                   accepts the genuine keys and refuses malformed fluid / rider shapes
//   vocabulary      on a stage with nothing dealt (a swarm layer with no particles), the body
//                   is dealt from the stage's own asset pool — every shape a real pool asset,
//                   the vocabulary wider than the marks chapter (letters/stamps ride the
//                   pool), and the poem-only alphabets never appear (not pool assets)
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLiveResolver, checkResolverSnapshot } from './liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { ASSETS } from '../data/assets/index.js';
import { ASSETS_KANA } from '../data/assets/assets-kana.js';
import { ASSETS_KANJI } from '../data/assets/assets-kanji.js';
import { quietStamp } from '../engine/dishLifeQuiet.mjs';
import { fluidStamp } from '../engine/dishFluid.mjs';
import { isFluidMatter } from '../engine/dishFluidRender.mjs';

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
/** Resolve n frames, fingerprinting each three ways: the full frame, the frame with the
 *  attached body stripped (what every pre-#1997 consumer of the frame would have seen), and
 *  the body's item count. */
const run = (r, n, fluid) => {
  const frames = [];
  for (let f = 0; f < n; f++) {
    const layers = r.resolveLayers(inputAt(f, fluid));
    let matter = 0;
    const stripped = layers.map((e) => {
      if (!e || !Array.isArray(e.items)) return e;
      const kept = e.items.filter((it) => {
        if (isFluidMatter(it)) {
          matter++;
          return false;
        }
        return true;
      });
      return kept.length === e.items.length ? e : { ...e, items: kept };
    });
    frames.push({ full: hash(layers), stripped: hash(stripped), matter });
  }
  return frames;
};
const N = 60;

// 1. off parity (full frames) + uncoupled parity (body stripped) + the body is present
{
  const plain = createLiveResolver();
  const plainHs = run(plain, N, null);
  assert.equal(plain.snapshotState().dishFluid, undefined, 'no fluid, no dishFluid key in the snapshot');
  assert.ok(
    plainHs.every((f) => f.matter === 0),
    'no fluid keys, no body on any frame',
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
    uncoupledHs.map((f) => f.stripped),
    plainHs.map((f) => f.full),
    'fluid present at COUPLE 0: less its body, every frame is the no-fluid frame',
  );
  assert.ok(uncoupledHs[0].matter > 0, 'the body attaches from the first frame (the seeded field)');
  assert.ok(uncoupledHs[N - 1].matter > 0, 'and the body is still on the dish at the last frame');
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
  assert.equal(
    coupledHs[0].stripped,
    plainHs[0].full,
    'frame 0: the fluid has published nothing yet — no bias can act',
  );
  assert.equal(
    coupledHs[1].stripped,
    plainHs[1].full,
    'frame 1: still no biased generation (the read is one frame behind)',
  );
  const firstDivergence = coupledHs.findIndex((f, i) => f.stripped !== plainHs[i].full);
  assert.ok(
    firstDivergence > 1 && firstDivergence < N,
    `the coupling lands (first stripped divergence at frame ${firstDivergence})`,
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
  assert.equal(lateHs[0].matter, 0, 'the late run’s frame 0 has no fluid at all — no body');
  assert.ok(onTimeHs[0].matter > 0, 'the on-time run’s frame 0 already carries the body');
  assert.equal(lateHs[0].stripped, onTimeHs[0].stripped, 'stripped frame 0 identical in both runs');
  assert.equal(lateHs[1].stripped, onTimeHs[1].stripped, 'frame 1 still precedes any biased generation in both runs');
  onTime.dispose();
  late.dispose();
}

// 4. snapshot / restore continues bit-identically (body included); validation gates the shapes
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
      out.push({
        full: hash(layers),
        matter: layers.reduce((m, e) => m + (Array.isArray(e?.items) ? e.items.filter(isFluidMatter).length : 0), 0),
      });
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
    'restored mid-run, the pair continues bit-identically — attached body included',
  );
  assert.ok(
    tailA.every((f) => f.matter > 0),
    'the body stays attached through the continuation',
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

// 5. vocabulary: nothing dealt → the body is dealt from the stage's own pool
{
  const r = createLiveResolver();
  let layers = null;
  for (let f = 0; f < 30; f++) {
    const t = f * DT;
    layers = r.resolveLayers(
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
  const matter = layers.flatMap((e) => (Array.isArray(e?.items) ? e.items.filter(isFluidMatter) : []));
  assert.ok(matter.length > 20, `an empty stage still grows the body from the pool (${matter.length} items)`);
  const poolIds = new Set(ASSETS.map((a) => a.id));
  for (const it of matter) assert.ok(poolIds.has(it.assetId), `body shape ${it.assetId} is a pool asset`);
  assert.ok(
    matter.some((it) => !String(it.assetId).startsWith('mrk_')),
    'the vocabulary is wider than the marks chapter — letters and stamps ride the pool',
  );
  const poemOnly = new Set([...ASSETS_KANA, ...ASSETS_KANJI].map((a) => a.id));
  assert.ok(
    matter.every((it) => !poemOnly.has(it.assetId)),
    'poem-only stamps never appear — they are not pool assets',
  );
  r.dispose();
}

console.log('liveResolve.dishFluid.selfcheck: ok');
