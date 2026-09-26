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

console.log('kernel/sample.selfcheck: OK (K2)', { modes: listSamplers().length });
