// node src/engine/kernel/sample/growth.selfcheck.mjs
// #720 — DLA / Eden growth sampler acceptance.

import assert from 'node:assert';
import { createHash } from 'node:crypto';
import {
  ensureAggregate,
  sampleGrowthPoint,
  cellsPerTick,
  stickinessFor,
  liveCount,
  liveCell,
  ageOut,
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

/** Live cells in draw order (oldest living first) — the #1242 survivor sequence. */
function liveCells(agg) {
  const out = [];
  const n = liveCount(agg);
  for (let i = 0; i < n; i++) out.push(liveCell(agg, i));
  return out;
}

// ── DLA correctness: every cell stuck to the existing form ────────────────
{
  const agg = fresh(1234, 'dla', 40, { growthRate: 8, audioEnergy: 1 });
  assert.ok(liveCount(agg) > 100, 'DLA should have grown a real form');
  const occ = new Set(liveCells(agg).map((c) => c.gy * 128 + c.gx));
  for (const c of liveCells(agg)) {
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
  assert.ok(liveCount(agg) > 100, 'Eden should have grown a real form');
  // Frontier integrity: every frontier cell is empty and touches the form.
  const occ = new Set(liveCells(agg).map((c) => c.gy * 128 + c.gx));
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
    for (const c of liveCells(agg)) {
      if (c.gx < minX) minX = c.gx;
      if (c.gx > maxX) maxX = c.gx;
      if (c.gy < minY) minY = c.gy;
      if (c.gy > maxY) maxY = c.gy;
    }
    return liveCount(agg) / ((maxX - minX + 1) * (maxY - minY + 1));
  };
  const dlaFill = fill(dla);
  const edenFill = fill(eden);
  assert.ok(dlaFill < 0.35, `DLA should be spindly, fill=${dlaFill}`);
  assert.ok(edenFill > 0.5, `Eden should be compact, fill=${edenFill}`);
  assert.ok(edenFill > dlaFill * 2, 'organisms must be visually distinct');
}

// ── Seeded determinism: same seed → same growth, even across eviction ─────
{
  const snap = (agg) => liveCells(agg).map((c) => `${c.gx},${c.gy},${c.birth}`).join(';');
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
    assert.ok(liveCount(agg) > prev, `tick ${tick}: silent growth stalled`);
    prev = liveCount(agg);
  }
}

// ── Audio response: rate follows the sound ────────────────────────────────
{
  const loud = fresh(31337, 'dla', 25, { growthRate: 6, audioEnergy: 1.0 });
  const quiet = fresh(31338, 'dla', 25, { growthRate: 6, audioEnergy: 0.0 });
  // (different seeds — energy, not seed, is the variable under test; the
  // rate ratio dwarfs seed variance)
  assert.ok(
    liveCount(loud) > liveCount(quiet) * 1.5,
    `audio should drive rate: loud=${liveCount(loud)} quiet=${liveCount(quiet)}`,
  );
  assert.ok(stickinessFor(1) > stickinessFor(0), 'branching knob must move stickiness');
  assert.strictEqual(stickinessFor(0.8), 0.25 + 0.75 * 0.8);
}

