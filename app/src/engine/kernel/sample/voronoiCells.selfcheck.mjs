// node src/engine/kernel/sample/voronoiCells.selfcheck.mjs
// #1196 — True Voronoi tessellation (gapless cellular fill) acceptance.

import assert from 'node:assert';
import { voronoiCells, voronoiCellSeeds, nearestSeed, clearVoronoiCellCache } from './voronoiCells.js';
import { getSampler, listSamplers } from './registry.js';
import { computePlacements } from '../../placement.js';
import { mkRng } from '../../prng.js';

const W = 1000;
const H = 700;

// ── registered ────────────────────────────────────────────────────────────
assert.strictEqual(typeof getSampler('voronoi-cells'), 'function', 'voronoi-cells must be registered');
assert.ok(listSamplers().includes('voronoi-cells'), 'voronoi-cells in listSamplers');

// ── deterministic per seed ───────────────────────────────────────────────────────────
{
  clearVoronoiCellCache();
  const mk = (s) => {
    const pts = [];
    for (let i = 0; i < 40; i++) {
      const rng = mkRng((s ^ (i * 0x9e3779b9)) >>> 0 || 1);
      pts.push(voronoiCells({ i, count: 40, w: W, h: H, rng, jitter: 0, seed: s, seedOffsets: null }));
    }
    return pts;
  };
  const a = mk(0xbeef);
  const b = mk(0xbeef);
  for (let i = 0; i < 40; i++) {
    assert.strictEqual(a[i].x, b[i].x, `x[${i}] deterministic`);
    assert.strictEqual(a[i].y, b[i].y, `y[${i}] deterministic`);
    assert.strictEqual(a[i].t, b[i].t, `t[${i}] deterministic`);
  }
}

// ── nearest-seed assignment holds (geometric correctness) ────────────────
{
  clearVoronoiCellCache();
  const seed = 0x1234;
  const count = 80;
  const seeds = voronoiCellSeeds(seed, W, H, null);
  assert.ok(seeds.n >= 4, 'enough seeds for cells');
  const pts = [];
  for (let i = 0; i < count; i++) {
    const rng = mkRng(i + 1);
    pts.push(voronoiCells({ i, count, w: W, h: H, rng, jitter: 0, seed, seedOffsets: null }));
  }
  for (let i = 0; i < count; i++) {
    const p = pts[i];
    assert.ok(p.x >= 0 && p.x < W && p.y >= 0 && p.y < H, `point ${i} in bounds`);
    const assigned = i % seeds.n;
    const nearest = nearestSeed(seeds, p.x, p.y);
    assert.strictEqual(nearest, assigned, `point ${i} nearest seed is the assigned cell`);
    // t encodes the cell identity
    const expectedT = seeds.n > 1 ? assigned / (seeds.n - 1) : 0.5;
    assert.ok(Math.abs(p.t - expectedT) < 1e-9, `t encodes cell ${assigned}`);
  }
}

// ── different seeds → different partitions ───────────────────────────────
{
  clearVoronoiCellCache();
  const a = voronoiCellSeeds(1, W, H, null);
  const b = voronoiCellSeeds(2, W, H, null);
  let same = 0;
  const n = Math.min(a.n, b.n);
  for (let i = 0; i < n; i++) {
    if (a.x[i] === b.x[i] && a.y[i] === b.y[i]) same++;
  }
  assert.ok(same < n, 'seeds diverge');
}

// ── orchestrator: places count finite points, composes with motion ───────
{
  const items = computePlacements({
    mode: 'voronoi-cells',
    count: 60,
    seed: 0x1a4f,
    scale: [0.4, 0.8],
    rotate: [0, 45],
    alpha: [60, 100],
    jitter: 8,
    density: 100,
    zTiers: 1,
    bleed: false,
    canvasW: W,
    canvasH: H,
  });
  assert.strictEqual(items.length, 60);
  for (const p of items) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
}

console.log('voronoiCells.selfcheck: ok');
