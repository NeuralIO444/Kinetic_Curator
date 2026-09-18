/**
 * scent.selfcheck.mjs — the scent field (#287, bio-drives).
 * Node-only. Proves: deposit/sample round-trip, clamping at the edges,
 * decay over steps, diffusion spreading to neighbors, gradient pointing
 * uphill, and determinism (same deposit sequence → same grid).
 */
import { strict as assert } from 'node:assert';
import { createScentField, SCENT_COLS, SCENT_ROWS } from './scent.js';

let passed = 0;
let failed = 0;
function ok(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL - ${name}`);
    console.error(`    ${e.message}`);
  }
}
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

console.log('[selfcheck] scent field');

ok('grid dimensions default to 64×36', () => {
  const f = createScentField();
  assert.equal(f.kind, 'scent');
  assert.equal(f.cols, SCENT_COLS);
  assert.equal(f.rows, SCENT_ROWS);
  assert.equal(SCENT_COLS, 64);
  assert.equal(SCENT_ROWS, 36);
});

ok('empty field samples zero', () => {
  const f = createScentField();
  assert.equal(f.sample(0.5, 0.5), 0);
  assert.equal(f.sample(0, 0), 0);
  assert.equal(f.sample(0.999, 0.999), 0);
});

ok('deposit then sample returns the deposit at that cell', () => {
  const f = createScentField();
  f.deposit(0.5, 0.5, 1.2);
  // The deposit lands in the nearest cell; sample at that cell's center.
  const cx = Math.round(0.5 * SCENT_COLS - 0.5);
  const cy = Math.round(0.5 * SCENT_ROWS - 0.5);
  const v = f.sample((cx + 0.5) / SCENT_COLS, (cy + 0.5) / SCENT_ROWS);
  assert.ok(approx(v, 1.2, 1e-9), `expected 1.2 at the cell center, got ${v}`);
});

ok('out-of-range deposits clamp to the edge cells, not dropped', () => {
  const f = createScentField();
  f.deposit(-0.5, -0.5, 1);
  f.deposit(1.5, 1.5, 1);
  assert.ok(f.sample(0, 0) > 0, 'corner deposit should land on the edge cell');
  assert.ok(f.sample(1, 1) > 0, 'corner deposit should land on the edge cell');
});

ok('decay-only step fades the field toward zero', () => {
  const f = createScentField();
  f.deposit(0.5, 0.5, 1);
  const before = f.sample(0.5, 0.5);
  f.step({ decay: 0.5, diffuse: 0 });
  const after = f.sample(0.5, 0.5);
  assert.ok(approx(after, before * 0.5, 1e-6), `expected half of ${before}, got ${after}`);
  for (let i = 0; i < 60; i++) f.step({ decay: 0.5, diffuse: 0 });
  assert.ok(f.sample(0.5, 0.5) < 1e-9, 'field should decay to ~zero');
});

ok('diffusion spreads scent to neighboring cells', () => {
  const f = createScentField();
  f.deposit(0.5, 0.5, 1);
  const before = f.sample(0.5 + 2 / SCENT_COLS, 0.5);
  f.step({ decay: 1, diffuse: 0.5 });
  const after = f.sample(0.5 + 2 / SCENT_COLS, 0.5);
  assert.ok(after > before, `neighbor should gain scent (${before} → ${after})`);
});

ok('gradient points uphill toward a deposit', () => {
  const f = createScentField();
  // Settle a deposit so the gradient is smooth (diffusion reaches ~4 cells
  // after 40 steps), then probe a few cells to the left of it.
  f.deposit(0.6, 0.5, 3);
  for (let i = 0; i < 40; i++) f.step();
  const g = f.gradient(0.55, 0.5);
  assert.ok(g.gx > 0.1, `gx should point toward +x (the deposit), got ${g.gx}`);
  assert.ok(Math.abs(g.gy) < Math.abs(g.gx) * 0.5, `gy should be small, got ${g.gy}`);
});

ok('clear() empties the field', () => {
  const f = createScentField();
  f.deposit(0.3, 0.3, 3);
  f.deposit(0.8, 0.7, 2);
  f.clear();
  assert.equal(f.sample(0.3, 0.3), 0);
  assert.equal(f.sample(0.8, 0.7), 0);
});

ok('deterministic: same deposit sequence → same samples', () => {
  const run = () => {
    const f = createScentField();
    f.deposit(0.2, 0.8, 0.5);
    f.deposit(0.9, 0.1, 1.5);
    for (let i = 0; i < 10; i++) f.step();
    return [f.sample(0.25, 0.75), f.sample(0.85, 0.15), f.sample(0.5, 0.5)];
  };
  assert.deepEqual(run(), run());
});

console.log(`[selfcheck] scent field: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
