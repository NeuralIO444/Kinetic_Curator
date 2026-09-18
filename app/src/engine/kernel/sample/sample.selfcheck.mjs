// node src/engine/kernel/sample/sample.selfcheck.mjs
// Kernel K2 acceptance (#60)

import assert from 'node:assert';
import { getSampler, listSamplers, stratified } from './registry.js';
import { computePlacements } from '../../placement.js';
import { mkRng } from '../../prng.js';

const required = [
  'grid', 'fibonacci', 'radial', 'swarm', 'flow', 'layers', 'rails',
  'ca', 'orbit', 'abacus', 'noise', 'hype', 'stratified', 'random',
];

for (const id of required) {
  assert.ok(getSampler(id), `missing sampler ${id}`);
}

const listed = listSamplers();
assert.ok(listed.includes('stratified'));

// Deterministic stratified
{
  const seed = 0xabcd;
  const mk = (s) => {
    const points = [];
    for (let i = 0; i < 40; i++) {
      const rng = mkRng((s ^ (i * 0x9e3779b9)) >>> 0 || 1);
      points.push(stratified({
        i, count: 40, w: 1000, h: 700, rng, jitter: 10, seed: s,
      }));
    }
    return points;
  };
  const a = mk(seed);
  const b = mk(seed);
  for (let i = 0; i < 40; i++) {
    assert.strictEqual(a[i].x, b[i].x);
    assert.strictEqual(a[i].y, b[i].y);
    assert.ok(a[i].x >= 0 && a[i].x <= 1000);
    assert.ok(a[i].y >= 0 && a[i].y <= 700);
  }
}

// Orchestrator: stratified mode finite + count
{
  const items = computePlacements({
    mode: 'stratified',
    count: 60,
    seed: 0x1a4f,
    scale: [0.4, 0.8],
    rotate: [0, 45],
    alpha: [60, 100],
    jitter: 10,
    density: 100,
    zTiers: 1,
    bleed: false,
    canvasW: 1000,
    canvasH: 700,
  });
  assert.strictEqual(items.length, 60);
  for (const p of items) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
}

// Grid / fib still work through getSampler path
{
  const g = computePlacements({
    mode: 'grid', count: 40, seed: 0x1a4f,
    scale: [0.4, 0.8], rotate: [0, 45], alpha: [60, 100],
    jitter: 10, density: 100, zTiers: 1, bleed: false,
    canvasW: 1000, canvasH: 700,
  });
  assert.strictEqual(g.length, 40);
}

// Concurrent CA field cache: two live grids must not share one module slot
// (Worker / parallel eval isolation).
{
  const ca = getSampler('ca');
  const gridA = Array.from({ length: 4 }, (_, y) =>
    Array.from({ length: 4 }, (_, x) => (x === 1 && y === 1 ? 1 : 0)));
  const gridB = Array.from({ length: 4 }, (_, y) =>
    Array.from({ length: 4 }, (_, x) => (x === 2 && y === 2 ? 1 : 0)));
  const seed = 0xcafef00d;
  const mk = (grid, i) => {
    const rng = mkRng((seed ^ (i * 0x9e3779b9)) >>> 0 || 1);
    return ca({
      i, count: 8, w: 100, h: 100, rng, jitter: 0, seed, caGrid: grid,
    });
  };
  // Warm both grids in alternating order — a single-slot cache would leave
  // the second grid's field active for the first grid's later samples.
  const a0 = mk(gridA, 0);
  const b0 = mk(gridB, 0);
  const a1 = mk(gridA, 0);
  const b1 = mk(gridB, 0);
  assert.strictEqual(a0.x, a1.x, 'grid A samples must be stable across interleaved B');
  assert.strictEqual(a0.y, a1.y, 'grid A samples must be stable across interleaved B');
  assert.strictEqual(b0.x, b1.x, 'grid B samples must be stable across interleaved A');
  assert.strictEqual(b0.y, b1.y, 'grid B samples must be stable across interleaved A');
  // Different density peaks → different rejection samples at the same index
  // (not always true for every seed, but these two grids are sparse opposites).
  assert.ok(
    a0.x !== b0.x || a0.y !== b0.y,
    'distinct CA grids should not produce identical point 0 for this fixture',
  );
}

console.log('kernel/sample.selfcheck: OK (K2)', { modes: listSamplers().length });
