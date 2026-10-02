// node src/biology/biology.selfcheck.mjs
// #793 — biology lifecycle policy acceptance. Deterministic, governor-free:
// the whole lifecycle (assess → decide → fade → clear/regrow) runs against
// real aggregates without a renderer.

import assert from 'node:assert';
import {
  BIO_KIND, BIO_VERSION,
  defaultBiologyPolicy, validateBiologyPolicy,
  getBiologyPolicy, importBiologyPolicy, resetBiologyPolicy, exportBiologyPolicy,
} from './policy.js';
import { assessAggregate, decideLifecycle, fadeForAge } from './lifecycle.js';
import {
  ensureAggregate, cellsPerTick, GrowthHooks,
} from '../engine/kernel/sample/growth.js';
import { buildPlacements } from '../engine/buildPlacements.js';

const { clearGrowth, age01, constants } = GrowthHooks;
const { MAX_GROWTH_CELLS, GROWTH_FADE_TICKS, MIN_INITIAL_CELLS } = constants;

const OPTS = { growthRate: 5, growthBranch: 0.8, audioEnergy: 0.5, seedOffsets: null };
const fresh = (seed, mode, tick, opts = {}) => {
  clearGrowth(seed, mode, null);
  return ensureAggregate(seed, mode, tick, { ...OPTS, ...opts });
};

// ── 1. Policy envelope: versioned, validated, forward-compatible ──────────
{
  const d = defaultBiologyPolicy();
  assert.strictEqual(d.kind, BIO_KIND, 'default kind');
  assert.strictEqual(d.version, BIO_VERSION, 'default version');
  const r = validateBiologyPolicy(d);
  assert.ok(r.ok, 'defaults validate');
  assert.deepStrictEqual(r.policy, d, 'validation normalizes to the defaults');

  assert.ok(!validateBiologyPolicy(null).ok, 'null rejected');
  assert.ok(!validateBiologyPolicy({ kind: 'nope', version: 1, growth: d.growth }).ok, 'wrong kind rejected');
  assert.ok(!validateBiologyPolicy({ kind: BIO_KIND, version: 999, growth: d.growth }).ok, 'wrong version rejected');
  assert.ok(!validateBiologyPolicy({ kind: BIO_KIND, version: 1 }).ok, 'missing growth rejected');
  const badFade = validateBiologyPolicy({ kind: BIO_KIND, version: 1, growth: { ...d.growth, fadeEnd: 0.1 } });
  assert.ok(!badFade.ok, 'fadeEnd <= fadeStart rejected');
  const badCap = validateBiologyPolicy({ kind: BIO_KIND, version: 1, growth: { ...d.growth, softCap: 10 } });
  assert.ok(!badCap.ok, 'softCap below floor rejected');
  const badNum = validateBiologyPolicy({ kind: BIO_KIND, version: 1, growth: { ...d.growth, maxLifespan: NaN } });
  assert.ok(!badNum.ok, 'NaN rejected');

  // Unknown future knobs are dropped, not rejected.
  const future = validateBiologyPolicy({
    kind: BIO_KIND, version: 1, growth: { ...d.growth, sporeChance: 0.5 },
  });
  assert.ok(future.ok && !('sporeChance' in future.policy.growth), 'unknown fields dropped');
}

// ── 2. Import / export / reset round-trip ──────────────────────────────────
{
  const d = defaultBiologyPolicy();
  const tuned = { kind: BIO_KIND, version: BIO_VERSION, growth: { ...d.growth, softCap: 900 } };
  assert.ok(importBiologyPolicy(tuned).ok, 'tuned policy imports');
  assert.strictEqual(getBiologyPolicy().growth.softCap, 900, 'imported policy is active');
  const exported = JSON.parse(exportBiologyPolicy());
  assert.ok(validateBiologyPolicy(exported).ok, 'exported policy re-validates');
  assert.strictEqual(exported.growth.softCap, 900, 'export carries the tuning');
  assert.ok(!importBiologyPolicy({ kind: BIO_KIND, version: 2, growth: d.growth }).ok, 'bad import rejected');
  assert.strictEqual(getBiologyPolicy().growth.softCap, 900, 'failed import does not clobber active policy');
  resetBiologyPolicy();
  assert.deepStrictEqual(getBiologyPolicy(), defaultBiologyPolicy(), 'reset restores defaults');
}

