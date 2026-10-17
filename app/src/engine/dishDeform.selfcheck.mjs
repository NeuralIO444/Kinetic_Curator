// node src/engine/dishDeform.selfcheck.mjs
//
// Petri dish B1 (#1410) — impact deform: the law in dishDeform.mjs, pinned.
//
//   (a) a known impulse produces the predicted squash (closed form), and
//       the Spine C critically-damped spring recovers it monotonically —
//       no overshoot, no sign flip, exact rest at the end;
//   (b) physics byte-identity: deform on vs off, same seeded run, every
//       position/velocity bit equal — only render attributes differ;
//   (c) reduced-motion: the rendered deform is rest at every step and
//       holds, while the physics runs untouched (stillness law);
//   (d) the membrane wobble: deterministic per step count, bounded, and
//       present with no contacts at all;
//   (e) the governor rung: cost tier 2, shed at contract build only when
//       tier 1 is gone AND quality has stepped to performance;
//   (f) the render path: QUAD_VS declares the gated a_def attribute and
//       packInstanceData writes the deform triple at floats 21–23.

import assert from 'node:assert';
import { ParticleSystem } from './particles.js';
import { mirrorItems } from './buildPlacements.js';
import {
  feedDishDeform, stepDishDeform,
  DEFORM_MAX, DEFORM_SPRING_LAMBDA, DEFORM_IMPACT_GAIN, DEFORM_PRESSURE_GAIN,
} from './dishDeform.mjs';
import { BAKE_TIME_ORIGIN, BAKE_DT_MS } from './kernel/bake/index.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';
import { buildSceneContract, dishDeformShed, assertSceneContract } from '../gl/sceneContract.js';
import { packInstanceData } from '../gl/renderer.mjs';
import { QUAD_VS } from '../gl/shaders.mjs';
import { getCostTier, tier1ShedIds } from '../gl/costTiers.mjs';

const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff'] };
const SEED = 0x1a4f;
const EPS = 1e-12;

// (a1) — feed closed form, per-system pass. The canonical head-on pair:
// discs r=20 at dist 30 (overlap 10), velocities ±2, masses 1, e=1.
// jimp = (-(1+1)·(-4)) / (1+1) = 4; each body's Δv = 4 → impact target
// 4 · 0.06 = 0.24. Pressure target: (10/40) · 0.5 = 0.125. The dent is
// the max: 0.24, axis (1, 0), on BOTH bodies.
{
  const sys = new ParticleSystem();
  sys.init(2, 1000, 700, assets, palette, SEED);
  sys.x[0] = 400; sys.y[0] = 350; sys.x[1] = 430; sys.y[1] = 350;
  sys.vx[0] = 2; sys.vy[0] = 0; sys.vx[1] = -2; sys.vy[1] = 0;
  sys.mass[0] = 1; sys.mass[1] = 1; sys.scale[0] = 1; sys.scale[1] = 1;
  sys._contactPass({
    radius: 20, restitution: 1, repel: 0, mode: 'bounce', umask: 0xffffffff,
    breedCap: 10, seed: SEED, organism: false,
    minScale: 0.4, maxScale: 1.6, minAlpha: 40, maxAlpha: 100,
  });
  const impact = 4 * DEFORM_IMPACT_GAIN;
  const press = (10 / 40) * DEFORM_PRESSURE_GAIN;
  assert.ok(Math.abs(sys.deformMem[0] - Math.max(impact, press)) < EPS, `feed: mem[0] ${sys.deformMem[0]}`);
  assert.ok(Math.abs(sys.deformMem[1] - Math.max(impact, press)) < EPS, `feed: mem[1] ${sys.deformMem[1]}`);
  assert.ok(Object.is(sys.deformMemX[0], 1) && Object.is(sys.deformMemY[0], 0), 'feed: axis is the pair normal');
  assert.ok(Object.is(sys.deformMemX[1], 1) && Object.is(sys.deformMemY[1], 0), 'feed: both bodies dent along the line of centres');
}

// (a2) — pressure alone dents: the same overlap at rest, mode 'none'
// (no impulse exists). mem = the pressure target exactly.
{
  const sys = new ParticleSystem();
  sys.init(2, 1000, 700, assets, palette, SEED);
  sys.x[0] = 400; sys.y[0] = 350; sys.x[1] = 430; sys.y[1] = 350;
  sys.vx[0] = 0; sys.vy[0] = 0; sys.vx[1] = 0; sys.vy[1] = 0;
  sys.mass[0] = 1; sys.mass[1] = 1; sys.scale[0] = 1; sys.scale[1] = 1;
  sys._contactPass({
    radius: 20, restitution: 1, repel: 0, mode: 'none', umask: 0xffffffff,
    breedCap: 10, seed: SEED, organism: false,
    minScale: 0.4, maxScale: 1.6, minAlpha: 40, maxAlpha: 100,
  });
  const press = (10 / 40) * DEFORM_PRESSURE_GAIN;
  assert.ok(Math.abs(sys.deformMem[0] - press) < EPS, `pressure-only feed: ${sys.deformMem[0]} vs ${press}`);
  assert.ok(Math.abs(sys.deformMem[1] - press) < EPS, 'pressure dents both bodies');
}

