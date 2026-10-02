// node src/engine/kernel/sample/growth.selfcheck.mjs
// #720 — DLA / Eden growth sampler acceptance.

import assert from 'node:assert';
import {
  ensureAggregate,
  sampleGrowthPoint,
  cellsPerTick,
  stickinessFor,
  GrowthHooks,
} from './growth.js';
import { getSampler } from './registry.js';
import { computePlacements, geometrySignature } from '../../placement.js';
import { mkRng } from '../../prng.js';

const { clearGrowth, regrowGrowth, cellAge, age01, fadeWeight, constants } = GrowthHooks;
const { MAX_GROWTH_CELLS, GROWTH_FADE_TICKS } = constants;

const OPTS = (over = {}) => ({
  growthRate: 5, growthBranch: 0.8, audioEnergy: 0.5, seedOffsets: null, ...over,
});

function fresh(seed, mode, tick, opts) {
  clearGrowth(seed, mode, null);
  return ensureAggregate(seed, mode, tick, OPTS(opts));
}

// ── DLA correctness: every cell stuck to the existing form ────────────────
{
  const agg = fresh(1234, 'dla', 40, { growthRate: 8, audioEnergy: 1 });
  assert.ok(agg.cells.length > 100, 'DLA should have grown a real form');
  const occ = new Set(agg.cells.map((c) => c.gy * 128 + c.gx));
  for (const c of agg.cells) {
    let neighbours = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (occ.has((c.gy + dy) * 128 + (c.gx + dx))) neighbours++;
      }
    }
    assert.ok(neighbours > 0, `DLA cell (${c.gx},${c.gy}) floats unattached`);
  }
}

// ── Eden correctness: compact, no holes at the frontier ───────────────────
{
  const agg = fresh(1234, 'eden', 40, { growthRate: 8, audioEnergy: 1 });
  assert.ok(agg.cells.length > 100, 'Eden should have grown a real form');
  // Frontier integrity: every frontier cell is empty and touches the form.
  const occ = new Set(agg.cells.map((c) => c.gy * 128 + c.gx));
  for (const code of agg.frontierArr) {
    assert.ok(!occ.has(code), 'frontier cell is occupied — Eden invariant broken');
    const gx = code % 128;
    const gy = (code / 128) | 0;
    const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .some(([dx, dy]) => occ.has((gy + dy) * 128 + (gx + dx)));
    assert.ok(touches, 'frontier cell detached from the form');
  }
}

// ── Visually distinct organisms: dendritic vs compact ──────────────────────
{
  const dla = fresh(99, 'dla', 60, { growthRate: 8, audioEnergy: 1 });
  const eden = fresh(99, 'eden', 60, { growthRate: 8, audioEnergy: 1 });
  const fill = (agg) => {
    let minX = 1e9; let maxX = -1e9; let minY = 1e9; let maxY = -1e9;
    for (const c of agg.cells) {
      if (c.gx < minX) minX = c.gx;
      if (c.gx > maxX) maxX = c.gx;
      if (c.gy < minY) minY = c.gy;
      if (c.gy > maxY) maxY = c.gy;
    }
    return agg.cells.length / ((maxX - minX + 1) * (maxY - minY + 1));
  };
  const dlaFill = fill(dla);
  const edenFill = fill(eden);
  assert.ok(dlaFill < 0.35, `DLA should be spindly, fill=${dlaFill}`);
  assert.ok(edenFill > 0.5, `Eden should be compact, fill=${edenFill}`);
  assert.ok(edenFill > dlaFill * 2, 'organisms must be visually distinct');
}

// ── Seeded determinism: same seed → same growth, even across eviction ─────
{
  const snap = (agg) => agg.cells.map((c) => `${c.gx},${c.gy},${c.birth}`).join(';');
  const a = fresh(777, 'dla', 40, { growthBranch: 0.7 });
  const b = fresh(777, 'dla', 40, { growthBranch: 0.7 }); // cache cleared → full replay
  assert.strictEqual(snap(a), snap(b), 'rebuild must replay identically');
  const c = fresh(778, 'dla', 40, { growthBranch: 0.7 });
  assert.notStrictEqual(snap(a), snap(c), 'different seeds must differ');
  const e1 = fresh(777, 'eden', 40, {});
  const e2 = fresh(777, 'eden', 40, {});
  assert.strictEqual(snap(e1), snap(e2), 'Eden must be deterministic too');
}

// ── Never static: silent growth still advances ────────────────────────────
{
  assert.strictEqual(cellsPerTick(0, null), 1, 'growthRate 0, silent → floor of 1');
  assert.ok(cellsPerTick(3, null) >= 1, 'silent baseline must creep');
  let prev = 0;
  clearGrowth(555, 'dla', null);
  for (let tick = 0; tick <= 10; tick++) {
    const agg = ensureAggregate(555, 'dla', tick, OPTS({ audioEnergy: null }));
    assert.ok(agg.cells.length > prev, `tick ${tick}: silent growth stalled`);
    prev = agg.cells.length;
  }
}

