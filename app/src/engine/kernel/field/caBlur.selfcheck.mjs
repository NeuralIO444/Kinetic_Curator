// node src/engine/kernel/field/caBlur.selfcheck.mjs
// #1249: the CA field box blur moved from per-pass array-of-arrays to two
// preallocated Float32Array buffers ping-ponged across passes. Blur output
// must be behavior-identical — the old blur's edge handling (skip
// out-of-bounds neighbours, divide by the in-bounds count) is what shifts
// the field, so this suite compares the NEW implementation against a
// verbatim copy of the OLD array-of-arrays implementation, sample-for-sample
// over a dense lattice (edges and corners included, not just the center),
// on several fixtures. Float32 rounding is expected (~1e-7); anything
// beyond 1e-6 is a real divergence.
import assert from 'node:assert';
import { makeCaField } from './index.js';

// --- reference: the pre-#1249 array-of-arrays blur, kept verbatim ---------
function makeCaFieldOld(grid, { softness = 1 } = {}) {
  if (!grid || !grid.length || !grid[0]?.length) return { sample: () => 1 };
  const rows = grid.length;
  const cols = grid[0].length;
  let field = grid.map((row) => row.map((c) => (c ? 1 : 0)));
  const passes = Math.max(0, Math.round(softness));
  for (let p = 0; p < passes; p++) {
    const prev = field;
    field = prev.map((row, y) => row.map((_, x) => {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy < 0 || yy >= rows || xx < 0 || xx >= cols) continue;
          sum += prev[yy][xx];
          n++;
        }
      }
      return n ? sum / n : 0;
    }));
  }
  let max = 0;
  for (const row of field) for (const v of row) if (v > max) max = v;
  const norm = max > 1e-6 ? 1 / max : 0;
  return {
    sample(nx, ny) {
      if (norm === 0) return 1;
      const fx = Math.min(cols - 1, Math.max(0, nx * (cols - 1)));
      const fy = Math.min(rows - 1, Math.max(0, ny * (rows - 1)));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(cols - 1, x0 + 1);
      const y1 = Math.min(rows - 1, y0 + 1);
      const tx = fx - x0;
      const ty = fy - y0;
      const a = field[y0][x0] * (1 - tx) + field[y0][x1] * tx;
      const b = field[y1][x0] * (1 - tx) + field[y1][x1] * tx;
      return Math.min(1, Math.max(0, (a * (1 - ty) + b * ty) * norm));
    },
  };
}

// --- deterministic fixtures ----------------------------------------------
let lcgState = 0xc0ffee;
const lcg = () => (lcgState = (lcgState * 1664525 + 1013904223) >>> 0) / 4294967296;
function randomGrid(cols, rows, density) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (lcg() < density ? 1 : 0)));
}
function checkerGrid(cols, rows) {
  return Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) => ((x + y) % 2 ? 1 : 0)));
}

const EPS = 1e-6; // float32 rounding lands ~1e-7; 1e-6 leaves a full order of margin
const fixtures = [
  ['half-half 8x8 s0', Array.from({ length: 8 }, () => Array.from({ length: 8 }, (_, x) => (x < 4 ? 1 : 0))), 0],
  ['half-half 8x8 s2', Array.from({ length: 8 }, () => Array.from({ length: 8 }, (_, x) => (x < 4 ? 1 : 0))), 2],
  ['random 12x9 s2', randomGrid(12, 9, 0.35), 2],
  ['random 64x64 s3', randomGrid(64, 64, 0.35), 3],
  ['random 64x32 s2', randomGrid(64, 32, 0.5), 2],
  ['checker 7x5 s1', checkerGrid(7, 5), 1],
  ['random 16x16 s4', randomGrid(16, 16, 0.2), 4],
  ['single alive 1x1 s3', [[1]], 3],
  ['all-dead 4x4 s2', Array.from({ length: 4 }, () => [0, 0, 0, 0]), 2],
  ['single corner cell 5x5 s2', Array.from({ length: 5 }, (_, y) =>
    Array.from({ length: 5 }, (_, x) => (x === 0 && y === 0 ? 1 : 0))), 2],
];

let worst = 0;
for (const [name, grid, softness] of fixtures) {
  const oldF = makeCaFieldOld(grid, { softness });
  const newF = makeCaField(grid, { softness });
  // Dense lattice including the exact borders and corners — edge handling
  // is the thing that shifts the field, so pin the edges, not just the center.
  let maxD = 0;
  const N = 64;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const d = Math.abs(oldF.sample(i / N, j / N) - newF.sample(i / N, j / N));
      if (d > maxD) maxD = d;
    }
  }
  if (maxD > worst) worst = maxD;
  assert.ok(maxD < EPS, `#1249: ${name} diverged ${maxD} >= ${EPS}`);
}

// --- pinned goldens: captured from the pre-#1249 implementation -----------
// Random 12x9 grid (same LCG seed as `random 12x9 s2` above), softness 2.
// A second pin independent of the in-file reference, so a reference that
// drifts with the implementation cannot hide a change.
const GOLDEN_PTS = [
  [0, 0], [1, 1], [0, 1], [1, 0], [0.5, 0.5],
  [0.123, 0.876], [0.99, 0.02], [0.333, 0.666], [0.02, 0.5], [0.5, 0.98],
];
const GOLDEN_VALS = [
  0.3860294117647058, 0.5404411764705881, 0.5404411764705882, 0.11029411764705882,
  0.4215686274509804, 0.3893128431372548, 0.12298137254901959, 0.46038305882352937,
  0.5516666666666665, 0.08686274509803923,
];
lcgState = 0xc0ffee;
const goldenGrid = randomGrid(12, 9, 0.35);
const goldenField = makeCaField(goldenGrid, { softness: 2 });
GOLDEN_PTS.forEach(([x, y], i) => {
  const v = goldenField.sample(x, y);
  assert.ok(
    Math.abs(v - GOLDEN_VALS[i]) < EPS,
    `#1249: golden pin ${i} at (${x}, ${y}) moved: ${v} vs ${GOLDEN_VALS[i]}`,
  );
});

// --- degenerate paths still degenerate the same way ----------------------
assert.strictEqual(makeCaField(null).sample(0.5, 0.5), 1, 'null grid -> uniform');
assert.strictEqual(makeCaField([]).sample(0.5, 0.5), 1, 'empty grid -> uniform');
assert.strictEqual(makeCaField([[0]]).sample(0.5, 0.5), 1, 'all-dead 1x1 -> uniform');

console.log('kernel/field/caBlur.selfcheck: OK (#1249)', {
  fixtures: fixtures.length,
  worstMaxDiff: +worst.toExponential(2),
});
