// vortex.selfcheck.mjs — #970 slice 1, CPU vortex-particle core.
// Pairs not monopoles, splat in layer|key order, speed capped at
// SMEAR_MAX_SPEED, freeze holds the last field, seeded ambient, golden hash.
// Does not cover the feed hook (slice 2 hashes the velocity texture).
import assert from 'node:assert';
import { getCostTier } from './costTiers.mjs';
import { SMEAR_MAX_SPEED } from './velocitySmear.mjs';
import {
  advectGain,
  createVortex,
  emitAmbient,
  emitFromInstances,
  hashPacked,
  hashVelocity,
  noteWetFrame,
  packVelocity,
  stepVortex,
  wetnessStep,
  VORTEX_DECAY,
  VORTEX_GAMMA_PER_SPEED,
  VORTEX_JACOBI,
  VORTEX_WET_DRY,
} from './vortex.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const mark = (layer, key, x, y, vx, vy) => ({ layer, key, x, y, vx, vy });

const SCRIPT = [
  [mark('a', 'o0-s0', 200, 300, 12, -4), mark('b', 'o1-s0', 500, 200, -8, 6)],
  [mark('a', 'o0-s0', 214, 294, 14, -6), mark('b', 'o1-s0', 490, 208, -10, 8)],
  [mark('a', 'o0-s0', 230, 286, 16, -8), mark('b', 'o1-s0', 478, 218, -12, 10)],
  [mark('a', 'o0-s0', 248, 276, 18, -10), mark('b', 'o1-s0', 464, 230, -14, 12)],
];

function runScript(seed = 970) {
  const v = createVortex({ seed, width: 1000, height: 700 });
  for (const frame of SCRIPT) {
    emitFromInstances(v, frame);
    stepVortex(v);
  }
  return v;
}

ok('wetness gate is integer 0 / 1, and dry gain is exactly 0', () => {
  assert.strictEqual(wetnessStep(0), 0);
  assert.strictEqual(wetnessStep(-0.2), 0);
  assert.strictEqual(wetnessStep(Number.NaN), 0);
  assert.strictEqual(wetnessStep(0.0001), 1);
  assert.strictEqual(wetnessStep(1), 1);
  assert.strictEqual(advectGain(0), 0);
  assert.strictEqual(advectGain(-1), 0);
  assert.strictEqual(advectGain(0.4), 0.4);
  assert.strictEqual(advectGain(4), 1);
});

ok('an unstirred step is a zero velocity field', () => {
  const v = createVortex({ seed: 970 });
  stepVortex(v);
  assert.strictEqual(hashVelocity(v), hashVelocity(createVortex({ seed: 1 })));
  assert.strictEqual(v.count, 0);
});

ok('moving marks shed pairs, not monopoles, opposite and equal', () => {
  const v = createVortex({ seed: 970 });
  const emitted = emitFromInstances(v, [mark('a', 'k', 100, 100, 10, 0)]);
  assert.strictEqual(emitted, 2);
  assert.strictEqual(v.count, 2);
  assert.ok(Math.abs(v.vortons[2] + v.vortons[6]) < 1e-9, 'pair gammas cancel');
  assert.ok(Math.abs(Math.abs(v.vortons[2]) - VORTEX_GAMMA_PER_SPEED * 10) < 1e-6);
  // Perpendicular to +x motion, so the pair separates in y.
  assert.strictEqual(v.vortons[0], v.vortons[4]);
  assert.notStrictEqual(v.vortons[1], v.vortons[5]);
});

ok('stationary paint wets the paper and sheds nothing', () => {
  const v = createVortex({ seed: 970 });
  const emitted = emitFromInstances(v, [mark('a', 'k', 400, 300, 0, 0)]);
  assert.strictEqual(emitted, 0);
  assert.strictEqual(v.count, 0);
  let wet = 0;
  for (let i = 0; i < v.wet.length; i++) wet += v.wet[i];
  assert.ok(wet > 0, 'wet mask stamped');
});

ok('emission order is layer|key, independent of input order', () => {
  const items = [
    mark('b', 'z', 10, 20, 5, 0),
    mark('a', 'm', 30, 40, 0, 7),
  ];
  const a = createVortex({ seed: 970 });
  const b = createVortex({ seed: 970 });
  emitFromInstances(a, items);
  emitFromInstances(b, [items[1], items[0]]);
  assert.strictEqual(a.count, b.count);
  for (let i = 0; i < a.count * 4; i++) assert.strictEqual(a.vortons[i], b.vortons[i]);
  // 'a|m' at (30, 40) moving +y sorts first; the + pair sits 12 units to its left.
  assert.ok(Math.abs(a.vortons[0] - 18) < 1e-6, `first vorton x ${a.vortons[0]}`);
  assert.ok(Math.abs(a.vortons[1] - 40) < 1e-6, `first vorton y ${a.vortons[1]}`);
});

ok('teleports clamp to SMEAR_MAX_SPEED before the pair is shed', () => {
  const capped = createVortex({ seed: 970 });
  const jumped = createVortex({ seed: 970 });
  emitFromInstances(capped, [mark('a', 'k', 100, 100, SMEAR_MAX_SPEED, 0)]);
  emitFromInstances(jumped, [mark('a', 'k', 100, 100, 10000, 0)]);
  assert.strictEqual(jumped.vortons[2], capped.vortons[2]);
  assert.ok(Math.abs(jumped.vortons[2] - VORTEX_GAMMA_PER_SPEED * SMEAR_MAX_SPEED) < 1e-6);
});

