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
// This runs the real engine and a verbatim copy of the pre-SoA engine
// (particles.reference.mjs) side by side and requires them to agree on every
// field of every particle.
//
// It deliberately does NOT compare against recorded hashes. The first version of
// this file did, and CI caught the flaw: the swarm's output depends on
// Math.sin/cos/atan2, which ECMAScript does not require to be correctly
// rounded, and V8 evaluates them differently on x64 and arm64. Hashes
// captured on arm64 failed on CI's x64 even though the code was correct.
// Comparing two implementations in the same process cancels the platform out.
//
// (That platform dependence is a real property of the engine, not an artifact
// of this test — see docs/KERNEL_V1_PLAN.md §16. A bake is reproducible on a
// given machine, not across architectures.)

import assert from 'node:assert';
import { ParticleSystem } from './particles.js';
import { ReferenceParticleSystem } from './particles.reference.mjs';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';

const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] };

function run(Cls, mode, count, steps, attractor, extra = {}) {
  const sys = new Cls();
  const lp = normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS, mode, particleCount: count, ...extra,
  });
  sys.init(count, 1000, 700, assets, palette, 0x1a4f);
  for (let s = 0; s < steps; s++) {
    sys.update(lp, assets, palette, 0x1a4f, 1_000_000 + s * (1000 / 60), attractor);
  }
  return sys.getItems(assets);
}

const FIELDS = ['x', 'y', 'scale', 'rotation', 'alpha', 'u', 'color', 'key', 'role'];

function assertSameSwarm(got, want, label) {
  assert.strictEqual(got.length, want.length, `${label}: item count`);
  for (let i = 0; i < want.length; i++) {
    for (const f of FIELDS) {
      assert.ok(
        Object.is(got[i][f], want[i][f]),
        `${label}: item[${i}].${f} — SoA ${got[i][f]} vs pre-SoA reference ${want[i][f]}.\n`
        + '  The rewrite changed behaviour. Look for a reordered neighbour visit\n'
        + '  or a rewritten arithmetic expression (f/mass vs f*(1/mass),\n'
        + '  x/cellSize vs x*(1/cellSize)) — do not relax this assertion.',
      );
    }
    assert.strictEqual(got[i].asset?.id, want[i].asset?.id, `${label}: item[${i}].asset`);
  }
}

// Chosen to exercise every branch the rewrite touched: the cloud path, the
// attractor force, the organism path (spine + bilateral wings, different
// radii from the behave profile), a dense population where cells hold many
// particles, and a wind-heavy run that drives particles off-canvas into the
// negative cell coordinates the old Map handled implicitly.
const CASES = [
  ['cloud-swarm-160x90', ['swarm', 160, 90, null, {}]],
  ['cloud-attractor', ['swarm', 120, 60, { x: 300, y: 250 }, {}]],
  ['organism-hype-body3', ['hype', 80, 60, null, { body: 3, symmetry: 'bilateral' }]],
  ['dense-400x120', ['swarm', 400, 120, null, {}]],
  ['wrap-stress', ['swarm', 200, 200, null, { wind: 3, damping: 0.99 }]],
];

for (const [name, args] of CASES) {
  assertSameSwarm(run(ParticleSystem, ...args), run(ReferenceParticleSystem, ...args), name);
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

// #454 — a non-finite attractor (a zero-size canvas rect divides to
// Infinity upstream in useCanvasViewport.js) must not poison the swarm.
// dx/d = Infinity/Infinity = NaN in the attraction force, and the speed
// clamp further down can't bound NaN (every NaN comparison is false), so
// without a guard this corrupts every particle's position permanently.
// The fix guards at both ends: the hook never constructs a non-finite
// attractor (a zero-size rect degrades to null), and particles.js itself
// ignores a non-finite attractor defensively. This test exercises the
// particles.js guard directly, regardless of what upstream sends it.
{
  for (const attractor of [{ x: Infinity, y: Infinity }, { x: NaN, y: 300 }, { x: -Infinity, y: -Infinity }]) {
    const items = run(ParticleSystem, 'swarm', 60, 30, attractor);
    assert.ok(items.length > 0, 'a non-finite attractor must not empty the swarm');
    for (const it of items) {
      assert.ok(Number.isFinite(it.x) && Number.isFinite(it.y),
        `non-finite attractor ${JSON.stringify(attractor)} must not poison item positions (got x=${it.x}, y=${it.y})`);
    }
  }
}

// #479 Option B — per-layer BEHAVE steering-weight overrides.
{
  const steps = 40;
  // An unedited layer (behave set, no override fields touched) must be
  // bit-identical to how the table row always behaved — the null sentinel
  // is a true no-op, not just "close enough".
  const plainCruise = run(ParticleSystem, 'hype', 20, steps, null, { behave: 'cruise' });
  const explicitNullCruise = run(ParticleSystem, 'hype', 20, steps, null, {
    behave: 'cruise', behaveSep: null, behaveCoh: null,
  });
  for (let i = 0; i < plainCruise.length; i++) {
    assert.ok(Object.is(plainCruise[i].x, explicitNullCruise[i].x) && Object.is(plainCruise[i].y, explicitNullCruise[i].y),
      `item ${i}: an explicit null override must be bit-identical to no override at all`);
  }
  // Overriding sep/coh must visibly change the resulting motion — the
  // whole point of #479 Option B (a chip alone can't do this; only the
  // table row could, until now).
  const overridden = run(ParticleSystem, 'hype', 20, steps, null, {
    behave: 'cruise', behaveSep: 5.9, behaveCoh: 1.8,
  });
  const moved = overridden.some((it, i) =>
    Math.abs(it.x - plainCruise[i].x) > 1e-6 || Math.abs(it.y - plainCruise[i].y) > 1e-6);
  assert.ok(moved, 'a BEHAVE weight override must visibly change swarm motion vs the unedited table row');
  // Cloud (non-organism) modes never read the profile at all -- an override
  // must be silently inert there, same as swarmCohesion already is for hype.
  const cloudPlain = run(ParticleSystem, 'swarm', 20, steps, null);
  const cloudOverridden = run(ParticleSystem, 'swarm', 20, steps, null, { behaveSep: 5.9, behaveCoh: 1.8 });
  for (let i = 0; i < cloudPlain.length; i++) {
    assert.ok(Object.is(cloudPlain[i].x, cloudOverridden[i].x) && Object.is(cloudPlain[i].y, cloudOverridden[i].y),
      `item ${i}: BEHAVE overrides must be inert in cloud/swarm mode (organism-only)`);
  }
}

console.log('particles.selfcheck: OK (#108 swarm SoA — behaviour identical to pre-SoA engine)', {
  cases: CASES.length,
});