// ── Audio response: rate follows the sound ────────────────────────────────
{
  const loud = fresh(31337, 'dla', 25, { growthRate: 6, audioEnergy: 1.0 });
  const quiet = fresh(31338, 'dla', 25, { growthRate: 6, audioEnergy: 0.0 });
  // (different seeds — energy, not seed, is the variable under test; the
  // rate ratio dwarfs seed variance)
  assert.ok(
    loud.cells.length > quiet.cells.length * 1.5,
    `audio should drive rate: loud=${loud.cells.length} quiet=${quiet.cells.length}`,
  );
  assert.ok(stickinessFor(1) > stickinessFor(0), 'branching knob must move stickiness');
  assert.strictEqual(stickinessFor(0.8), 0.25 + 0.75 * 0.8);
}

// ── Aging bound: the canvas never saturates permanently ───────────────────
{
  const agg = fresh(4242, 'eden', 200, { growthRate: 12, audioEnergy: 1 });
  assert.ok(agg.cells.length <= MAX_GROWTH_CELLS, 'aggregate must respect the cap');
  assert.strictEqual(agg.cells.length, MAX_GROWTH_CELLS, 'sustained growth should hit the cap');
  const oldest = Math.min(...agg.cells.map((c) => c.birth));
  assert.ok(oldest > 0, 'old growth must age out through the FIFO bound');
}

// ── Lifecycle hooks (interface for #793 — mechanism, no policy) ───────────
{
  assert.strictEqual(cellAge({ birth: 10 }, 25), 15);
  assert.strictEqual(age01(0, 0), 0);
  assert.strictEqual(age01(0, GROWTH_FADE_TICKS), 1);
  assert.strictEqual(age01(0, GROWTH_FADE_TICKS * 10), 1, 'age clamps at 1');
  assert.ok(age01(0, 100) < age01(0, 200), 'age increases with tick');
  assert.strictEqual(fadeWeight(0), 1);
  assert.strictEqual(fadeWeight(1), 0);
  assert.strictEqual(fadeWeight(0.5), 0.5);
  assert.ok(fadeWeight(0.25) > fadeWeight(0.5) && fadeWeight(0.5) > fadeWeight(0.75),
    'fade must decrease monotonically');

  // clear + regrow
  const seed = 808;
  const grown = fresh(seed, 'dla', 30, {});
  assert.ok(grown.cells.length > 64, 'precondition: grown past the initial form');
  clearGrowth(seed, 'dla', null);
  const regrown = ensureAggregate(seed, 'dla', 0, OPTS());
  assert.ok(regrown.cells.length < grown.cells.length, 'clear must drop the grown form');
  assert.strictEqual(regrown.tick, 0);
  const viaHook = regrowGrowth(seed, 'eden', null, 5, OPTS());
  assert.strictEqual(viaHook.tick, 5, 'regrowGrowth advances to the requested tick');
  assert.strictEqual(viaHook.mode, 'eden');
}

// ── Registry: both organisms registered, sampler ABI holds ────────────────
{
  for (const mode of ['dla', 'eden']) {
    const fn = getSampler(mode);
    assert.strictEqual(typeof fn, 'function', `${mode} sampler registered`);
    const ctx = {
      i: 3, count: 60, w: 1000, h: 700, rng: mkRng(42), jitter: 8, seed: 2024,
      seedOffsets: null, growthRate: 3, growthBranch: 0.8, growthTick: 12, audioEnergy: null,
    };
    const p = fn(ctx);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${mode}: finite point`);
    assert.ok(p.t >= 0 && p.t <= 1, `${mode}: t is a normalised age`);
    // Deterministic per index.
    const q = fn({ ...ctx, rng: mkRng(42) });
    assert.strictEqual(p.x, q.x);
    assert.strictEqual(p.y, q.y);
  }
}

// ── Orchestrator: dla/eden through computePlacements + signature honesty ───
{
  const base = {
    mode: 'dla', count: 60, seed: 0x1a4f, jitter: 10, density: 100, zTiers: 1,
    bleed: false, canvasW: 1000, canvasH: 700, growthRate: 3, growthBranch: 0.8,
    scale: [0.4, 0.8], rotate: [0, 45], alpha: [60, 100],
  };
  const items = computePlacements({ ...base, growthTick: 20 });
  assert.ok(items.length > 0, 'dla places items');
  for (const it of items) {
    assert.ok(Number.isFinite(it.x) && Number.isFinite(it.y), 'finite item positions');
    assert.ok(it.t >= 0 && it.t <= 1, 'item t is a normalised age');
  }
  const edenItems = computePlacements({ ...base, mode: 'eden', growthTick: 20 });
  assert.ok(edenItems.length > 0, 'eden places items');

  // growthTick busts the geometry cache; identical ticks hit it.
  const sigA = geometrySignature({ ...base, growthTick: 5 });
  const sigB = geometrySignature({ ...base, growthTick: 6 });
  const sigC = geometrySignature({ ...base, growthTick: 5 });
  assert.notDeepStrictEqual(sigA, sigB, 'tick advance must invalidate geometry');
  assert.deepStrictEqual(sigA, sigC, 'same tick must cache-hit');
}

console.log('growth selfcheck: OK — DLA/Eden aggregate, determinism, hooks, never-static, aging bound');
