// node src/engine/perf.selfcheck.mjs
//
// Kernel v2 (#108) baseline + regression gate. "Measure first... rewrite is
// a response to a missed budget, not a vibe" — this file is that measurement.
//
// STATUS: pre-SoA baseline. The budgets below are #108's target contract for
// the finished SoA + staged-eval engine, not what today's array-of-objects
// kernel is expected to hit. Correctness assertions (below) are real gates —
// they fail the build. Budget numbers are measured and printed on every run
// so the trend is visible in CI logs, but only THROW once ENFORCE_BUDGET is
// flipped to true, which should happen in the PR that actually lands SoA.
// Flipping it before that would fail every CI run on work not yet done.
const ENFORCE_BUDGET = false;

import assert from 'node:assert';
import { computePlacements } from './placement.js';
import { bakeParticles } from './kernel/bake/index.js';

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
// Maps to computePlacements with displacement=0: position sampling +
// scale/rotate/alpha attribute lerps, no field sampling, no asset/color
// binding (that split — sample vs bind — is exactly staged eval's point).
{
  const args = {
    mode: 'random', count: 20000, seed: SEED,
    scale: [0.4, 1.6], rotate: [-180, 180], alpha: [40, 100],
    jitter: 24, density: 100, zTiers: 4, bleed: false,
    canvasW: CANVAS_W, canvasH: CANVAS_H, displacement: 0,
  };
  const out = computePlacements(args);
  assert.strictEqual(out.length, 20000, '20k sample should produce 20k points at density 100');
  for (const p of out) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'non-finite position');
  }
  const ms = timeMs(() => computePlacements(args));
  budget('20k pts, sample+attrs, no fBm', ms, 2, 'today: AoS push + per-point object literal + per-index RNG closure');
}

// ── 2. 8k points + displacement field sample ────────────────────────────
// Today there is no field texture — displacement calls fBm3D twice per
// point (dx, dy), 3 octaves each, directly in the hot loop.
{
  const args = {
    mode: 'random', count: 8000, seed: SEED,
    scale: [0.4, 1.6], rotate: [-180, 180], alpha: [40, 100],
    jitter: 24, density: 100, zTiers: 4, bleed: false,
    canvasW: CANVAS_W, canvasH: CANVAS_H,
    displacement: 40, noiseFreq: 0.005, noiseSpeed: 0.5,
  };
  const out = computePlacements(args);
  assert.strictEqual(out.length, 8000);
  const ms = timeMs(() => computePlacements(args));
  budget('8k pts + displacement (fBm)', ms, 3, 'today: 2x fBm3D(3 octaves) per point, no field texture yet');
}

// ── 3. Bake 400 x 120 swarm steps ────────────────────────────────────────
// Issue cites ~105ms today for this exact shape.
{
  const opts = {
    seed: SEED,
    count: 400,
    layoutParams: {
      noiseFreq: 0.005, noiseSpeed: 0.5, swarmCohesion: 1.5,
      gravityWells: 1.0, damping: 0.95, scale: [0.4, 1.6], alpha: [40, 100],
      particleCount: 400,
    },
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