// ── 3. Fade curve: young fully present, old dissolved, monotonic ───────────
{
  const g = defaultBiologyPolicy().growth;
  assert.strictEqual(fadeForAge(0, g), 1, 'newborn unfaded');
  assert.strictEqual(fadeForAge(g.fadeStart, g), 1, 'fade starts at fadeStart');
  assert.ok(fadeForAge(1, g) < 0.01, 'fully aged ~invisible');
  let prev = 2;
  for (let a = 0; a <= 1.0001; a += 0.05) {
    const f = fadeForAge(a, g);
    assert.ok(f <= prev + 1e-9, `fade monotonic at age01=${a.toFixed(2)}`);
    assert.ok(f >= 0 && f <= 1, 'fade in 0..1');
    prev = f;
  }
  // Degenerate policy input can't break the curve.
  assert.strictEqual(fadeForAge(NaN, g), 1, 'NaN age reads as newborn');
  assert.strictEqual(fadeForAge(0.5, {}), GrowthHooks.fadeWeight(0.5), 'missing knobs fall back to the raw hook');
}

// ── 4. assessAggregate reads vital signs off a real aggregate ──────────────
{
  const agg = fresh(0xbeef, 'dla', 200);
  const s = assessAggregate(agg);
  assert.ok(s.cellCount > MIN_INITIAL_CELLS, 'grown population');
  assert.strictEqual(s.oldestAge, 200, 'zygote age == tick');
  assert.ok(s.meanAge01 > 0 && s.meanAge01 < 1, 'mean age normalized');
  assert.ok(s.saturation01 > 0 && s.saturation01 <= 1, 'saturation normalized');
  const empty = assessAggregate({ tick: 0, cells: [] });
  assert.deepStrictEqual([empty.cellCount, empty.oldestAge, empty.meanAge01], [0, 0, 0], 'empty aggregate safe');
}

// ── 5. decideLifecycle: the three deaths + the young-form rail ─────────────
{
  const g = defaultBiologyPolicy().growth;
  const alive = { cellCount: 500, oldestAge: 400, meanAge01: 0.3, saturation01: 0.25 };
  assert.strictEqual(decideLifecycle(alive, g, 400).action, 'none', 'mid-life form lives');

  const crowded = { ...alive, cellCount: g.softCap };
  assert.strictEqual(decideLifecycle(crowded, g, 400).action, 'regrow', 'softCap triggers regrow');

  const ancient = { ...alive, oldestAge: g.maxLifespan };
  assert.strictEqual(decideLifecycle(ancient, g, g.maxLifespan).action, 'regrow', 'maxLifespan triggers regrow');

  const senescent = { ...alive, meanAge01: g.regrowMeanAge };
  assert.strictEqual(decideLifecycle(senescent, g, 900).action, 'regrow', 'mean age triggers regrow');

  // minLifetime rail: even a crowded newborn is not reborn.
  const newbornCrowded = { cellCount: g.softCap + 1, oldestAge: 10, meanAge01: 0.02, saturation01: 0.7 };
  assert.strictEqual(decideLifecycle(newbornCrowded, g, 10).action, 'none', 'young form never regrows');
}

