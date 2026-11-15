// dishFluidPull.selfcheck.mjs — FERROFLUID #2178: the bone pull (channel 2).
//
// THE LAW (Matt, ruled 2026-11-15): toward the magnet, field-gated. This suite pins the
// read (engine/dishFluidPull.mjs), its composition through poseFigure (the survey's §4b
// slot: after the bone's source delta, before the part kineme — rotation for every bone,
// offset for roots only, bars through the linkage's per-bar delta map), and one expansion
// end-to-end through the creature seam:
//
//   - the read's null cases: no magnets (wild-grown field pulls nothing), dial at 0, the
//     joint's cell under the density floor, the joint off the dish, degenerate geometry;
//   - the read's exact values on a controlled field: direction toward the nearest magnet
//     (the kernel's aspect-corrected metric picks it), strength = density × dial, the
//     bend fraction and the root drift;
//   - zero-pull parity: a sampler that returns null everywhere poses every figure kind
//     Object.is-identical to no sampler at all (the channel's absence is invisible);
//   - composition: a pulled root rotates by the sampler's dRot and drifts by its offset;
//     a pulled child rotates locally and its joint rides the parent's pulled tip; a pulled
//     linkage bar bends by its own per-instance pull (never summed across the legs that
//     share its name); a mobile's root drifts;
//   - the expansion: a placed tile in a dense field with a magnet bends its parts toward
//     the magnet (the sign flips with the magnet), an empty field changes nothing, and a
//     frozen frame never pulls.
import assert from 'node:assert/strict';
import './motionCore/kinemeSources.js'; // the kineme sources register on import (poseFigure resolves through the registry)
import { bonePullDelta, PULL_BEND, PULL_DRIFT_PX, PULL_DENSITY_FLOOR } from './dishFluidPull.mjs';
import { poseFigure } from './motionCore/rigSources.js';
import { expandCreatureInstances, sanitizeRig } from './creatureRig.js';
import { sanitizeMeasures } from './beastBuilder.js';
import { wildTypeMeasures } from './jansenMeasures.js';
import { FLUID_GRID_COLS, FLUID_GRID_ROWS } from './dishFluid.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const N = FLUID_GRID_COLS * FLUID_GRID_ROWS;
const denseField = (over = {}) => ({
  density: new Float32Array(N).fill(1),
  magnets: [{ x: 0.5, y: 0.25 }],
  pull: 1,
  aspectHW: 1,
  W: 1000,
  H: 1000,
  ...over,
});

console.log('dishFluidPull — toward the magnet, field-gated (#2178)');

ok('the read: exact bend and drift toward a magnet due north', () => {
  // bone pointing east from (500, 500); magnet at dish (0.5, 0.25) = stage (500, 250), due north
  const pd = bonePullDelta(denseField(), 500, 500, 600, 500);
  assert.ok(pd, 'a pull is returned');
  assert.ok(near(pd.dRot, -90 * PULL_BEND), `dRot closes half the angle to the magnet (${pd.dRot})`);
  assert.ok(near(pd.offX, 0) && near(pd.offY, -PULL_DRIFT_PX), 'the root drift points at the magnet at full measure');
});

ok('the read: strength scales with density and dial together', () => {
  const density = new Float32Array(N).fill(0.5);
  const pd = bonePullDelta(denseField({ density, pull: 0.5 }), 500, 500, 600, 500);
  assert.ok(near(pd.dRot, -90 * 0.25 * PULL_BEND), 'strength 0.5 × 0.5 bends a quarter as hard');
  assert.ok(near(pd.offY, -PULL_DRIFT_PX * 0.25));
  const capped = bonePullDelta(denseField({ pull: 7 }), 500, 500, 600, 500);
  assert.ok(near(capped.dRot, -90 * PULL_BEND), 'the dial caps at 1');
});

ok('the read: null cases — no magnets, dial 0, under the floor, off the dish, degenerate', () => {
  assert.equal(bonePullDelta(denseField({ magnets: [] }), 500, 500, 600, 500), null, 'wild field, no magnet: no pull');
  assert.equal(bonePullDelta(denseField({ pull: 0 }), 500, 500, 600, 500), null, 'dial at 0');
  const thin = new Float32Array(N).fill(0.1);
  assert.equal(bonePullDelta(denseField({ density: thin }), 500, 500, 600, 500), null, 'under the floor');
  const edge = new Float32Array(N).fill(0);
  edge[Math.floor(0.5 * FLUID_GRID_ROWS) * FLUID_GRID_COLS + Math.floor(0.5 * FLUID_GRID_COLS)] = PULL_DENSITY_FLOOR;
  assert.ok(bonePullDelta(denseField({ density: edge }), 500, 500, 600, 500), 'exactly at the floor pulls');
  assert.equal(bonePullDelta(denseField(), -5, 500, 600, 500), null, 'joint off the dish (west)');
  assert.equal(bonePullDelta(denseField(), 500, 1000, 600, 500), null, 'joint off the dish (south edge)');
  assert.equal(bonePullDelta(denseField(), 500, 500, 500, 500), null, 'a zero-length bone has no direction');
  assert.equal(bonePullDelta(denseField(), 500, 250, 600, 250), null, 'the joint on the magnet has no direction');
  assert.equal(bonePullDelta(null, 500, 500, 600, 500), null);
  assert.equal(
    bonePullDelta(denseField({ density: new Float32Array(4) }), 500, 500, 600, 500),
    null,
    'a malformed field reads as no field',
  );
});

