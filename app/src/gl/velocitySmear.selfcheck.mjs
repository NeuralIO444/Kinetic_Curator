// velocitySmear.selfcheck.mjs — #309 velocity smear bookkeeping:
// per-frame displacement attached as vx/vy, keyed on layer|key, first
// sightings zeroed, teleports clamped, stale keys pruned.
import assert from 'node:assert';
import { attachVelocities, SMEAR_MAX_SPEED } from './velocitySmear.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const inst = (layer, key, x, y) => ({ layer, key, x, y });

ok('first sighting gets zero velocity', () => {
  const prev = new Map();
  const items = [inst('a', 'o0-s0', 10, 20)];
  attachVelocities(items, prev);
  assert.strictEqual(items[0].vx, 0);
  assert.strictEqual(items[0].vy, 0);
});

ok('steady motion yields the per-frame displacement', () => {
  const prev = new Map();
  const f1 = [inst('a', 'o0-s0', 10, 20)];
  attachVelocities(f1, prev);
  const f2 = [inst('a', 'o0-s0', 14, 26)];
  attachVelocities(f2, prev);
  assert.strictEqual(f2[0].vx, 4);
  assert.strictEqual(f2[0].vy, 6);
});

ok('static instances stay at zero', () => {
  const prev = new Map();
  for (let i = 0; i < 3; i++) attachVelocities([inst('a', 'o0-s0', 10, 20)], prev);
  const items = [inst('a', 'o0-s0', 10, 20)];
  attachVelocities(items, prev);
  assert.strictEqual(items[0].vx, 0);
  assert.strictEqual(items[0].vy, 0);
});

ok('teleports clamp to SMEAR_MAX_SPEED (direction preserved)', () => {
  const prev = new Map();
  attachVelocities([inst('a', 'o0-s0', 0, 0)], prev);
  const items = [inst('a', 'o0-s0', 1000, 0)];
  attachVelocities(items, prev);
  const s = Math.hypot(items[0].vx, items[0].vy);
  assert.ok(Math.abs(s - SMEAR_MAX_SPEED) < 1e-9, `speed ${s} != ${SMEAR_MAX_SPEED}`);
  assert.ok(items[0].vx > 0 && Math.abs(items[0].vy) < 1e-9);
});

ok('keys are layer-scoped; same key on two layers tracks separately', () => {
  const prev = new Map();
  attachVelocities([inst('a', 'o0-s0', 0, 0), inst('b', 'o0-s0', 0, 0)], prev);
  const items = [inst('a', 'o0-s0', 5, 0), inst('b', 'o0-s0', 0, 9)];
  attachVelocities(items, prev);
  assert.strictEqual(items[0].vx, 5);
  assert.strictEqual(items[1].vy, 9);
});

ok('vanished keys are pruned (bounded history)', () => {
  const prev = new Map();
  attachVelocities([inst('a', 'k1', 0, 0), inst('a', 'k2', 0, 0)], prev);
  assert.strictEqual(prev.size, 2);
  attachVelocities([inst('a', 'k1', 1, 0)], prev);
  assert.strictEqual(prev.size, 1);
  assert.ok(prev.has('a|k1'));
});

ok('reappearing instances restart at zero velocity', () => {
  const prev = new Map();
  attachVelocities([inst('a', 'k1', 0, 0)], prev);
  attachVelocities([inst('a', 'k2', 50, 50)], prev); // k1 pruned
  const items = [inst('a', 'k1', 500, 500)];
  attachVelocities(items, prev);
  assert.strictEqual(items[0].vx, 0);
  assert.strictEqual(items[0].vy, 0);
});

console.log(`velocitySmear.selfcheck: ${n} checks passed`);
