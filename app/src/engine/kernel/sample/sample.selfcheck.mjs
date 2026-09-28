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

// ── #585 phyllotaxis ────────────────────────────────────────────────────────
{
  const phyllo = getSampler('phyllotaxis');
  const fib = getSampler('fibonacci');
  assert.ok(listSamplers().includes('phyllotaxis'), 'phyllotaxis must be registered');

  const W = 1000; const H = 700; const COUNT = 400;
  /** Lay out the whole disc; jitter off so the geometry is the only thing measured. */
  const disc = (sampler, phylloDivergence) => {
    const out = [];
    for (let i = 0; i < COUNT; i++) {
      out.push(sampler({ i, count: COUNT, w: W, h: H, rng: () => 0.5, jitter: 0, seed: 7, phylloDivergence }));
    }
    return out;
  };

  // SIBLING, NOT STRANGER — at the default divergence (0 = the golden angle)
  // phyllotaxis and the fibonacci tile must agree EXACTLY, not merely closely.
  {
    const p = disc(phyllo, 0);
    const f = disc(fib, undefined);
    for (let i = 0; i < COUNT; i++) {
      assert.strictEqual(p[i].x, f[i].x, `divergence 0 must equal fibonacci exactly at i=${i}`);
      assert.strictEqual(p[i].y, f[i].y, `divergence 0 must equal fibonacci exactly at i=${i}`);
    }
    // …and an absent/garbage divergence falls back to that same golden angle.
    for (const bad of [undefined, null, NaN, 'x']) {
      assert.strictEqual(disc(phyllo, bad)[137].x, f[137].x, `divergence ${bad} must fall back to golden`);
    }
  }

  /**
   * The dominant parastichy: the modal index gap between nearest neighbours.
   * This is what the eye counts as spiral arms — at the golden angle the gaps
   * land on consecutive Fibonacci numbers.
   */
  const parastichy = (pts) => {
    const gaps = new Map();
    for (let i = 0; i < pts.length; i++) {
      let best = -1; let bd = Infinity;
      for (let j = 0; j < pts.length; j++) {
        if (i === j) continue;
        const d = (pts[i].x - pts[j].x) ** 2 + (pts[i].y - pts[j].y) ** 2;
        if (d < bd) { bd = d; best = j; }
      }
      const g = Math.abs(i - best);
      gaps.set(g, (gaps.get(g) || 0) + 1);
    }
    return [...gaps.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  // THE ACCEPTANCE TEST — the parastichy shift is a count, not a vibe.
  {
    const FIBS = new Set([1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144]);
    const atGolden = parastichy(disc(phyllo, 0));
    assert.ok(FIBS.has(atGolden), `the golden angle must produce a Fibonacci parastichy (got ${atGolden})`);
    // A fraction of a degree re-counts the arms — that is the whole knob.
    for (const off of [0.5, 1, 2, -1.5]) {
      assert.notStrictEqual(parastichy(disc(phyllo, off)),
        atGolden, `divergence ${off} must shift the parastichy away from ${atGolden}`);
    }
  }

  // Bounds, count and determinism.
  {
    const p = disc(phyllo, 3);
    assert.strictEqual(p.length, COUNT);
    for (const q of p) {
      assert.ok(Number.isFinite(q.x) && Number.isFinite(q.y), 'finite');
      assert.ok(q.x >= 0 && q.x <= W && q.y >= 0 && q.y <= H, `point ${q.x},${q.y} left the plate`);
    }
    assert.deepStrictEqual(disc(phyllo, 3), p, 'same divergence, same disc');
    assert.notDeepStrictEqual(disc(phyllo, 4), p, 'a different divergence is a different disc');
  }
}

console.log('kernel/sample.selfcheck: OK (K2)', { modes: listSamplers().length });