ok('the read: the nearest magnet wins, by the kernel’s aspect-corrected metric', () => {
  // magnet A due north but far; magnet B due south and nearer — the bone bends south (positive dRot)
  const field = denseField({
    magnets: [
      { x: 0.5, y: 0.05 },
      { x: 0.5, y: 0.62 },
    ],
  });
  const pd = bonePullDelta(field, 500, 500, 600, 500);
  assert.ok(pd.dRot > 0, `bends toward the nearer (southern) magnet (${pd.dRot})`);
  assert.ok(pd.offY > 0, 'and drifts toward it');
});

// ---- poseFigure composition -------------------------------------------------

const head = { id: 'h', role: 'head', chain: -1, parent: null, x: 50, y: 20, angle: -90, len: 14 };
const limb = (chain, depth, x, y, angle, len) => ({
  id: `l${chain}.${depth}`,
  role: 'limb',
  chain,
  parent: depth ? `l${chain}.${depth - 1}` : null,
  x,
  y,
  angle,
  len,
});
const RIG_A = {
  bones: [
    head,
    limb(0, 0, 35, 70, 120, 30),
    limb(0, 1, 0, 0, 20, 24),
    limb(1, 0, 65, 70, 60, 30),
    limb(1, 1, 0, 0, -20, 24),
  ],
};
const LINK = { measures: sanitizeMeasures(wildTypeMeasures()), phase: 0 };
const MOBILE = {
  figure: 'mobile',
  bones: [
    { id: 'hub', role: 'body', chain: -1, parent: null, x: 50, y: 50, angle: 0, len: 10 },
    { id: 'l0.0', role: 'limb', chain: 0, parent: null, x: 40, y: 60, angle: 90, len: 20 },
    { id: 'l0.1', role: 'limb', chain: 0, parent: 'l0.0', x: 0, y: 0, angle: 15, len: 16 },
  ],
};
const boneIs = (a, b) => {
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), `${b.id || b.name}: field set`);
  for (const k of Object.keys(b)) assert.ok(Object.is(a[k], b[k]), `${b.id || b.name}.${k}: ${a[k]} !== ${b[k]}`);
};

ok('zero-pull parity: a null sampler poses every figure kind Object.is-identical', () => {
  const nullSampler = () => null;
  for (const t of [0, 0.7, 2.3]) {
    poseFigure(RIG_A, t, { gait: 'NOD', phase: 0.2 }).forEach((p, i) =>
      boneIs(poseFigure(RIG_A, t, { gait: 'NOD', phase: 0.2, pullSampler: nullSampler })[i], p),
    );
    poseFigure(LINK, t, { crank: 0.4 }).forEach((p, i) =>
      boneIs(poseFigure(LINK, t, { crank: 0.4, pullSampler: nullSampler })[i], p),
    );
    poseFigure(MOBILE, t, {}).forEach((p, i) => boneIs(poseFigure(MOBILE, t, { pullSampler: nullSampler })[i], p));
  }
});

ok('composition (tree): a pulled root rotates by dRot and drifts; its child rides the pulled tip', () => {
  const base = poseFigure(RIG_A, 0.7, { gait: 'NOD', phase: 0.2 });
  const sampler = (key) => (key === 'l0.0' ? { dRot: 12, dx: 3, dy: -2 } : null);
  const pulled = poseFigure(RIG_A, 0.7, { gait: 'NOD', phase: 0.2, pullSampler: sampler });
  const b0 = base.find((p) => p.id === 'l0.0');
  const p0 = pulled.find((p) => p.id === 'l0.0');
  assert.ok(near(p0.angle, b0.angle + 12), 'the root’s angle gains exactly the pull rotation');
  assert.ok(near(p0.x, b0.x + 3) && near(p0.y, b0.y - 2), 'the root’s joint drifts by the pull offset');
  const b1 = base.find((p) => p.id === 'l0.1');
  const p1 = pulled.find((p) => p.id === 'l0.1');
  assert.ok(near(p1.x, p0.tx) && near(p1.y, p0.ty), 'the child’s joint is the parent’s PULLED tip');
  assert.ok(!near(p1.x, b1.x) || !near(p1.y, b1.y), 'and so the child moved without being pulled itself');
  const bh = base.find((p) => p.id === 'h');
  const ph = pulled.find((p) => p.id === 'h');
  boneIs(ph, bh); // an unpulled root on its own chain is untouched
});

