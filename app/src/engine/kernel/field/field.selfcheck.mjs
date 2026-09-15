// node src/engine/kernel/field/field.selfcheck.mjs
// K3 (#62) AC2 + AC4: field determinism and density behaviour.
import assert from 'node:assert';
import {
  makeConstantField, makeCaField, makeNoiseField, combineFields, sampleFieldPoint,
} from './index.js';

// --- constant field -------------------------------------------------------
const flat = makeConstantField(1);
assert.strictEqual(flat.sample(0.1, 0.9), 1);

// --- CA field -------------------------------------------------------------
// left half alive, right half dead
const grid = Array.from({ length: 8 }, () =>
  Array.from({ length: 8 }, (_, x) => (x < 4 ? 1 : 0)));
const caf = makeCaField(grid, { softness: 0 });
assert.ok(caf.sample(0.05, 0.5) > 0.9, 'alive region should read high');
assert.ok(caf.sample(0.95, 0.5) < 0.1, 'dead region should read low');
assert.ok(caf.sample(0, 0) >= 0 && caf.sample(1, 1) >= 0, 'corners must be in range');

// every sample stays within 0..1 across the whole canvas
for (let i = 0; i <= 20; i++) {
  for (let j = 0; j <= 20; j++) {
    const v = caf.sample(i / 20, j / 20);
    assert.ok(v >= 0 && v <= 1, `CA sample out of range: ${v}`);
  }
}

// blur softens the edge rather than leaving it binary
const soft = makeCaField(grid, { softness: 2 });
const hardEdge = Math.abs(caf.sample(0.5, 0.5) - caf.sample(0.56, 0.5));
const softEdge = Math.abs(soft.sample(0.5, 0.5) - soft.sample(0.56, 0.5));
assert.ok(softEdge <= hardEdge + 1e-9, 'softness should not sharpen the edge');

// an all-dead grid must not reject everything — it degenerates to uniform
const dead = makeCaField(Array.from({ length: 4 }, () => [0, 0, 0, 0]));
assert.strictEqual(dead.sample(0.5, 0.5), 1, 'empty grid falls back to uniform');
// and a missing grid is handled, not thrown on
assert.strictEqual(makeCaField(null).sample(0.5, 0.5), 1);

// --- noise field ----------------------------------------------------------
const n1 = makeNoiseField(1234);
const n2 = makeNoiseField(1234);
const n3 = makeNoiseField(9999);
assert.strictEqual(n1.sample(0.3, 0.7), n2.sample(0.3, 0.7), 'AC2: same seed = same field');
assert.notStrictEqual(n1.sample(0.3, 0.7), n3.sample(0.3, 0.7), 'different seed = different field');
for (let i = 0; i <= 30; i++) {
  const v = n1.sample(i / 30, 1 - i / 30);
  assert.ok(v >= 0 && v <= 1, `noise sample out of range: ${v}`);
}

// --- combine --------------------------------------------------------------
const masked = combineFields(makeConstantField(0.5), makeConstantField(0.4));
assert.ok(Math.abs(masked.sample(0, 0) - 0.2) < 1e-9, 'combine multiplies');

// --- rejection sampling ---------------------------------------------------
// AC2: identical (seed, index) must give identical points, every time
for (const idx of [0, 1, 7, 99]) {
  const a = sampleFieldPoint(caf, 4242, idx);
  const b = sampleFieldPoint(caf, 4242, idx);
  assert.deepStrictEqual(a, b, `sample must be deterministic for index ${idx}`);
}

// different index => different point (not a constant)
const p0 = sampleFieldPoint(caf, 4242, 0);
const p1 = sampleFieldPoint(caf, 4242, 1);
assert.notDeepStrictEqual(p0, p1, 'different indices must not collapse to one point');

// different seed => different point
assert.notDeepStrictEqual(
  sampleFieldPoint(caf, 1, 5), sampleFieldPoint(caf, 2, 5),
  'seed must change the sample',
);

// INDEX STABILITY — the actual point of K3. Placement i's position must not
// depend on how many placements there are; nothing here takes `count`.
const runA = Array.from({ length: 10 }, (_, i) => sampleFieldPoint(caf, 77, i));
const runB = Array.from({ length: 400 }, (_, i) => sampleFieldPoint(caf, 77, i)).slice(0, 10);
assert.deepStrictEqual(runA, runB, 'AC2: placement i is stable as count changes');

// density actually follows the field: with the left half alive, most
// accepted samples should land on the left
const pts = Array.from({ length: 400 }, (_, i) => sampleFieldPoint(caf, 31337, i));
const accepted = pts.filter((p) => p.accepted);
assert.ok(accepted.length > 200, `expected most samples accepted, got ${accepted.length}/400`);
const left = accepted.filter((p) => p.x < 0.5).length;
assert.ok(
  left / accepted.length > 0.85,
  `density should follow the field: ${left}/${accepted.length} landed left`,
);

console.log('kernel/field.selfcheck: OK (K3)', {
  accepted: accepted.length,
  leftBias: +(left / accepted.length).toFixed(3),
});
