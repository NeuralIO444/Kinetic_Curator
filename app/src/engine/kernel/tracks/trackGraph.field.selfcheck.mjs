// node src/engine/kernel/tracks/trackGraph.field.selfcheck.mjs
// #344 ST-5: FIELD-coupling engine contract. Test-only — locks the cross-track
// attraction/repulsion contract of applyField() before any PATCH-row or
// live-loop wiring exists. No engine code is touched here.
import assert from 'node:assert';
import { applyField, normalizePatch } from './trackGraph.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const patch = (over = {}) =>
  normalizePatch({ from: 0, to: 1, mode: 'field', strength: 1, polarity: 1, ...over });

// --- patch normalization --------------------------------------------------
assert.strictEqual(patch({ polarity: 'repel' }).polarity, -1, 'repel string → -1');
assert.strictEqual(patch({ polarity: -1 }).polarity, -1, 'polarity -1 sticks');
assert.strictEqual(patch({ strength: 99 }).strength, 4, 'strength clamps to 4');
assert.strictEqual(patch({ mode: 'off' }).mode, 'off', 'off stays off');

// --- 1. attraction: targets bend toward source points ----------------------
const source = [{ x: 0.5, y: 0.5 }];
const near = [{ x: 0.62, y: 0.5, vx: 3 }]; // 0.12 < FIELD_RADIUS (0.35)
const attracted = applyField(near, source, patch());
assert.ok(attracted[0].x < near[0].x, 'attraction moves target toward source');
assert.ok(
  dist(attracted[0], source[0]) < dist(near[0], source[0]),
  'attraction shrinks target–source distance',
);
assert.strictEqual(attracted[0].vx, 3, 'extra fields ride along untouched');
assert.deepStrictEqual(near, [{ x: 0.62, y: 0.5, vx: 3 }], 'input points are not mutated');

// --- 2. polarity -1 inverts: repulsion moves targets away ------------------
const repelled = applyField(near, source, patch({ polarity: -1 }));
assert.ok(repelled[0].x > near[0].x, 'repulsion moves target away from source');
assert.ok(
  dist(repelled[0], source[0]) > dist(near[0], source[0]),
  'repulsion grows target–source distance',
);

// --- 3. strength 0 is a no-op ----------------------------------------------
const zeroed = applyField(near, source, patch({ strength: 0 }));
assert.strictEqual(zeroed[0].x, near[0].x, 'strength 0: x unchanged');
assert.strictEqual(zeroed[0].y, near[0].y, 'strength 0: y unchanged');

// --- 4. mode OFF returns identity -------------------------------------------
const off = applyField(near, source, patch({ mode: 'off' }));
assert.deepStrictEqual(off, near.map((q) => ({ ...q })), 'OFF = byte-identical path');

// --- 5. empty source set returns identity -----------------------------------
const noSource = applyField(near, [], patch());
assert.deepStrictEqual(noSource, near.map((q) => ({ ...q })), 'no sources = identity');

// targets outside FIELD_RADIUS feel nothing, even in field mode
const far = [{ x: 0.95, y: 0.5 }];
const farOut = applyField(far, source, patch());
assert.strictEqual(farOut[0].x, far[0].x, 'out-of-radius target is untouched');
assert.strictEqual(farOut[0].y, far[0].y, 'out-of-radius target is untouched');

// --- 6. deterministic across runs -------------------------------------------
const runA = applyField(near, source, patch());
const runB = applyField(near, source, patch());
assert.deepStrictEqual(runA, runB, 'same input → same output, every run');

console.log('kernel/tracks.field.selfcheck: OK (#344)', {
  attractedX: +attracted[0].x.toFixed(5),
  repelledX: +repelled[0].x.toFixed(5),
});
