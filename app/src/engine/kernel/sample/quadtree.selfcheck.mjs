// node src/engine/kernel/sample/quadtree.selfcheck.mjs
// #721 slice 1 — quadtree core acceptance: determinism, depth bound,
// leaf budget (pathological signal → uniform grid at cap), cache-key
// separation, and the degenerate never-empty case.

import assert from 'node:assert';
import {
  buildQuadtree,
  clearQuadtreeCache,
  QUAD_LEAF_BUDGET,
  QUAD_MAX_DEPTH,
} from './quadtree.js';
import { hashU01 } from '../rng.js';

// Stub interestingness: diagonal gradient, seed-shifted so different seeds
// actually grow different trees.
const stubFor = (seed) => (x, y, d) => {
  const shift = hashU01(seed, 'quad-test', 0);
  return (x * 0.6 + y * 0.4 + shift * 0.6) % 1;
};

// ── determinism: same seed → identical leaves ─────────────────────────────
{
  clearQuadtreeCache();
  const a = buildQuadtree({ interestingness: stubFor(7), seed: 7, maxDepth: 5 });
  const b = buildQuadtree({ interestingness: stubFor(7), seed: 7, maxDepth: 5 });
  assert.strictEqual(a, b, 'cache hit should return the identical array');
  clearQuadtreeCache();
  const c = buildQuadtree({ interestingness: stubFor(7), seed: 7, maxDepth: 5 });
  assert.deepStrictEqual(c, a, 'rebuild should be bit-identical');
  assert.ok(a.length > 1, 'stub should subdivide past the root');
}

// ── depth bound: no leaf deeper than maxDepth ─────────────────────────────
{
  clearQuadtreeCache();
  for (const maxDepth of [1, 3, 5, QUAD_MAX_DEPTH]) {
    const leaves = buildQuadtree({ interestingness: stubFor(42), seed: 42, maxDepth });
    assert.ok(leaves.length >= 1, 'must always return at least the root');
    for (const L of leaves) {
      assert.ok(L.depth <= maxDepth, `leaf deeper than maxDepth ${maxDepth}`);
      assert.ok(L.x >= 0 && L.y >= 0 && L.x + L.w <= 1 && L.y + L.h <= 1, 'leaf out of bounds');
    }
  }
}

// ── leaf budget: pathological all-interesting → uniform grid at cap ────────
{
  clearQuadtreeCache();
  const leaves = buildQuadtree({
    interestingness: () => 1, seed: 1, maxDepth: 5, leafBudget: QUAD_LEAF_BUDGET,
  });
  assert.ok(leaves.length <= QUAD_LEAF_BUDGET, `over budget: ${leaves.length}`);
  assert.strictEqual(leaves.length, QUAD_LEAF_BUDGET, 'all-interesting should fill the budget exactly');
  for (const L of leaves) {
    assert.strictEqual(L.depth, 5, 'all-interesting should subdivide to a uniform grid at maxDepth');
  }
  // Coverage: leaves tile the unit square exactly once.
  let area = 0;
  for (const L of leaves) area += L.w * L.h;
  assert.ok(Math.abs(area - 1) < 1e-9, `leaves must tile the plate, area=${area}`);
}

// ── cache-key separation: different seeds → different trees ───────────────
{
  clearQuadtreeCache();
  const a = buildQuadtree({ interestingness: stubFor(11), seed: 11, maxDepth: 5 });
  const b = buildQuadtree({ interestingness: stubFor(12), seed: 12, maxDepth: 5 });
  assert.notStrictEqual(a, b, 'different seeds must not share a cache entry');
  assert.ok(JSON.stringify(a) !== JSON.stringify(b), 'different seeds should grow different trees');
}

// ── degenerate: zero signal → just the root (never empty, never hangs) ────
{
  clearQuadtreeCache();
  const leaves = buildQuadtree({ interestingness: () => 0, seed: 1, maxDepth: 5 });
  assert.strictEqual(leaves.length, 1, 'zero signal → single root leaf');
  assert.strictEqual(leaves[0].depth, 0);
}

// ── hostile: NaN scores fail safe to 0 ────────────────────────────────────
{
  clearQuadtreeCache();
  const leaves = buildQuadtree({ interestingness: () => NaN, seed: 1, maxDepth: 5 });
  assert.strictEqual(leaves.length, 1, 'NaN signal → single root leaf, no hang');
}

console.log('quadtree.selfcheck: OK');