// ── Aging bound: the canvas never saturates permanently ───────────────────
{
  const agg = fresh(4242, 'eden', 200, { growthRate: 12, audioEnergy: 1 });
  assert.ok(liveCount(agg) <= MAX_GROWTH_CELLS, 'aggregate must respect the cap');
  assert.strictEqual(liveCount(agg), MAX_GROWTH_CELLS, 'sustained growth should hit the cap');
  const oldest = Math.min(...liveCells(agg).map((c) => c.birth));
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
  assert.ok(liveCount(grown) > 64, 'precondition: grown past the initial form');
  clearGrowth(seed, 'dla', null);
  const regrown = ensureAggregate(seed, 'dla', 0, OPTS());
  assert.ok(liveCount(regrown) < liveCount(grown), 'clear must drop the grown form');
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

// ── #1242: head-index dequeue is byte-identical to shift() ─────────────────
// Byte-identical means the sequence of surviving cells and their draw order.
// Draw order IS the survivor sequence: the sampler reads `liveCell(i % n)`
// over instance index i, so one pin covers both.

// (a) Golden null-audio sequences: the dequeue change must not move the
// sequence at (seed, tick) with audioEnergy=null. Captured from the
// shift()-based implementation before the head-index change — #1252's
// fixture note says #1242 lands against this pin. This does not close
// #1185: a live-grown form still cannot be reproduced in a still.
{
  const NULL_AUDIO_GOLDENS = [
    // [mode, seed, tick, opts, sha256(survivor sequence) truncated to 32 hex]
    ['dla', 777, 450, { growthRate: 12, growthBranch: 0.7 }, 'b336f63d2e76c120e43e695062c9de58'],
    ['dla', 1234, 450, { growthRate: 12, growthBranch: 0.8 }, '58ed53b111c5e3542935baaf4d42efa4'],
    ['eden', 4242, 400, { growthRate: 12, growthBranch: 0.8 }, 'db659dbbb308e9cb3a4b5bbde8f2fe7c'],
    ['eden', 777, 300, { growthRate: 5, growthBranch: 0.5 }, '9d1c0cddf6e0934281a99a4e5a031e04'],
  ];
  for (const [mode, seed, tick, opts, want] of NULL_AUDIO_GOLDENS) {
    clearGrowth(seed, mode, null);
    const agg = ensureAggregate(seed, mode, tick, { ...opts, audioEnergy: null, seedOffsets: null });
    const seq = liveCells(agg).map((c) => `${c.gx},${c.gy},${c.birth}`).join(';');
    const got = createHash('sha256').update(seq).digest('hex').slice(0, 32);
    assert.strictEqual(got, want, `${mode}/${seed}@tick${tick}: null-audio sequence moved`);
  }
}

// (b) Randomized equivalence: head-index ageOut vs the old shift() dequeue.
// The reference replicates the pre-#1242 implementation exactly (shift,
// occ free, Eden frontier swap-drop); the fixture drives the exported
// ageOut. Same survivors, same draw order, same occ, same frontier.
{
  const G = 128;
  const MAX = 2048;
  function ageOutShiftReference(agg) {
    while (agg.cells.length > MAX) {
      const old = agg.cells.shift();
      const code = old.gy * G + old.gx;
      agg.occ[code] = 0;
      if (agg.mode === 'eden') {
        const fi = agg.frontierIdx.get(code);
        if (fi !== undefined) {
          const last = agg.frontierArr.pop();
          agg.frontierIdx.delete(code);
          if (fi < agg.frontierArr.length) {
            agg.frontierArr[fi] = last;
            agg.frontierIdx.set(last, fi);
          }
        }
      }
    }
  }
  function syntheticFixture(mode, cellTarget, rng) {
    const cells = [];
    const occ = new Uint8Array(G * G);
    const used = new Set();
    while (cells.length < cellTarget) {
      const gx = 1 + ((rng() * (G - 2)) | 0);
      const gy = 1 + ((rng() * (G - 2)) | 0);
      const code = gy * G + gx;
      if (used.has(code)) continue;
      used.add(code);
      occ[code] = 1;
      cells.push({ gx, gy, ux: (gx + 0.5) / G, uy: (gy + 0.5) / G, birth: (rng() * 1000) | 0 });
    }
    const frontierArr = [];
    const frontierIdx = new Map();
    if (mode === 'eden') {
      let guard = 0;
      const want = Math.min(500, cellTarget >> 2);
      while (frontierArr.length < want && guard++ < 40000) {
        const code = (rng() * G * G) | 0;
        if (used.has(code) || frontierIdx.has(code)) continue;
        frontierIdx.set(code, frontierArr.length);
        frontierArr.push(code);
      }
    }
    return { mode, tick: 1000, cells, head: 0, occ, frontierArr, frontierIdx };
  }
  function cloneFixture(f) {
    return {
      mode: f.mode,
      tick: f.tick,
      cells: f.cells.map((c) => ({ ...c })),
      head: f.head,
      occ: Uint8Array.from(f.occ),
      frontierArr: [...f.frontierArr],
      frontierIdx: new Map(f.frontierIdx),
    };
  }
  for (const mode of ['dla', 'eden']) {
    for (let trial = 0; trial < 5; trial++) {
      const rng = mkRng(0x1242 + trial * 7919 + (mode === 'eden' ? 100000 : 0));
      const size = MAX + 1 + ((rng() * 4000) | 0); // 2049..6048 — always ages
      const fixture = syntheticFixture(mode, size, rng);
      const ref = cloneFixture(fixture);
      ageOutShiftReference(ref);
      ageOut(fixture);
      const tag = `${mode} trial ${trial} (size ${size})`;
      assert.strictEqual(liveCount(fixture), ref.cells.length, `${tag}: live count`);
      for (let i = 0; i < ref.cells.length; i++) {
        assert.deepStrictEqual(liveCell(fixture, i), ref.cells[i], `${tag}: survivor ${i}`);
      }
      // Draw order: instance index i reads cells[i % n].
      const n = ref.cells.length;
      for (let i = 0; i < n * 2 + 7; i++) {
        assert.deepStrictEqual(
          liveCell(fixture, i % liveCount(fixture)), ref.cells[i % n], `${tag}: draw order ${i}`);
      }
      assert.deepStrictEqual([...fixture.occ], [...ref.occ], `${tag}: occ freed identically`);
      if (mode === 'eden') {
        const key = (a) => [...a].sort((x, y) => x - y).join(',');
        assert.strictEqual(key(fixture.frontierArr), key(ref.frontierArr), `${tag}: frontier set`);
        for (const [code, idx] of fixture.frontierIdx) {
          assert.strictEqual(fixture.frontierArr[idx], code, `${tag}: frontier index map`);
        }
      }
    }
  }
}

// (c) Lazy compaction: the raw array stays bounded, output stays identical.
{
  // Deep past the compact threshold (head would be 9952 > 2048): one O(live)
  // copy must fire, head resets, survivors unchanged vs shift().
  const rng = mkRng(0xbeef1242);
  const big = { mode: 'eden', tick: 1000, cells: [], head: 0, occ: new Uint8Array(128 * 128), frontierArr: [], frontierIdx: new Map() };
  const used = new Set();
  const G = 128;
  while (big.cells.length < 12000) {
    const gx = 1 + ((rng() * (G - 2)) | 0);
    const gy = 1 + ((rng() * (G - 2)) | 0);
    const code = gy * G + gx;
    if (used.has(code)) continue;
    used.add(code);
    big.occ[code] = 1;
    big.cells.push({ gx, gy, ux: 0, uy: 0, birth: big.cells.length });
  }
  const refCells = big.cells.slice();
  ageOut(big);
  assert.strictEqual(liveCount(big), 2048, 'compaction keeps the live window');
  assert.strictEqual(big.head, 0, 'compaction resets the head');
  assert.ok(big.cells.length <= 4096, `raw array bounded after compaction: ${big.cells.length}`);
  for (let i = 0; i < 2048; i++) {
    assert.deepStrictEqual(liveCell(big, i), refCells[refCells.length - 2048 + i],
      `compaction survivor ${i}`);
  }
  // Below the threshold the dead prefix is retained (lazy, not eager).
  const small = { mode: 'dla', tick: 1000, cells: [], head: 0, occ: new Uint8Array(128 * 128), frontierArr: [], frontierIdx: new Map() };
  const used2 = new Set();
  const rng2 = mkRng(7);
  while (small.cells.length < 3000) {
    const gx = 1 + ((rng2() * (G - 2)) | 0);
    const gy = 1 + ((rng2() * (G - 2)) | 0);
    const code = gy * G + gx;
    if (used2.has(code)) continue;
    used2.add(code);
    small.occ[code] = 1;
    small.cells.push({ gx, gy, ux: 0, uy: 0, birth: small.cells.length });
  }
  ageOut(small);
  assert.strictEqual(liveCount(small), 2048, 'live window correct without compaction');
  assert.strictEqual(small.cells.length, 3000, 'dead prefix retained until threshold — lazy compaction');
}

console.log('growth selfcheck: OK — DLA/Eden aggregate, determinism, hooks, never-static, aging bound, head-index dequeue');
