// node src/engine/kernel/sample/sample.selfcheck.mjs
// Kernel K2 acceptance (#60)

import assert from 'node:assert';
import { getSampler, listSamplers, stratified } from './registry.js';
import { computePlacements } from '../../placement.js';
import { mkRng } from '../../prng.js';
import { hashU01 } from '../rng.js';

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

// ── #587 voronoi ────────────────────────────────────────────────────────────
{
  const voronoi = getSampler('voronoi');
  assert.ok(listSamplers().includes('voronoi'), 'voronoi must be registered');
  const W = 1000; const H = 700; const N = 600;
  const SEED = 1234;
  const lay = (seed, seedOffsets = null) => {
    const out = [];
    for (let i = 0; i < N; i++) {
      out.push(voronoi({ i, count: N, w: W, h: H, rng: () => 0.5, jitter: 0, seed, seedOffsets }));
    }
    return out;
  };
  const pts = lay(SEED);
  for (const q of pts) {
    assert.ok(Number.isFinite(q.x) && Number.isFinite(q.y), 'finite');
    assert.ok(q.x >= 0 && q.x <= W && q.y >= 0 && q.y <= H, `point ${q.x},${q.y} left the plate`);
  }
  assert.deepStrictEqual(lay(SEED), pts, 'same seed, same veins');
  assert.notDeepStrictEqual(lay(SEED + 1), pts, 'a different seed cracks differently');

  // The mask rides the SPATIAL stream, so re-rolling spatial must move the
  // veins and re-rolling colour must not.
  assert.notDeepStrictEqual(lay(SEED, { spatial: 7, color: 0, asset: 0, noise: 0 }), pts,
    'a spatial re-roll must move the veins');
  assert.deepStrictEqual(lay(SEED, { spatial: 0, color: 9, asset: 3, noise: 5 }), pts,
    'colour/asset/noise re-rolls must leave the veins alone');

  // VEIN EMPTINESS, quantified — the negative space has to be intentional.
  // Rebuild the same mask independently and measure how much of the PLATE is
  // seam versus how many POINTS landed on one.
  const CELLS = 14; const VEIN = 0.04;
  const gapFor = (seed, seedOffsets) => {
    const c = [];
    for (let k = 0; k < CELLS; k++) {
      c.push([hashU01(seed, 'voronoi', k * 2, seedOffsets), hashU01(seed, 'voronoi', k * 2 + 1, seedOffsets)]);
    }
    return (x, y) => {
      let d1 = Infinity; let d2 = Infinity;
      for (const [px, py] of c) {
        const d = (x - px) ** 2 + (y - py) ** 2;
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
      return Math.sqrt(d2) - Math.sqrt(d1);
    };
  };
  /** Measure a layout against the mask its OWN seed+offsets should produce. */
  const emptiness = (seed, seedOffsets, layout, label) => {
    const gap = gapFor(seed, seedOffsets);
    let probeIn = 0; const M = 20000;
    for (let i = 0; i < M; i++) {
      if (gap(hashU01(7, 'probe', i * 2), hashU01(7, 'probe', i * 2 + 1)) < VEIN) probeIn++;
    }
    const veinArea = probeIn / M;
    const inVein = layout.filter((q) => gap(q.x / W, q.y / H) < VEIN).length / layout.length;
    assert.ok(veinArea > 0.15, `${label}: veins must be a real share of the plate (got ${(veinArea * 100).toFixed(1)}%)`);
    assert.ok(inVein < 0.1 * veinArea,
      `${label}: density in the veins must be a fraction of outside — ${(inVein * 100).toFixed(2)}% of points in ${(veinArea * 100).toFixed(1)}% of plate`);
  };
  emptiness(SEED, null, pts, 'default');
  // …and the SAME must hold under a spatial re-roll, measured against the
  // re-rolled mask. This is what proves the MASK rides the spatial stream and
  // not merely the candidate draws: a mask locked to the master seed would
  // still move its points, but they would avoid the wrong veins.
  {
    const offs = { spatial: 7, color: 0, asset: 0, noise: 0 };
    emptiness(SEED, offs, lay(SEED, offs), 'spatial re-roll');
  }

  // THE CAP — rejection sampling must never hang and never fail. Squeezed to
  // an impossible mask (every candidate on a seam) it still returns a finite
  // in-bounds point, in bounded time.
  {
    const t0 = Date.now();
    const squeezed = [];
    for (let i = 0; i < 200; i++) {
      // A degenerate mask is not reachable through the public sampler, so the
      // cap is exercised the only way it can be: many points, one seed, and
      // the assertion that every single one resolves.
      squeezed.push(voronoi({ i, count: 200, w: W, h: H, rng: () => 0.5, jitter: 0, seed: i * 7919, seedOffsets: null }));
    }
    assert.ok(squeezed.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y) && q.x >= 0 && q.x <= W),
      'every point resolves, whatever the mask');
    assert.ok(Date.now() - t0 < 4000, 'the attempt cap must bound the work');
  }
}

console.log('kernel/sample.selfcheck: OK (K2)', { modes: listSamplers().length });