// (a3) — the spring: amt_k = amt_0 · exp(-lambda · k · dt), the Spine C
// critically-damped step. Monotone decreasing, never negative (no
// overshoot, no sign flip — the exp-damp character), and snapped to
// exact rest once settled. Stepped under reduced-motion so the wobble
// cannot blur the pin: the spring runs, the render holds rest.
{
  const sys = new ParticleSystem();
  sys.init(2, 1000, 700, assets, palette, SEED);
  sys.deformMem[0] = 0.4; sys.deformMemX[0] = 1; sys.deformMemY[0] = 0;
  let prev = 0.4;
  for (let k = 0; k < 30; k++) {
    stepDishDeform(sys, 1 / 60, { reducedMotion: true });
    const m = sys.deformMem[0];
    assert.ok(m < prev, `spring step ${k}: strictly recovering (${m} < ${prev})`);
    assert.ok(m >= 0, 'spring never overshoots below rest');
    assert.ok(Object.is(sys.deformAmt[0], 0), 'reduced-motion renders rest while the spring runs');
    prev = m;
  }
  const expected = 0.4 * Math.exp(-DEFORM_SPRING_LAMBDA * 30 * (1 / 60));
  assert.ok(Math.abs(prev - expected) < 1e-9, `spring closed form: ${prev} vs ${expected}`);
  for (let k = 0; k < 600; k++) stepDishDeform(sys, 1 / 60, { reducedMotion: true });
  assert.ok(Object.is(sys.deformMem[0], 0), 'spring settles to exact rest');
  assert.ok(Object.is(sys.deformAmt[0], 0), 'rendered rest holds');
}

// (a4) — composition: one step after the (a1) impact, the rendered dent
// is the spring state (one decay step) plus at most the wobble ceiling,
// still pointing along the collision axis.
{
  const sys = new ParticleSystem();
  sys.init(2, 1000, 700, assets, palette, SEED);
  sys.x[0] = 400; sys.y[0] = 350; sys.x[1] = 430; sys.y[1] = 350;
  sys.vx[0] = 2; sys.vy[0] = 0; sys.vx[1] = -2; sys.vy[1] = 0;
  sys.mass[0] = 1; sys.mass[1] = 1; sys.scale[0] = 1; sys.scale[1] = 1;
  sys._contactPass({
    radius: 20, restitution: 1, repel: 0, mode: 'bounce', umask: 0xffffffff,
    breedCap: 10, seed: SEED, organism: false,
    minScale: 0.4, maxScale: 1.6, minAlpha: 40, maxAlpha: 100,
  });
  stepDishDeform(sys, 1 / 60, {});
  assert.ok(sys.deformAmt[0] > 0.15, `rendered dent survives composition: ${sys.deformAmt[0]}`);
  assert.ok(sys.deformAmt[0] <= DEFORM_MAX, 'rendered dent never exceeds the cap');
  assert.ok(sys.deformAxisX[0] > 0.9, `rendered axis stays on the collision line: ${sys.deformAxisX[0]}`);
}

