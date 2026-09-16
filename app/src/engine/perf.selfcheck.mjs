// node src/engine/perf.selfcheck.mjs
//
// Kernel v2 (#108) baseline + regression gate. "Measure first... rewrite is
// a response to a missed budget, not a vibe" — this file is that measurement.
//
// STATUS: SoA landed (step 2 of 6). Budgets 1 and 2 now time
// computePlacementsSoA — that IS the kernel. computePlacements is a
// compatibility shim that materializes array-of-objects on top of the
// columns for callers not yet reading them, and it gets its own separate
// line so its cost stays visible instead of being smuggled into the
// kernel's number.
//
// Budgets remain #108's target contract for the FINISHED engine (steps 3-6
// still outstanding: field texture, staged eval, worker ABI). Correctness
// assertions below are real gates — they fail the build. Budget numbers are
// measured and printed every run so the trend shows in CI logs, but only
// THROW once ENFORCE_BUDGET flips, which needs the fBm field texture (step
// 3) and the swarm SoA — flipping it now would fail CI on work not yet done.
const ENFORCE_BUDGET = false;

import assert from 'node:assert';
import { computePlacements, computePlacementsSoA } from './placement.js';
import { bakeParticles } from './kernel/bake/index.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

const SEED = 0xa17e9b21;
const CANVAS_W = 1000;
const CANVAS_H = 700;

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Warm up the JIT, then take the median of N timed trials. */
function timeMs(fn, { warmup = 3, trials = 7 } = {}) {
  for (let i = 0; i < warmup; i++) fn();
  const times = [];
  for (let i = 0; i < trials; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  return median(times);
}

const results = [];
function budget(name, ms, limitMs, note = '') {
  const pass = ms <= limitMs;
  results.push({ name, ms, limitMs, pass });
  const flag = pass ? 'OK  ' : 'MISS';
  console.log(
    `  [${flag}] ${name}: ${ms.toFixed(3)}ms (budget ${limitMs}ms)${note ? ' — ' + note : ''}`,
  );
}

console.log('perf.selfcheck: measuring against #108 target budgets\n');

// ── 1. 20k points, sample + attrs, no fBm ───────────────────────────────
// displacement=0: position sampling + scale/rotate/alpha attribute lerps,
// no field sampling, no asset/color binding (that split — sample vs bind —
// is exactly staged eval's point).
{
  const args = {
    mode: 'random', count: 20000, seed: SEED,
    scale: [0.4, 1.6], rotate: [-180, 180], alpha: [40, 100],
    jitter: 24, density: 100, zTiers: 4, bleed: false,
    canvasW: CANVAS_W, canvasH: CANVAS_H, displacement: 0,
  };
  const soa = computePlacementsSoA(args);
  assert.strictEqual(soa.n, 20000, '20k sample should produce 20k points at density 100');
  for (let i = 0; i < soa.n; i++) {
    assert.ok(Number.isFinite(soa.x[i]) && Number.isFinite(soa.y[i]), 'non-finite position');
  }
  // The columns must agree with the shim exactly, or "SoA is faster" is a
  // claim about a different computation.
  const aos = computePlacements(args);
  assert.strictEqual(aos.length, soa.n);
  for (let i = 0; i < soa.n; i++) {
    assert.strictEqual(aos[i].x, soa.x[i], `shim/column x divergence at ${i}`);
    assert.strictEqual(aos[i].scale, soa.scale[i], `shim/column scale divergence at ${i}`);
  }

  const ms = timeMs(() => computePlacementsSoA(args));
  budget('20k pts, sample+attrs, no fBm', ms, 2, 'SoA fill, fresh buffers each call');

  // Reusing buffers across calls is the ceiling this shape can reach without
  // touching the sampler ABI. Not a budget — it needs a caller that owns a
  // pool, which is step 5's EvalContext.
  const pooled = timeMs(() => computePlacementsSoA(args, soa));
  console.log(`  [info] 20k SoA, buffers reused: ${pooled.toFixed(3)}ms — ceiling without a sampler-ABI change`);
  const shim = timeMs(() => computePlacements(args));
  console.log(`  [info] 20k via computePlacements shim: ${shim.toFixed(3)}ms — cost of materializing 20k objects; deletable once callers read columns`);
}

// ── 2. 8k points + displacement field sample ────────────────────────────
// Still no field texture — displacement calls fBm3D twice per point (dx,
// dy), 3 octaves each, directly in the hot loop. SoA barely moves this one
// (fBm dominates, not allocation), which is the measurement that says step
// 3 has to be the field texture and not more loop tuning.
{
  const args = {
    mode: 'random', count: 8000, seed: SEED,
    scale: [0.4, 1.6], rotate: [-180, 180], alpha: [40, 100],
    jitter: 24, density: 100, zTiers: 4, bleed: false,
    canvasW: CANVAS_W, canvasH: CANVAS_H,
    displacement: 40, noiseFreq: 0.005, noiseSpeed: 0.5,
  };
  const soa = computePlacementsSoA(args);
  assert.strictEqual(soa.n, 8000);
  for (let i = 0; i < soa.n; i++) {
    assert.ok(
      Number.isFinite(soa.x[i]) && Number.isFinite(soa.y[i]),
      'non-finite position after fBm displacement',
    );
  }
  const ms = timeMs(() => computePlacementsSoA(args));
  budget('8k pts + displacement (fBm)', ms, 3, '2x fBm3D(3 octaves) per point, no field texture yet (#108 step 3)');
}

// ── 2b. SoA density rejection + buffer reuse ────────────────────────────
// The SoA footgun: slots past soa.n hold stale rows from whatever ran
// before. Anyone iterating soa.x.length instead of soa.n reads garbage, and
// with a reused buffer that garbage is a *previous composition's* points —
// which would look like a plausible render, not a crash.
{
  const base = {
    mode: 'random', count: 2000, seed: SEED,
    scale: [0.4, 1.6], rotate: [-180, 180], alpha: [40, 100],
    jitter: 24, density: 100, zTiers: 4, bleed: false,
    canvasW: CANVAS_W, canvasH: CANVAS_H, displacement: 0,
  };
  const dense = computePlacementsSoA(base);
  assert.strictEqual(dense.n, 2000);

  // Reuse the dense buffer for a sparse run; n must shrink and the live
  // rows must match a fresh run exactly.
  const sparseArgs = { ...base, density: 40 };
  const reused = computePlacementsSoA(sparseArgs, dense);
  assert.ok(reused.n < 2000, 'density 40 should reject points');
  assert.strictEqual(reused, dense, 'a large-enough out buffer should be reused, not reallocated');

  const fresh = computePlacementsSoA(sparseArgs);
  assert.strictEqual(fresh.n, reused.n, 'reused buffer changed the live count');
  for (let i = 0; i < fresh.n; i++) {
    assert.strictEqual(reused.x[i], fresh.x[i], `stale-row leak at ${i}`);
    assert.strictEqual(reused.index[i], fresh.index[i], `index identity drift at ${i}`);
  }
  // index is the source i, not the slot — that is the whole point of
  // index-stable placement surviving density rejection.
  assert.ok(fresh.index[fresh.n - 1] > fresh.n - 1, 'index should be source i, not slot');
  console.log(`  [ok  ] SoA density rejection + buffer reuse: ${fresh.n}/2000 live rows, index-stable`);
}

// ── 3. Bake 400 x 120 swarm steps ────────────────────────────────────────
// Issue cites ~105ms today for this exact shape.
{
  const opts = {
    seed: SEED,
    count: 400,
    // Spread the real defaults rather than hand-copied literals, so this
    // baseline tracks production values instead of silently going stale
    // if DEFAULT_LAYOUT_PARAMS is tuned later.
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS },
    activeAssets: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    palette: { swatches: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] },
    canvasW: CANVAS_W, canvasH: CANVAS_H,
    steps: 120,
  };
  const out = bakeParticles(opts);
  assert.strictEqual(out.length, 400, 'bake should return the requested particle count');
  const ms = timeMs(() => bakeParticles(opts), { warmup: 1, trials: 5 });
  budget('bake 400x120 swarm steps', ms, 30, 'today: Particle class + spatial hash rebuild per step, issue cites ~105ms');
}

// ── 4. Incremental dirty-C (scale/alpha only) vs full eval ──────────────
// Not measurable yet: today's kernel has no staged eval and no dirty
// flags (work item #2 in the issue) — there is nothing to re-run partially.
// Recorded as N/A rather than faked.
console.log('  [N/A ] incremental dirty-C vs full eval — staged eval not implemented yet (#108 item 2)');

console.log('\nperf.selfcheck: budgets are #108 targets, not current gates (ENFORCE_BUDGET=false).');
console.log(`perf.selfcheck: ${results.filter((r) => r.pass).length}/${results.length} budgets already met.`);

if (ENFORCE_BUDGET) {
  const missed = results.filter((r) => !r.pass);
  assert.strictEqual(missed.length, 0, `budget missed: ${missed.map((r) => r.name).join(', ')}`);
}

console.log('\nperf.selfcheck: OK (correctness gated, budgets informational)');
