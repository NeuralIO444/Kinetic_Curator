// node src/engine/particles.selfcheck.mjs
//
// Kernel v2 (#108) swarm SoA — behaviour lock.
//
// The SoA rewrite and the counting-sort spatial grid are pure performance
// changes: they must produce the *same swarm*, not a similar-looking one.
// That is a sharper requirement than it sounds. Boids sums float
// contributions from every neighbour, float addition is not associative, and
// the system is chaotic — reordering the neighbour visits by one position
// perturbs the last bits and, 120 steps later, gives a visibly different
// composition from the same seed. Every user project with a swarm layer
// would render differently.
//
// So the hashes below were captured from the PRE-SoA implementation (heap
// Particle objects + a Map keyed by `${cx},${cy}`) and must not move. If one
// of them fails, the rewrite changed behaviour somewhere, and the fix is to
// find the reordering — not to update the hash.
//
// Legitimate reasons to update these: a deliberate, announced change to the
// swarm physics. Never a refactor.

import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { ParticleSystem } from './particles.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';

const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] };

function run(mode, count, steps, attractor, extra = {}) {
  const sys = new ParticleSystem();
  const lp = normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS, mode, particleCount: count, ...extra,
  });
  sys.init(count, 1000, 700, assets, palette, 0x1a4f);
  for (let s = 0; s < steps; s++) {
    sys.update(lp, assets, palette, 0x1a4f, 1_000_000 + s * (1000 / 60), attractor);
  }
  return sys.getItems(assets);
}

function fingerprint(items) {
  const canon = items.map((it) => [
    it.x, it.y, it.scale, it.rotation, it.alpha, it.u,
    it.color, it.asset?.id, it.key ?? null, it.role ?? null,
  ]);
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex');
}

// Chosen to exercise every branch the rewrite touched: the cloud path, the
// attractor force, the organism path (spine + bilateral wings, different
// radii from the behave profile), a dense population where cells hold many
// particles, and a wind-heavy run that drives particles off-canvas into the
// negative cell coordinates the old Map handled implicitly.
const CASES = [
  {
    name: 'cloud-swarm-160x90',
    hash: '511ab610e4eb346a4733bbff83564eb63f85139556d655c8b56e0f78b32c875c',
    n: 160,
    run: () => run('swarm', 160, 90, null),
  },
  {
    name: 'cloud-attractor',
    hash: '82a8d3665bb774bed100dcb60ff92859dd113b19a991f77f63716189733d547e',
    n: 120,
    run: () => run('swarm', 120, 60, { x: 300, y: 250 }),
  },
  {
    name: 'organism-hype-body3',
    hash: '38c6bc12d5c6ecbf4abeeefe15648abd4bd82f959ace761c8083ffe57642d44a',
    n: 400,
    run: () => run('hype', 80, 60, null, { body: 3, symmetry: 'bilateral' }),
  },
  {
    name: 'dense-400x120',
    hash: '335900b0995d65dc54f4015fa3b8b9bac2fd1200ac57dab8b8b26d3d58b1d497',
    n: 400,
    run: () => run('swarm', 400, 120, null),
  },
  {
    name: 'wrap-stress',
    hash: '5aa2bfb56cd5e02a0992e41fbb6e14442494a50be35919db7c180ea02112ab5f',
    n: 200,
    run: () => run('swarm', 200, 200, null, { wind: 3, damping: 0.99 }),
  },
];

for (const c of CASES) {
  const items = c.run();
  assert.strictEqual(items.length, c.n, `${c.name}: item count`);
  const got = fingerprint(items);
  assert.strictEqual(
    got, c.hash,
    `${c.name}: swarm behaviour changed.\n  got:      ${got}\n  expected: ${c.hash}\n`
    + '  These hashes come from the pre-SoA engine. A mismatch means the\n'
    + '  refactor reordered neighbour visits or changed an arithmetic\n'
    + '  expression — find that, do not update the hash.',
  );
}