ok('composition (tree): a pulled child rotates locally; its offset is not applied (roots only)', () => {
  const base = poseFigure(RIG_A, 0.7, { gait: 'NOD', phase: 0.2 });
  const sampler = (key) => (key === 'l0.1' ? { dRot: 9, dx: 40, dy: 40 } : null);
  const pulled = poseFigure(RIG_A, 0.7, { gait: 'NOD', phase: 0.2, pullSampler: sampler });
  const b1 = base.find((p) => p.id === 'l0.1');
  const p1 = pulled.find((p) => p.id === 'l0.1');
  assert.ok(near(p1.angle, b1.angle + 9), 'the child’s angle gains the pull rotation');
  assert.ok(
    near(p1.x, b1.x) && near(p1.y, b1.y),
    'the child’s joint stays on the parent’s tip — no offset for a child',
  );
});

ok('composition (linkage + mobile): each bar bends by its own pull, exactly once; a mobile root drifts', () => {
  const baseBars = poseFigure(LINK, 1.1, { crank: 0.4 });
  const barSampler = (name) => (name === 'frame' ? { dRot: 6, dx: 0, dy: 0 } : null);
  const pulledBars = poseFigure(LINK, 1.1, { crank: 0.4, pullSampler: barSampler });
  baseBars.forEach((p, i) => {
    if (p.name === 'frame') {
      assert.ok(near(pulledBars[i].angle, p.angle + 6), 'each frame bar’s angle gains the pull rotation exactly once');
    } else {
      boneIs(pulledBars[i], p);
    }
  });
  const baseM = poseFigure(MOBILE, 0.9, {});
  const mobSampler = (key) => (key === 'l0.0' ? { dRot: 0, dx: 5, dy: 7 } : null);
  const pulledM = poseFigure(MOBILE, 0.9, { pullSampler: mobSampler });
  const bm = baseM.find((p) => p.id === 'l0.0');
  const pm = pulledM.find((p) => p.id === 'l0.0');
  assert.ok(near(pm.x, bm.x + 5) && near(pm.y, bm.y + 7), 'the mobile root drifts by the pull offset');
});

// ---- the expansion, end to end ------------------------------------------------

ok('expansion: a placed tile bends toward the magnet; empty field and frozen frames do not pull', () => {
  const rig = sanitizeRig({
    bones: [
      head,
      limb(0, 0, 35, 70, 120, 30),
      limb(0, 1, 0, 0, 20, 24),
      limb(1, 0, 65, 70, 60, 30),
      limb(1, 1, 0, 0, -20, 24),
    ],
  });
  assert.ok(rig, 'the hand rig sanitizes');
  const overlay = new Map([['user:test', { category: 'creature', source: 'wetlab', rig: rig }]]);
  const tile = {
    asset: 'user:test',
    x: 640,
    y: 400,
    scaleX: 4,
    scaleY: 4,
    rotation: 0,
    key: 'tile1',
    seedOffset: 3,
    tint: '#202020',
    accent: '#202020',
  };
  const stage = [
    { asset: 'geo_circle_01', x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0, key: 's1', seedOffset: 0 },
    { asset: 'org_blob_01', x: 1100, y: 650, scaleX: 1, scaleY: 1, rotation: 0, key: 's2', seedOffset: 0 },
    tile,
  ];
  const opts = { seed: 5, t: 0.7, poseFigure };
  const plain = expandCreatureInstances(stage, overlay, opts);
  assert.ok(plain.length > stage.length, 'the tile expanded');
  const fieldAt = (mx, my) => ({
    density: new Float32Array(N).fill(1),
    magnets: [{ x: mx, y: my }],
    pull: 1,
    aspectHW: 800 / 1280,
    W: 1280,
    H: 800,
  });
  const north = expandCreatureInstances(stage, overlay, { ...opts, pullField: fieldAt(0.5, 0.1) });
  const south = expandCreatureInstances(stage, overlay, { ...opts, pullField: fieldAt(0.5, 0.9) });
  const partsOf = (arr) => arr.filter((it) => it !== tile && !stage.includes(it));
  const rotSum = (arr) => partsOf(arr).reduce((a, it) => a + (it.rotation || 0), 0);
  assert.notDeepEqual(partsOf(north), partsOf(plain), 'a magnet north bends the figure');
  assert.notDeepEqual(partsOf(south), partsOf(plain), 'a magnet south bends the figure');
  assert.ok(
    Math.sign(rotSum(north) - rotSum(plain)) !== Math.sign(rotSum(south) - rotSum(plain)) ||
      Math.abs(rotSum(north) - rotSum(south)) > 1,
    'the bend follows the magnet, not a fixed direction',
  );
  const empty = expandCreatureInstances(stage, overlay, {
    ...opts,
    pullField: {
      density: new Float32Array(N).fill(0),
      magnets: [{ x: 0.5, y: 0.1 }],
      pull: 1,
      aspectHW: 0.625,
      W: 1280,
      H: 800,
    },
  });
  assert.deepEqual(partsOf(empty), partsOf(plain), 'a field under the floor everywhere changes nothing');
  const frozen = expandCreatureInstances(stage, overlay, { ...opts, frozen: true, pullField: fieldAt(0.5, 0.1) });
  const frozenPlain = expandCreatureInstances(stage, overlay, { ...opts, frozen: true });
  assert.deepEqual(partsOf(frozen), partsOf(frozenPlain), 'a frozen frame never pulls — the exact rest pose');
});

console.log(`dishFluidPull.selfcheck: ok (${n} groups)`);
