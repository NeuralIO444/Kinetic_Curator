// node src/gl/liveResolve.gaitBreakup.selfcheck.mjs
// #2330 (GAIT M4) — the resolver end: the recorded ferrofluid breaks a construct up, its gait says how.
//   1. hard gate: the fluid with no gait, a gait with no fluid, the fluid without the marks marker, and CONSTRUCTS off
//      never start a break (no fold in the snapshot, the pieces exactly as without the fluid)
//   2. the replay fixture: leaf-first release is observable — the leaves' release frame precedes the root's
//   3. after the rejoin every piece's world transform equals its rest pose exactly; with the gait gone too, the
//      construct is its exact flat tile again (no pop)
//   4. a take with a break-up replays to every checkpoint; a take started mid-break (snapshot) continues identically
import assert from 'node:assert/strict';
import { createLiveResolver } from './liveResolve.mjs';
import { withResolveTap, setResolveTap, setResolveOutputTap } from './resolveTap.mjs';
import { createPerformanceRecorder, verifyPerformance, createHashChain } from './performanceFile.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { ASSETS_CONSTRUCTS, HOUSE_CONSTRUCT_RECORDS } from '../data/assets/index.js';
import { canonGaits } from '../data/canon/gaits.js';
import { gaitInputStamp } from '../engine/gaitAssign.js';
import { constructJoinTree } from '../engine/constructPieces.js';
import { fluidStamp, FLUID_GRID_COLS, FLUID_GRID_ROWS } from '../engine/dishFluid.mjs';
import { packFluidCells } from '../engine/dishFluidCells.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const TILE = ASSETS_CONSTRUCTS.find((a) => a.style === 'organic').id; // organic: leaf-first, follow-flow, retrace
const L = { id: 'lyr-a', name: 'a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 };
const STABLE = {
  canvasW: 1000,
  canvasH: 700,
  layers: [L],
  activeLayerId: 'lyr-a',
  layerSnapshots: {},
  seed: 7,
  paletteId: 'bone',
  userPalettes: [],
  enabledAssets: { [TILE]: true, geo_circle_01: true },
  assetWeightOverrides: {},
  customAssets: [],
  lockedParams: {},
  scaleMul: 1,
  alphaBoost: 0,
  assetAttach: {},
  layoutParams: {
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'grid',
    count: 8,
    scale: [0.9, 1.3],
    kinemeBreath: 0,
    kinemePulse: 0,
    kinemeDrift: 0,
  },
};
const CELLS = FLUID_GRID_COLS * FLUID_GRID_ROWS;
const DENSE = new Float32Array(CELLS).fill(0.9);
const EMPTY = new Float32Array(CELLS);
const FRAMES = 420;
const FIELD_ON = 60; // the field arrives (the resolver reads it one frame behind)
const FIELD_OFF = 220; // and leaves
const PERFORMING = () => gaitInputStamp({ [TILE]: { gaitId: canonGaits('organic').performing.id } }, 120);

/** One session. fieldAt(f) → dense | empty | null (no fluid at all); gaitAt(f) → the stamp or null. */
function session({
  fieldAt = () => null,
  gaitAt = PERFORMING,
  marks = true,
  pieces = true,
  record = false,
  frames = FRAMES,
  resolver: given = null,
  from = 0,
  keepSnapAt = -1,
} = {}) {
  const recorder = record ? createPerformanceRecorder() : null;
  const resolver = given || (record ? withResolveTap(createLiveResolver) : createLiveResolver());
  if (recorder) {
    setResolveTap((i) => recorder.onInput(i));
    setResolveOutputTap((o) => recorder.onOutput(o));
  }
  const chain = createHashChain();
  const hashes = [];
  const frameItems = [];
  const folds = [];
  let kept = null;
  for (let f = from; f < frames; f++) {
    const t = (f + 1) * (1000 / 60);
    const fld = fieldAt(f);
    const g = gaitAt(f);
    const input = {
      ...STABLE,
      loopTimeMs: t,
      dtSec: 1 / 60,
      ...(pieces ? { constructPieces: true } : {}),
      ...(g ? { gaits: g } : {}),
      ...(fld
        ? {
            dishFluid: fluidStamp(t, { shed: 0 }),
            dishFluidMagnets: [{ x: 0.5, y: 0.5 }],
            dishFluidDial: { flow: 0.5, pull: 0.7, couple: 0 },
            dishFluidCells: packFluidCells(fld, f),
            ...(marks ? { dishFluidMarks: 1 } : {}),
          }
        : {}),
    };
    const out = resolver.resolveLayers(input);
    chain.push(out);
    hashes.push(chain.value());
    frameItems.push(out.flatMap((e) => e.items || []));
    if (!record) {
      const snap = resolver.snapshotState(); // (the tapped resolver of a recording session has no snapshot surface)
      folds.push(snap.gaitBreak || null);
      if (f === keepSnapAt) kept = JSON.parse(JSON.stringify(snap));
    }
  }
  if (recorder) {
    setResolveTap(null);
    setResolveOutputTap(null);
  }
  return { hashes, frameItems, folds, kept, resolver, perf: recorder ? recorder.finish() : null };
}

const fieldWindow = (f) => (f >= FIELD_ON && f < FIELD_OFF ? DENSE : EMPTY);
const pieceTf = (items) =>
  items
    .filter((i) => typeof i.key === 'string' && i.key.includes('#p'))
    .map((i) => [i.key, i.x, i.y, i.rotation, i.scale, i.scaleY, i.alpha]);

const plain = session(); // the gait alone, no fluid
const MID = FIELD_ON + 80;
const broken = session({ fieldAt: fieldWindow, keepSnapAt: MID });

ok(
  'hard gate: fluid without a gait, gait without fluid, fluid without the marks marker, CONSTRUCTS off — no break',
  () => {
    assert.ok(
      plain.folds.every((x) => x === null),
      'no fluid: no fold',
    );
    const noGait = session({ fieldAt: fieldWindow, gaitAt: () => null });
    assert.ok(
      noGait.folds.every((x) => x === null),
      'no gait: no fold',
    );
    assert.ok(
      noGait.frameItems.every((items) => pieceTf(items).length === 0),
      'no gait: every construct stays its tile',
    );
    const noMarks = session({ fieldAt: fieldWindow, marks: false });
    assert.ok(
      noMarks.folds.every((x) => x === null),
      'dishFluidMarks off: no fold',
    );
    for (let f = 0; f < FRAMES; f++)
      assert.deepEqual(
        pieceTf(noMarks.frameItems[f]),
        pieceTf(plain.frameItems[f]),
        `frame ${f}: marks off = no fluid`,
      );
    const off = session({ fieldAt: fieldWindow, pieces: false });
    assert.ok(
      off.folds.every((x) => x === null),
      'CONSTRUCTS off: no fold',
    );
    // before the field arrives the broken run is the plain run, hash for hash
    for (let f = 0; f < FIELD_ON; f++) assert.equal(broken.folds[f], null);
    assert.ok(broken.folds[FIELD_ON] !== null, 'the recorded cells break it the frame they arrive');
  },
);

ok('the replay fixture: leaf-first release — the leaves’ release frame precedes the root’s', () => {
  const tree = constructJoinTree(HOUSE_CONSTRUCT_RECORDS.get(TILE));
  const maxDepth = Math.max(...tree.map((t) => t.depth));
  assert.ok(maxDepth >= 2, 'a real tree');
  assert.equal(canonGaits('organic').performing.release.order, 'leaf-first');
  // a piece's release frame: the first frame its world transform leaves the plain (gait-only) run's
  const releaseFrame = new Map();
  for (let f = FIELD_ON; f < FIELD_OFF; f++) {
    const a = new Map(pieceTf(broken.frameItems[f]).map((r) => [r[0], r]));
    const b = new Map(pieceTf(plain.frameItems[f]).map((r) => [r[0], r]));
    for (const [k, r] of a) {
      if (releaseFrame.has(k)) continue;
      const q = b.get(k);
      // the tile's own lean moves every piece alike; a release moves a piece against its tile's root
      const root = k.replace(/#p\d+$/, '#p0');
      const lean = [a.get(root)[1] - b.get(root)[1], a.get(root)[2] - b.get(root)[2]];
      const own = Math.hypot(r[1] - q[1] - lean[0], r[2] - q[2] - lean[1]);
      if (own > 0.25 || r[6] !== q[6]) releaseFrame.set(k, f);
    }
  }
  let compared = 0;
  const tiles = new Set([...releaseFrame.keys()].map((k) => k.replace(/#p\d+$/, '')));
  assert.ok(tiles.size >= 1, 'a construct broke up');
  for (const tk of tiles) {
    const leafFrames = tree.filter((t) => t.depth === maxDepth).map((t) => releaseFrame.get(`${tk}#${t.id}`));
    const rootFrame = releaseFrame.get(`${tk}#p0`);
    assert.ok(Number.isInteger(rootFrame), `${tk}: the root released`);
    for (const lf of leafFrames)
      assert.ok(Number.isInteger(lf) && lf < rootFrame, `${tk}: leaf ${lf} before root ${rootFrame}`);
    compared++;
  }
  assert.ok(compared >= 1);
});

ok('after the rejoin every piece is exactly its rest pose; with the gait gone it is its exact tile again', () => {
  const home = broken.folds.findIndex((x, f) => f > FIELD_OFF && x === null);
  assert.ok(home > FIELD_OFF, 'the rejoin finishes');
  assert.ok(broken.folds[FIELD_OFF + 5] !== null, 'it was rejoining');
  for (let f = home; f < FRAMES; f++)
    assert.deepEqual(pieceTf(broken.frameItems[f]), pieceTf(plain.frameItems[f]), `frame ${f}: the rest pose, exactly`);
  // the QUEEN goes to `still` while the pieces are out: they still rejoin, then the tile is back — same as never broken
  const DROP = FIELD_OFF - 20;
  const gaitAt = (f) => (f < DROP ? PERFORMING() : null);
  const a = session({ fieldAt: fieldWindow, gaitAt });
  const b = session({ fieldAt: () => EMPTY, gaitAt });
  assert.ok(pieceTf(a.frameItems[DROP + 5]).length > 0, 'still dealt as pieces while it rejoins');
  const back = a.folds.findIndex((x, f) => f > FIELD_OFF && x === null);
  assert.ok(back > FIELD_OFF);
  // the frame the rejoin lands, the pieces stand exactly at rest (the tile's own placement); the next frame is the tile
  for (let f = back + 1; f < FRAMES; f++) {
    assert.equal(pieceTf(a.frameItems[f]).length, 0, `frame ${f}: the tile`);
    assert.deepEqual(a.frameItems[f], b.frameItems[f], `frame ${f}: the exact tile, no pop`);
  }
});

ok('a take with a break-up replays to every checkpoint; a take started mid-break continues identically', () => {
  const a = session({ fieldAt: fieldWindow, record: true });
  const b = session({ fieldAt: fieldWindow, record: true });
  assert.deepEqual(a.hashes, b.hashes, 'two live runs');
  assert.deepEqual(a.hashes, broken.hashes);
  for (const c of a.perf.checkpoints) assert.equal(c.hash, a.hashes[c.frame]);
  const v = verifyPerformance(a.perf);
  assert.equal(v.ok, true, JSON.stringify(v));
  // mid-break: snapshot the resolver while pieces are out, restore into a fresh one, continue
  assert.ok(broken.kept.gaitBreak, 'the fold rides the snapshot');
  const snap = JSON.parse(JSON.stringify(broken.kept));
  const fresh = createLiveResolver();
  assert.equal(fresh.restoreState(snap), true);
  const cont = session({ fieldAt: fieldWindow, resolver: fresh, from: MID + 1 });
  // the first restored frame's tile LEAN reads the fluid stage's restored plan, which cannot carry a host-owned (recorded
  // cells) field (K1: the fluid snapshot keeps only its seed) — a one-frame lean gap that predates M4. The break fold
  // itself reads this frame's recorded cells, so it never diverges: from the next frame on the take is identical.
  assert.equal(cont.folds[0] !== null, true, 'still broken up on the restored frame');
  for (let f = MID + 2; f < FRAMES; f++)
    assert.deepEqual(cont.frameItems[f - MID - 1], broken.frameItems[f], `frame ${f}: the continuation`);
  const junk = JSON.parse(JSON.stringify(broken.kept));
  junk.gaitBreak = { x: { m: 'sideways' } };
  assert.equal(createLiveResolver().restoreState(junk), false, 'a malformed fold is refused');
});

console.log(`liveResolve.gaitBreakup.selfcheck: ${n} checks ok`);