// ── 6. Full lifecycle, headless: age → fade → regrow → rebirth ─────────────
{
  const g = defaultBiologyPolicy().growth;
  const seed = 0x793;
  // Grow a DLA form to the end of its natural life.
  let agg = fresh(seed, 'dla', g.maxLifespan);
  let stats = assessAggregate(agg);
  assert.ok(stats.cellCount > 0, 'form lived');
  const decision = decideLifecycle(stats, g, g.maxLifespan);
  assert.strictEqual(decision.action, 'regrow', `policy ends the generation (${decision.reason})`);

  // Perform the regrow through the #833 hooks: clear + tick reset.
  GrowthHooks.clearGrowth(seed, 'dla', null);
  agg = ensureAggregate(seed, 'dla', 0, OPTS);
  stats = assessAggregate(agg);
  assert.ok(stats.cellCount >= MIN_INITIAL_CELLS, 'rebirth blooms immediately');
  assert.strictEqual(stats.oldestAge, 0, 'new generation starts young');
  assert.strictEqual(decideLifecycle(stats, g, 0).action, 'none', 'newborn is not reborn');

  // Determinism: the reborn form is the same organism (same seed, same tick).
  const again = fresh(seed, 'dla', 120);
  const once = ensureAggregate(seed, 'dla', 120, OPTS);
  assert.strictEqual(again.cells.length, once.cells.length, 'rebirth is deterministic');
  assert.deepStrictEqual(
    again.cells.map((c) => [c.gx, c.gy, c.birth]),
    once.cells.map((c) => [c.gx, c.gy, c.birth]),
    'rebirth cell-for-cell identical',
  );

  // Never static: the drive floors at 1 cell/tick even silent at rate 0.
  assert.ok(cellsPerTick(0, null) >= 1, 'silent rate-0 still creeps');
  // Never saturated: the hard cap holds no matter the drive.
  const hot = fresh(0x794, 'eden', 400, { growthRate: 12, audioEnergy: 1 });
  assert.ok(hot.cells.length <= MAX_GROWTH_CELLS, 'hard cap holds at max drive');
}

// ── 7. Fade reaches the items: old cells dim through the alpha channel ─────
// (through buildPlacements — the live/stills path — not the legacy
// computePlacements view, which has no production callers.)
{
  const assets = [{ id: 'a', weight: 'heavy' }];
  const palette = { swatches: ['#111', '#222', '#333', '#444'] };
  const layoutParams = {
    mode: 'dla', composition: 'default', count: 60,
    scale: [0.4, 0.8], rotate: [0, 45], alpha: [60, 100],
    jitter: 10, density: 100, zTiers: 1, bleed: false, mirror: false,
    overlap: true, displacement: 0, noiseFreq: 0.005, noiseSpeed: 0.5,
    growthRate: 3, growthBranch: 0.8,
  };
  const common = {
    layoutParams, seed: 0x1a4f, seedOffsets: null, activeAssets: assets,
    palette, canvasW: 1000, canvasH: 700, audioEnergy: null,
  };
  // A late-tick form has fully-aged cells; their item alpha must be faded
  // below the young form's. (alpha range 60..100 → base per-item alpha.)
  const young = buildPlacements({ ...common, growthTick: 20 }).items;
  const old = buildPlacements({ ...common, growthTick: GROWTH_FADE_TICKS + 100 }).items;
  assert.ok(young.length > 0 && old.length > 0, 'both forms place items');
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const youngAlpha = mean(young.map((it) => it.alpha));
  const oldAlpha = mean(old.map((it) => it.alpha));
  assert.ok(oldAlpha < youngAlpha, `old form faded (${oldAlpha.toFixed(1)} < ${youngAlpha.toFixed(1)})`);
  for (const it of old) assert.ok(it.alpha >= 0, 'faded alpha never negative');
  // Non-growth modes are untouched by the biology fade.
  const grid = buildPlacements({ ...common, layoutParams: { ...layoutParams, mode: 'grid' }, growthTick: 50 }).items;
  assert.ok(grid.length > 0 && grid.every((it) => it.alpha >= 60), 'grid alpha unfaded');
}

console.log('biology selfcheck: OK — versioned policy, lifecycle decisions, fade, regrow/rebirth, never-static');
