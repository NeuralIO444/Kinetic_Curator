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

// ── #588 lsystem ────────────────────────────────────────────────────────────
{
  const lsystem = getSampler('lsystem');
  assert.ok(listSamplers().includes('lsystem'), 'lsystem must be registered');
  const W = 1000; const H = 700;
  const lay = (n, o = {}) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(lsystem({
        i, count: n, w: W, h: H, rng: () => 0.5, jitter: 0,
        seed: 42, seedOffsets: null, lsysDepth: 4, lsysAngle: 25, ...o,
      }));
    }
    return out;
  };

  const distinct = (o) => new Set(lay(3000, o).map((q) => `${q.x.toFixed(4)},${q.y.toFixed(4)}`)).size;

  // THE GOLDEN — one canonical plant, reproducible from a single seed rather
  // than found by rolling seeds until something symmetric appears. If the rule
  // set, the turtle, the normalisation or the branch scaling moves, this is
  // what says so.
  {
    const want = [
      [500, 672, 0], [500, 642.202632, 0],
      [507.807605, 625.459168, 0.25], [492.192395, 625.459168, 0.25],
      [500, 612.405264, 0], [500, 582.607896, 0],
      [507.807605, 565.864432, 0.25], [492.192395, 565.864432, 0.25],
    ];
    const got = lay(8).map((q) => [+q.x.toFixed(6), +q.y.toFixed(6), +q.t.toFixed(6)]);
    assert.deepStrictEqual(got, want, 'seed 42 / depth 4 / angle 25 is the canonical plate');
    // …and the OTHER two rules are pinned too, or a change to either would
    // slip past a golden that only ever exercises one of the three.
    const first = (seed, n) => lay(n, { seed }).map((q) => [+q.x.toFixed(6), +q.y.toFixed(6), +q.t.toFixed(6)]);
    assert.deepStrictEqual(first(2, 4), [
      [501.17529, 672, 0], [503.284578, 667.476618, 0.25],
      [501.17529, 663.95, 0], [499.066002, 659.426618, 0.25],
    ], 'seed 2 pins the second rule');
    assert.deepStrictEqual(first(101, 4), [
      [500, 672, 0], [511.249535, 647.875295, 0.25],
      [488.750465, 647.875295, 0.25], [500, 629.066667, 0],
    ], 'seed 101 pins the third rule');
    // The three seeds really do grow three different plants.
    assert.strictEqual(new Set([2, 42, 101].map((seed) => distinct({ seed }))).size, 3,
      'the canonical set must be three distinct rules');
  }

  // TOPOLOGY — this is the only sampler that grows a structure, so the test
  // that matters is that the structure has branches. A plant that collapses
  // onto a handful of coincident points still passes bounds and determinism.
  {
    assert.ok(distinct({ lsysDepth: 4 }) > 100, `depth 4 must be a real plant (got ${distinct({ lsysDepth: 4 })})`);
    // Deeper forks further — growth, not just more of the same.
    assert.ok(distinct({ lsysDepth: 5 }) > distinct({ lsysDepth: 4 }), 'depth 5 must out-branch depth 4');
    assert.ok(distinct({ lsysDepth: 4 }) > distinct({ lsysDepth: 3 }), 'depth 4 must out-branch depth 3');
  }

  // THE CAP — depth is bounded at both ends, so a hostile or mid-MIX value
  // cannot ask for an exponential walk.
  {
    assert.strictEqual(distinct({ lsysDepth: 99 }), distinct({ lsysDepth: 5 }), 'depth clamps to the cap');
    assert.strictEqual(distinct({ lsysDepth: -3 }), distinct({ lsysDepth: 1 }), 'depth clamps at the floor');
    for (const bad of [NaN, undefined, null, 'x', Infinity]) {
      const q = lay(1, { lsysDepth: bad })[0];
      assert.ok(Number.isFinite(q.x) && Number.isFinite(q.y), `depth ${bad} must still place a point`);
    }
    // Worst case stays inside the placement budget: the biggest rule at the
    // deepest allowed depth, against the quality caps' maxCount of 800.
    assert.ok(distinct({ lsysDepth: 5 }) < 4096, 'the walk must stay inside its segment budget');
  }

  // t IS THE BRANCH DEPTH — it feeds band colouring, so it has to be the
  // fork-fork-stop arc and not an index in disguise.
  {
    const p = lay(600);
    const ts = p.map((q) => q.t);
    assert.ok(ts.every((t) => Number.isFinite(t) && t >= 0 && t <= 1), 't must be a normalised depth');
    assert.ok(ts.includes(0), 'the trunk must be depth 0');
    assert.ok(new Set(ts).size >= 3, 'a plant needs several branch orders');
    assert.ok(Math.max(...ts) > 0.9, 'the deepest twigs must reach the top of the range');
    // Not the traversal index: t must repeat as the walk returns to the trunk.
    assert.ok(ts.slice(1).some((t, i) => t < ts[i]), 't must fall back when the turtle pops a branch');
  }

  // Bounds, determinism, and the angle actually being a knob.
  {
    const p = lay(400);
    for (const q of p) {
      assert.ok(q.x >= 0 && q.x <= W && q.y >= 0 && q.y <= H, `point ${q.x},${q.y} left the plate`);
    }
    assert.deepStrictEqual(lay(400), p, 'same seed, same plant');
    assert.notDeepStrictEqual(lay(400, { lsysAngle: 40 }), p, 'the branch angle must change the plant');
    assert.notDeepStrictEqual(lay(400, { seed: 43 }), p, 'a different seed grows a different plant');
  }
}

console.log('kernel/sample.selfcheck: OK (K2)', { modes: listSamplers().length });