ok('freeze holds velocity, wet mask, and vortons', () => {
  const v = runScript();
  const hash = hashVelocity(v);
  const wet0 = v.wet[100];
  const gamma = v.vortons[2];
  const steps = v.steps;
  stepVortex(v, { freeze: true });
  assert.strictEqual(v.held, true);
  assert.strictEqual(hashVelocity(v), hash);
  assert.strictEqual(v.wet[100], wet0);
  assert.strictEqual(v.vortons[2], gamma);
  assert.strictEqual(v.steps, steps);
});

ok('wet mask dries multiplicatively when the step runs', () => {
  const v = createVortex({ seed: 970 });
  emitFromInstances(v, [mark('a', 'k', 400, 300, 0, 0)]);
  let before = 0;
  for (let i = 0; i < v.wet.length; i++) before += v.wet[i];
  stepVortex(v);
  let after = 0;
  for (let i = 0; i < v.wet.length; i++) after += v.wet[i];
  assert.ok(Math.abs(after - before * VORTEX_WET_DRY) < 1e-4, `dry ${after} vs ${before * VORTEX_WET_DRY}`);
});

ok('ambient emission is seeded: same seed matches, different seed does not', () => {
  const a = createVortex({ seed: 7 });
  const b = createVortex({ seed: 7 });
  const c = createVortex({ seed: 8 });
  emitAmbient(a, 3);
  emitAmbient(b, 3);
  emitAmbient(c, 3);
  stepVortex(a);
  stepVortex(b);
  stepVortex(c);
  assert.strictEqual(hashVelocity(a), hashVelocity(b));
  assert.notStrictEqual(hashVelocity(a), hashVelocity(c));
});

ok('golden: four scripted frames, fixed Jacobi, seed 970', () => {
  assert.strictEqual(VORTEX_JACOBI, 30);
  const a = runScript();
  const b = runScript();
  assert.strictEqual(a.steps, 4);
  assert.strictEqual(hashVelocity(a), hashVelocity(b));
  assert.strictEqual(hashVelocity(a), 3932816161);
});

ok('a stirred field is not zero, and a step stays inside a loose budget', () => {
  const v = runScript();
  assert.notStrictEqual(hashVelocity(v), hashVelocity(createVortex({ seed: 970 })));
  const t0 = performance.now();
  for (let i = 0; i < 30; i++) stepVortex(v);
  const per = (performance.now() - t0) / 30;
  console.log(`    step ${per.toFixed(3)} ms (budget 0.5, fail above 2)`);
  assert.ok(per < 2, `step ${per.toFixed(3)} ms exceeds the loose budget`);
});

ok('cost tier is 1 and sheds with the accum chain once the feed hook lands', () => {
  const d = getCostTier('gl/vortex');
  assert.ok(d, 'gl/vortex registered');
  assert.strictEqual(d.tier, 1);
  assert.ok(d.timeMs <= 0.5);
});

ok('vortons decay, so a held pair does not live forever', () => {
  const v = createVortex({ seed: 970 });
  emitFromInstances(v, [mark('a', 'k', 400, 300, 10, 0)]);
  const g0 = Math.abs(v.vortons[2]);
  stepVortex(v);
  assert.ok(Math.abs(v.vortons[2]) < g0, 'gamma decayed');
  assert.ok(Math.abs(Math.abs(v.vortons[2]) - g0 * VORTEX_DECAY) < 1e-3);
});

ok('packed velocity hash is stable, and freeze does not zero it', () => {
  const slot = {};
  const inst = [mark('a', 'k', 200, 300, 12, -4)];
  const a = noteWetFrame(slot, { wetness: 0.6, freeze: false, seed: 970, width: 1000, height: 700, instances: inst });
  assert.strictEqual(a.wetStep, 1);
  assert.ok(a.wetGain > 0);
  const h = hashPacked(a.wetVel);
  const held = noteWetFrame(slot, { wetness: 0.6, freeze: true, seed: 970, width: 1000, height: 700, instances: inst });
  assert.strictEqual(hashPacked(held.wetVel), h);
  const dry = noteWetFrame(slot, { wetness: 0, freeze: false, seed: 970, width: 1000, height: 700, instances: inst });
  assert.strictEqual(dry.wetStep, 0);
  assert.strictEqual(dry.wetGain, 0);
  assert.strictEqual(dry.wetVel, null);
  const again = noteWetFrame(slot, { wetness: 0.6, freeze: true, seed: 970, width: 1000, height: 700, instances: inst });
  assert.strictEqual(hashPacked(again.wetVel), h, 'dry frame must not drop the held field');
});

ok('packed texture is not the zero texture after a moving mark', () => {
  const v = createVortex({ seed: 970 });
  emitFromInstances(v, [mark('a', 'k', 400, 300, 16, 0)]);
  stepVortex(v);
  const packed = packVelocity(v);
  assert.notStrictEqual(hashPacked(packed), hashPacked(packVelocity(createVortex({ seed: 970 }))));
});

console.log(`vortex.selfcheck: ${n} checks passed`);
