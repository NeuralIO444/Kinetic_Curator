// node src/engine/kernel/sample/poisson.selfcheck.mjs
// #1193 — Poisson-disc (blue-noise) sampler acceptance.

import assert from 'node:assert';
import { poisson, poissonPointSet, poissonMinDistance, clearPoissonCache } from './poisson.js';
import { getSampler, listSamplers } from './registry.js';
import { computePlacements } from '../../placement.js';
import { mkRng } from '../../prng.js';

const W = 1000;
const H = 700;

// ── registered ──────────────────────────────────────────────────────────
assert.strictEqual(typeof getSampler('poisson'), 'function', 'poisson must be registered');
assert.ok(listSamplers().includes('poisson'), 'poisson in listSamplers');

// ── deterministic per seed ──────────────────────────────────────────────
{
  clearPoissonCache();
  const mk = (s) => {
    const pts = [];
    for (let i = 0; i < 60; i++) {
      const rng = mkRng((s ^ (i * 0x9e3779b9)) >>> 0 || 1);
      pts.push(poisson({ i, count: 60, w: W, h: H, rng, jitter: 0, seed: s, seedOffsets: null }));
    }
    return pts;
  };
  const a = mk(0xbeef);
  const b = mk(0xbeef);
  for (let i = 0; i < 60; i++) {
    assert.strictEqual(a[i].x, b[i].x, `x[${i}] deterministic`);
    assert.strictEqual(a[i].y, b[i].y, `y[${i}] deterministic`);
  }
  // The exported set is deterministic too (the #1195–#1197 substrate).
  const s1 = poissonPointSet(0xbeef, 60, W, H, null);
  const s2 = poissonPointSet(0xbeef, 60, W, H, null);
  assert.strictEqual(s1.length, s2.length);
  for (let i = 0; i < s1.length; i++) {
    assert.strictEqual(s1[i].x, s2[i].x);
    assert.strictEqual(s1[i].y, s2[i].y);
  }
}

// ── min-distance guarantee, exact (assert, not eyeball) ──────────────────
function assertBlueNoise(set, w, h, r, label) {
  assert.ok(set.length > 0, `${label}: non-empty set`);
  for (const p of set) {
    assert.ok(p.x >= 0 && p.x < w, `${label}: x in bounds`);
    assert.ok(p.y >= 0 && p.y < h, `${label}: y in bounds`);
  }
  const r2 = r * r * (1 - 1e-9);
  for (let a = 0; a < set.length; a++) {
    for (let b = a + 1; b < set.length; b++) {
      const dx = set[a].x - set[b].x;
      const dy = set[a].y - set[b].y;
      assert.ok(dx * dx + dy * dy >= r2, `${label}: pair (${a},${b}) respects min distance`);
    }
  }
}

{
  clearPoissonCache();
  for (const count of [50, 120, 500]) {
    const r = poissonMinDistance(count, W, H);
    const set = poissonPointSet(0x1234, count, W, H, null);
    // The maximal set comfortably covers the requested count (K=0.65 aims ~2×).
    assert.ok(set.length >= count, `count=${count}: set fills (${set.length})`);
    assertBlueNoise(set, W, H, r, `count=${count}`);
  }
}

// ── jitter is ignored: the guarantee stays exact even with jitter set ────
{
  clearPoissonCache();
  const count = 80;
  const r = poissonMinDistance(count, W, H);
  const pts = [];
  for (let i = 0; i < count; i++) {
    pts.push(poisson({ i, count, w: W, h: H, rng: mkRng(i + 1), jitter: 40, seed: 77, seedOffsets: null }));
  }
  assertBlueNoise(pts, W, H, r, 'jitter=40');
}

// ── radius scales with count and canvas ───────────────────────────────────
{
  const r50 = poissonMinDistance(50, W, H);
  const r500 = poissonMinDistance(500, W, H);
  assert.ok(r500 < r50, 'min distance shrinks as count grows');
  const rSmall = poissonMinDistance(100, 200, 140);
  const rBig = poissonMinDistance(100, W, H);
  assert.ok(rSmall < rBig, 'min distance shrinks with canvas');
  // Override wins.
  clearPoissonCache();
  const set = poissonPointSet(9, 60, W, H, null, 30);
  assertBlueNoise(set, W, H, 30, 'radiusOverride=30');
}

// ── different seeds → different scatters ─────────────────────────────────
{
  clearPoissonCache();
  const a = poissonPointSet(1, 60, W, H, null);
  const b = poissonPointSet(2, 60, W, H, null);
  let same = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i].x === b[i].x && a[i].y === b[i].y) same++;
  }
  assert.ok(same < Math.min(a.length, b.length), 'seeds diverge');
}

// ── orchestrator: poisson mode places count finite points ────────────────
{
  const items = computePlacements({
    mode: 'poisson',
    count: 60,
    seed: 0x1a4f,
    scale: [0.4, 0.8],
    rotate: [0, 45],
    alpha: [60, 100],
    jitter: 10,
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

console.log('poisson.selfcheck: ok');