// The negative-cell case the counting-sort grid has to get right: cloud
// particles wrap at +/-120px, so their cell coordinates go negative. A grid
// clamped to the canvas would fold those into the edge cells and silently
// change who counts as a neighbour.
{
  const sys = new ParticleSystem();
  const lp = normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: 120, wind: 3, damping: 0.99,
  });
  sys.init(120, 1000, 700, assets, palette, 0x1a4f);
  for (let s = 0; s < 150; s++) {
    sys.update(lp, assets, palette, 0x1a4f, 1_000_000 + s * (1000 / 60), null);
  }
  let offCanvas = 0;
  for (let i = 0; i < sys.n; i++) {
    if (sys.x[i] < 0 || sys.y[i] < 0 || sys.x[i] > 1000 || sys.y[i] > 700) offCanvas++;
    assert.ok(Number.isFinite(sys.x[i]) && Number.isFinite(sys.y[i]), 'non-finite position');
  }
  assert.ok(offCanvas > 0, 'wind-heavy run should push particles off-canvas (negative cells)');
  assert.ok(sys._grid.minCx < 0 || sys._grid.minCy < 0, 'grid should span negative cell coords');
}

// Population changes must reallocate cleanly and not leak stale rows: the
// columns are sized to a capacity that only ever grows, so n is the only
// thing that says which rows are live.
{
  const sys = new ParticleSystem();
  const lp = (pc) => normalizeLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: pc });
  sys.init(300, 1000, 700, assets, palette, 0x1a4f);
  sys.update(lp(300), assets, palette, 0x1a4f, 1_000_000, null);
  assert.strictEqual(sys.physicsCount(), 300);
  // Shrink: capacity stays 300, n must drop and getItems must follow n.
  sys.update(lp(50), assets, palette, 0x1a4f, 1_000_100, null);
  assert.strictEqual(sys.physicsCount(), 50, 'shrinking the population must move n');
  assert.strictEqual(sys.getItems(assets).length, 50, 'getItems must read n, not capacity');
  // Grow past capacity: must reallocate rather than overflow.
  sys.update(lp(500), assets, palette, 0x1a4f, 1_000_200, null);
  assert.strictEqual(sys.physicsCount(), 500, 'growing past capacity must reallocate');
  assert.strictEqual(sys.getItems(assets).length, 500);
  for (let i = 0; i < sys.n; i++) {
    assert.ok(Number.isFinite(sys.x[i]), `row ${i} not initialised after regrow`);
  }
}

// Empty asset pool: init bails early, and nothing downstream may read stale
// columns from a previous population.
{
  const sys = new ParticleSystem();
  sys.init(100, 1000, 700, assets, palette, 0x1a4f);
  assert.strictEqual(sys.physicsCount(), 100);
  sys.init(100, 1000, 700, [], palette, 0x1a4f);
  assert.strictEqual(sys.physicsCount(), 0, 'empty pool must zero the population');
  assert.deepStrictEqual(sys.getItems([]), [], 'empty pool yields no items');
}

// resetPhase clears the live rows (used by the phrase-wrap hook).
{
  const sys = new ParticleSystem();
  const lp = normalizeLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, mode: 'hype', particleCount: 30 });
  sys.init(30, 1000, 700, assets, palette, 0x1a4f);
  for (let s = 0; s < 20; s++) sys.update(lp, assets, palette, 0x1a4f, 1_000_000 + s * 16, null);
  assert.ok(Array.from(sys.phase.subarray(0, sys.n)).some((p) => p !== 0), 'phase should advance');
  sys.resetPhase();
  assert.ok(Array.from(sys.phase.subarray(0, sys.n)).every((p) => p === 0), 'resetPhase must clear');
}

console.log('particles.selfcheck: OK (#108 swarm SoA — behaviour identical to pre-SoA engine)', {
  cases: CASES.length,
});
