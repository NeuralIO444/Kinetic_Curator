// node src/engine/kernel/tracks/applyField.neighbors.selfcheck.mjs
// #1248: pin the POST-#1254 direct neighbor loop in trackGraph.js applyField().
// #1254 replaced the old fieldHash.js counting-sort hash with a direct O(n·m)
// loop (#1234: FIELD_RADIUS is intentionally near-global at 0.35). This suite
// pins the post-merge contract — the neighbor SET, not the old hash behavior:
// inclusion correctness of the `d2 > r2` cutoff against an independent brute-
// force reference, plus boundary fixtures at exactly FIELD_RADIUS.
import assert from 'node:assert';
import { applyField, normalizePatch, FIELD_RADIUS } from './trackGraph.js';

// Independent brute-force reference: the neighbor set is built in a separate
// pass with Math.hypot, and accumulation only runs over that set. Inclusion
// and accumulation are computed independently of trackGraph.js.
const SOFT = 1e-4; // mirrors trackGraph.js FIELD_SOFT
function referenceApplyField(targetPts, sourcePts, strength, polarity) {
  const gain = 0.002 * strength * polarity;
  return targetPts.map((q) => {
    const qx = Number(q.x) || 0;
    const qy = Number(q.y) || 0;
    const neighbors = [];
    for (const s of sourcePts) {
      const dx = (Number(s.x) || 0) - qx;
      const dy = (Number(s.y) || 0) - qy;
      if (Math.hypot(dx, dy) <= FIELD_RADIUS) neighbors.push([dx, dy]);
    }
    let ax = 0;
    let ay = 0;
    for (const [dx, dy] of neighbors) {
      const d2 = dx * dx + dy * dy;
      ax += dx / (d2 + SOFT);
      ay += dy / (d2 + SOFT);
    }
    return { ...q, x: qx + ax * gain, y: qy + ay * gain };
  });
}

const patch = (over = {}) =>
  normalizePatch({ from: 0, to: 1, mode: 'field', strength: 1, polarity: 1, ...over });

// --- 1. mixed fixture: sources inside, on, and outside the radius ------------
// Target at origin. Sources at known distances; radius = 0.35.
const R = FIELD_RADIUS;
const targets = [
  { x: 0, y: 0 },
  { x: 0.9, y: 0.9, tag: 'far' }, // nothing within radius
];
const sources = [
  { x: 0.1, y: 0 }, // d=0.1  — inside
  { x: -0.2, y: 0.2 }, // d≈0.283 — inside
  { x: 0, y: 0.3 }, // d=0.3 — inside
  { x: 0.34, y: 0 }, // d=0.34 — barely inside
  { x: 0.36, y: 0 }, // d=0.36 — barely outside
  { x: 0.9, y: 0.9 }, // d≈1.27 — far outside (except for the far target)
];
const got = applyField(targets, sources, patch());
const want = referenceApplyField(targets, sources, 1, 1);
assert.deepStrictEqual(
  got,
  want,
  'applyField bit-matches the independent neighbor-set reference on a mixed fixture',
);
assert.ok(got[0].x !== 0 || got[0].y !== 0, 'origin target feels its inside sources');
assert.strictEqual(got[1].x, 0.9, 'far target: x untouched except by its co-located source');
assert.strictEqual(got[1].y, 0.9, 'far target: y untouched except by its co-located source');

// --- 2. exact-boundary inclusion: d2 == r2 is INCLUDED (`d2 > r2` skips) ------
const onEdge = [{ x: 0, y: 0 }];
const edgeSrc = [{ x: R, y: 0 }]; // d2 === r2 bit-for-bit (same float ops)
const edgeOut = applyField(onEdge, edgeSrc, patch());
assert.ok(edgeOut[0].x > 0, 'source at exactly FIELD_RADIUS contributes (attracts toward +x)');

// --- 3. just-outside exclusion: FIELD_RADIUS + 1e-9 feels nothing -------------
const outsideSrc = [{ x: R + 1e-9, y: 0 }];
const out = applyField(onEdge, outsideSrc, patch());
assert.strictEqual(out[0].x, 0, 'source epsilon outside FIELD_RADIUS is excluded');
assert.strictEqual(out[0].y, 0, 'source epsilon outside FIELD_RADIUS is excluded');

// --- 4. polarity flips the included set's contribution ------------------------
const rep = applyField(onEdge, edgeSrc, patch({ polarity: -1 }));
assert.ok(rep[0].x < 0, 'polarity -1 repels from the included source');
assert.ok(Math.abs(rep[0].x) === Math.abs(edgeOut[0].x), 'repel is the exact mirror of attract');

// --- 5. strength scales the included set --------------------------------------
const strong = applyField(onEdge, edgeSrc, patch({ strength: 2 }));
assert.ok(
  Math.abs(strong[0].x - 0) === 2 * Math.abs(edgeOut[0].x - 0),
  'strength 2 doubles the included contribution',
);

// --- 6. determinism + no input mutation ---------------------------------------
const runA = applyField(targets, sources, patch());
const runB = applyField(targets, sources, patch());
assert.deepStrictEqual(runA, runB, 'same input → same output, every run');
assert.deepStrictEqual(
  targets,
  [
    { x: 0, y: 0 },
    { x: 0.9, y: 0.9, tag: 'far' },
  ],
  'input targets not mutated',
);
assert.deepStrictEqual(
  sources.map((s) => [s.x, s.y]),
  [
    [0.1, 0],
    [-0.2, 0.2],
    [0, 0.3],
    [0.34, 0],
    [0.36, 0],
    [0.9, 0.9],
  ],
  'input sources not mutated',
);

console.log('ok — applyField neighbor sets (#1248)', {
  radius: R,
  edgeDx: edgeOut[0].x.toExponential(3),
  mirrorDx: rep[0].x.toExponential(3),
});
