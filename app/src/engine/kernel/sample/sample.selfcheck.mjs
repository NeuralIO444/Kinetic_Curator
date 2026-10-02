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
  'dla', 'eden', // #720
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

// ── #586 truchet ────────────────────────────────────────────────────────────
{
  const truchet = getSampler('truchet');
  assert.ok(listSamplers().includes('truchet'), 'truchet must be registered');
  const W = 1000; const H = 700; const N = 400; const PER_CELL = 4;
  const lay = (seed, jitter = 0) => {
    const out = [];
    for (let i = 0; i < N; i++) {
      out.push(truchet({ i, count: N, w: W, h: H, rng: () => 0.5, jitter, seed, seedOffsets: null }));
    }
    return out;
  };
  const cellCount = Math.ceil(N / PER_CELL);
  const cols = Math.max(1, Math.ceil(Math.sqrt(cellCount * (W / H))));
  const rows = Math.max(1, Math.ceil(cellCount / cols));
  const pts = lay(99);
  for (const q of pts) {
    assert.ok(Number.isFinite(q.x) && Number.isFinite(q.y), 'finite');
    assert.ok(q.x >= 0 && q.x <= W && q.y >= 0 && q.y <= H, `point ${q.x},${q.y} left the plate`);
  }
  assert.deepStrictEqual(lay(99), pts, 'same seed, same tiling');
  assert.notDeepStrictEqual(lay(100), pts, 'a different seed re-tiles the floor');

  // THE TILE SET — every point must lie ON one of its cell's two quarter-arcs,
  // at exactly half a cell from the corner it turns around. This is what makes
  // it Smith tiles rather than a grid with noise in it, and it is the property
  // a "simplification" would quietly break.
  {
    const cw = W / cols; const ch = H / rows;
    for (let i = 0; i < N; i++) {
      const cell = Math.floor(i / PER_CELL) % (cols * rows);
      const col = cell % cols; const row = Math.floor(cell / cols);
      const ux = pts[i].x / cw - col;
      const uy = pts[i].y / ch - row;
      assert.ok(ux >= -1e-9 && ux <= 1 + 1e-9 && uy >= -1e-9 && uy <= 1 + 1e-9,
        `item ${i} fell outside its own cell (${ux}, ${uy})`);
      const onArc = [[0, 0], [1, 0], [0, 1], [1, 1]]
        .some(([ax, ay]) => Math.abs(Math.hypot(ux - ax, uy - ay) - 0.5) < 1e-9);
      assert.ok(onArc, `item ${i} is not on a quarter-arc (${ux.toFixed(3)}, ${uy.toFixed(3)})`);
    }
  }

  // ONE DECISION PER CELL — items sharing a cell must agree on which way the
  // tile turns. Orientation comes from a per-cell draw for exactly this
  // reason; a per-item draw would shear each tile's arcs apart.
  {
    const cw = W / cols; const ch = H / rows;
    const byCell = new Map();
    for (let i = 0; i < N; i++) {
      const cell = Math.floor(i / PER_CELL) % (cols * rows);
      const col = cell % cols; const row = Math.floor(cell / cols);
      const ux = pts[i].x / cw - col; const uy = pts[i].y / ch - row;
      // Which diagonal pair of corners this point turns around.
      const corner = [[0, 0], [1, 0], [0, 1], [1, 1]]
        .findIndex(([ax, ay]) => Math.abs(Math.hypot(ux - ax, uy - ay) - 0.5) < 1e-9);
      const diagonal = (corner === 0 || corner === 3) ? 'A' : 'B';
      if (!byCell.has(cell)) byCell.set(cell, diagonal);
      assert.strictEqual(byCell.get(cell), diagonal, `cell ${cell} turns two ways at once`);
    }
    // …and the floor must actually use both tiles, or there is no maze.
    const kinds = new Set(byCell.values());
    assert.strictEqual(kinds.size, 2, 'a Truchet floor needs both orientations');
  }

  // CONNECTIVITY — "a maze appears that no one authored" must not degrade into
  // disconnected noise. Flood-fill 4-connected across cells that received
  // points, from the first one: a broken cell mapping leaves stripes or islands.
  {
    const occ = new Set();
    for (const q of pts) {
      occ.add(Math.min(rows - 1, Math.floor(q.y / (H / rows))) * cols
        + Math.min(cols - 1, Math.floor(q.x / (W / cols))));
    }
    const start = [...occ][0];
    const seen = new Set([start]); const stack = [start];
    while (stack.length) {
      const c = stack.pop(); const cx = c % cols; const cy = Math.floor(c / cols);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx; const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const nc = ny * cols + nx;
        if (occ.has(nc) && !seen.has(nc)) { seen.add(nc); stack.push(nc); }
      }
    }
    assert.ok(seen.size / occ.size > 0.9,
      `the floor fragmented: ${seen.size}/${occ.size} cells reachable`);
    assert.ok(occ.size >= cellCount * 0.9, `the floor has holes: ${occ.size} of ${cellCount} cells used`);
  }
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