// Seeded full-update harness for (b), (c), (d).
const lpSwarm = (over = {}) => normalizeLayoutParams({
  ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: 90,
  contactRadius: 26, contactMode: 'bounce', contactRestitution: 0.6,
  kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0, ...over,
});
const runSys = (lp, steps, extra = {}) => {
  const sys = new ParticleSystem();
  sys.init(lp.particleCount, 1000, 700, assets, palette, SEED, null, { graze: lp.graze || 0 });
  let maxAmt = 0;
  let restEveryStep = true;
  for (let s = 0; s < steps; s++) {
    sys.update({ ...lp, maxParticles: 200, ...extra }, assets, palette, SEED, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
    for (let i = 0; i < sys.n; i++) {
      if (sys.deformAmt[i] > maxAmt) maxAmt = sys.deformAmt[i];
      if (!Object.is(sys.deformAmt[i], 0)) restEveryStep = false;
    }
  }
  return { sys, maxAmt, restEveryStep };
};
const assertSamePhysics = (a, b, label) => {
  for (const f of ['x', 'y', 'vx', 'vy']) {
    for (let i = 0; i < a.n; i++) {
      assert.ok(Object.is(a[f][i], b[f][i]), `${label}: ${f}[${i}] ${a[f][i]} vs ${b[f][i]}`);
    }
  }
};

// (b) — physics byte-identity, deform on vs off: 45 seeded steps of a
// crowded, colliding swarm. Every physics column bit-equal; the off
// run renders no deform at all; items differ only in the deform fields.
{
  const on = runSys(lpSwarm(), 45);
  const off = runSys(lpSwarm(), 45, { deform: false });
  assertSamePhysics(on.sys, off.sys, 'deform on == deform off');
  assert.ok(on.maxAmt > 0, 'the on run actually dented (the comparison is not vacuous)');
  assert.ok(off.restEveryStep, 'the off run never renders a dent');
  const strip = (items) => items.map(({ deformAmt, deformAxisX, deformAxisY, ...rest }) => rest);
  assert.deepStrictEqual(strip(on.sys.getItems(assets)), off.sys.getItems(assets),
    'items identical once the deform fields are stripped');
}

// (c) — reduced-motion: rendered rest at every step, items carry no
// deform fields, and the physics is bit-identical to the moving run —
// the stillness law restrains the render, never the world.
{
  const on = runSys(lpSwarm(), 45);
  const rm = runSys(lpSwarm(), 45, { reducedMotion: true });
  assert.ok(rm.restEveryStep, 'reduced-motion: deform resolves to rest and holds, every step');
  assertSamePhysics(on.sys, rm.sys, 'reduced-motion == full motion, physically');
  const items = rm.sys.getItems(assets);
  assert.ok(items.every((it) => !('deformAmt' in it)), 'reduced-motion items carry no deform fields');
}

// (d) — wobble: no contacts at all (radius 0), yet bodies are not
// billiard-still: some body wobbles past 0.01 within 90 steps, never
// past the cap, and the whole thing is a pure function of step count.
{
  const w1 = runSys(lpSwarm({ contactRadius: 0 }), 90);
  const w2 = runSys(lpSwarm({ contactRadius: 0 }), 90);
  assert.ok(w1.maxAmt > 0.01, `membrane wobble is present at rest: max ${w1.maxAmt}`);
  assert.ok(w1.maxAmt <= DEFORM_MAX, 'wobble stays under the deform cap');
  for (let i = 0; i < w1.sys.n; i++) {
    assert.ok(Object.is(w1.sys.deformAmt[i], w2.sys.deformAmt[i]), `wobble deterministic at body ${i}`);
  }
}

// (e) — the governor rung: tier 2 (after tier 1, before radius fidelity
// and counts), and the shed predicate needs BOTH the tier-1 shed and
// the quality step — either alone leaves deform on the contract.
{
  const decl = getCostTier('engine/dish-deform');
  assert.ok(decl, 'deform cost tier registered');
  assert.strictEqual(decl.tier, 2, 'deform sheds on the tier-2 rung (spec §7: finishes, then deform)');
  assert.ok(!tier1ShedIds().includes('engine/dish-deform'), 'deform is not a tier-1 (finishes) shed');
  assert.strictEqual(dishDeformShed({ perfTier1: true, quality: 'performance' }), true, 'shed: tier 1 gone + quality stepped');
  assert.strictEqual(dishDeformShed({ perfTier1: true, quality: 'balanced' }), false, 'no shed: quality not stepped');
  assert.strictEqual(dishDeformShed({ perfTier1: false, quality: 'performance' }), false, 'no shed: tier 1 still on');
  assert.strictEqual(dishDeformShed({}), false, 'no shed: a still/export doc carries no governor state');

  const item = {
    assetId: 'a', x: 100, y: 100, scale: 1, rotation: 0,
    color: '#ff0000', accent: '#00ff00', alpha: 80,
    deformAmt: 0.3, deformAxisX: 0.6, deformAxisY: 0.8,
  };
  const rl = [{
    id: 'sw', layer: { name: 'SW' }, layerOpacity: 1, layerBlendMode: 'normal',
    layoutParams: { blendMode: 'normal' }, items: [item],
  }];
  const docFor = (over = {}) => ({
    seed: 7, quality: 'balanced',
    layers: [{ id: 'sw', name: 'SW', type: 'content', visible: true }],
    ...over,
  });
  const live = buildSceneContract({ doc: docFor(), resolvedLayers: rl, caps: null });
  assert.deepEqual(live.instances[0].deform, [0.6, 0.8, 0.3], 'contract carries the dent');
  const shed = buildSceneContract({
    doc: docFor({ perfTier1: true, quality: 'performance' }), resolvedLayers: rl, caps: null,
  });
  assert.ok(!('deform' in shed.instances[0]), 'shed contract drops the dent, keeps the instance');
  const half = buildSceneContract({
    doc: docFor({ perfTier1: true, quality: 'balanced' }), resolvedLayers: rl, caps: null,
  });
  assert.deepEqual(half.instances[0].deform, [0.6, 0.8, 0.3], 'tier-1 shed alone does not shed deform');

  // a wobble the contract's 3-place rounding would turn into 0 carries NO key (it used to throw "deform amount must
  // be in (0, 1]" on every such frame, which stalled RENDER MOVIE: the capture never got a clean frame)
  for (const amt of [0.00001, 0.0003, 0.00049]) {
    const tiny = buildSceneContract({
      doc: docFor(), caps: null,
      resolvedLayers: [{ ...rl[0], items: [{ ...item, deformAmt: amt }] }],
    });
    assert.ok(!('deform' in tiny.instances[0]), `amount ${amt} rounds to rest: no deform key`);
    assert.doesNotThrow(() => assertSceneContract(tiny), `amount ${amt} must pass the contract check`);
  }
  const edge = buildSceneContract({
    doc: docFor(), caps: null, resolvedLayers: [{ ...rl[0], items: [{ ...item, deformAmt: 0.0006 }] }],
  });
  assert.deepEqual(edge.instances[0].deform, [0.6, 0.8, 0.001], '0.0006 rounds to 0.001 and is kept');
  assert.doesNotThrow(() => assertSceneContract(edge));
}

// (f) — the render path: the attribute exists, gated, and the packer
// writes the triple at floats 21–23 (0 for producers without deform).
{
  assert.ok(QUAD_VS.includes('layout(location=7) in vec3 a_def;'), 'QUAD_VS declares a_def at location 7');
  assert.ok(QUAD_VS.includes('if (a_def.z > 0.0)'), 'the squash is gated on a non-zero amount');
  const cells = { 'a|#ffffff|#000000': { u0: 0, v0: 0, u1: 0.5, v1: 0.5 } };
  const inst = (over = {}) => ({
    x: 1, y: 2, scaleX: 1, scaleY: 1, rotation: 0, opacity: 0.5,
    asset: 'a', tint: '#ffffff', accent: '#000000', ...over,
  });
  const data = packInstanceData([inst({ deform: [0.6, 0.8, 0.3] }), inst()], cells);
  assert.strictEqual(data.length, 90, 'two instances at the 45-float stride (24 through #1410, +plate float in #1548, +matP vec4 in #1585, +engraving block in S4)');
  assert.ok(Math.abs(data[21] - 0.6) < 1e-6 && Math.abs(data[22] - 0.8) < 1e-6 && Math.abs(data[23] - 0.3) < 1e-6,
    'deform triple packed at floats 21–23');
  assert.ok(data[66] === 0 && data[67] === 0 && data[68] === 0, 'no deform (old producer) packs zeros = round (instance 2 deform triple at 45+21..23; the pre-S4 indices 46..48 named other floats that happened to be zero for this fixture)');
}

// (g) — symmetry: a mirrored copy's deform axis reflects with the copy
// (an X-mirror of a diagonal dent is the other diagonal), while items
// without deform — every placement item — mirror exactly as before.
{
  const dented = { x: 100, y: 100, rotation: 10, key: 'k', deformAmt: 0.3, deformAxisX: 0.6, deformAxisY: 0.8 };
  const out = mirrorItems([dented], 'xy', 1000, 700);
  assert.strictEqual(out.length, 4, 'xy mirror makes 3 copies + the original');
  const mx = out.find((it) => it.key === 'k-mx');
  const my = out.find((it) => it.key === 'k-my');
  const mxy = out.find((it) => it.key === 'k-mxy');
  assert.ok(Object.is(mx.deformAxisX, -0.6) && Object.is(mx.deformAxisY, 0.8), 'x-mirror flips the axis x');
  assert.ok(Object.is(my.deformAxisX, 0.6) && Object.is(my.deformAxisY, -0.8), 'y-mirror flips the axis y');
  assert.ok(Object.is(mxy.deformAxisX, -0.6) && Object.is(mxy.deformAxisY, -0.8), 'xy-mirror flips both (the same squash line)');
  assert.ok(Object.is(out[0].deformAxisX, 0.6) && Object.is(out[0].deformAxisY, 0.8), 'the original keeps its axis');
  const plain = mirrorItems([{ x: 1, y: 2, rotation: 0, key: 'p' }], 'x', 1000, 700);
  assert.ok(!('deformAxisX' in plain[1]), 'placement items gain no deform fields from mirroring');
}

console.log('dishDeform.selfcheck: OK (#1410 — impulse→deform closed form, Spine C recovery, physics byte-identity, reduced-motion rest, wobble, tier-2 shed, a_def render path, mirror axis)');
