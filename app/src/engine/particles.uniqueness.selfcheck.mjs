// node src/engine/particles.uniqueness.selfcheck.mjs
//
// #558 — per-node uniqueness (Always-Alive Protocol rule 4): no two nodes
// in lockstep unison.
//
// At instantiation the shared integrator assigns every agent, from seeded
// hash channels only (never wall-clock, never the load-bearing placement
// stream):
//   phaseOffset — static phase offset in [0,1)
//   driftMul    — fractional multiplier on lifeDrift, [0.8, 1.2)
//   speedMul    — fractional multiplier on noiseSpeed, [0.8, 1.2)
//   noiseSeed   — per-agent noise-domain seed, [0, 10)
//
// This suite proves two things:
//   1. SIBLING DIVERGENCE is statistical, not boolean: the mean pairwise
//      circular phase distance over N nodes sits above a threshold far
//      from lockstep (0) and near the uniform-random expectation (0.25).
//      "Not all equal" passing on a single-bit difference is exactly what
//      rule 4 is trying to kill.
//   2. DETERMINISM: the same seed reproduces the identical uniqueness
//      channels bit-for-bit — reruns reproduce exactly. (The six
//      load-bearing placement draws are untouched, so legacy seeds still
//      reproduce bit-identical positions — guarded independently by
//      particles.selfcheck.mjs's exact agreement with the reference engine.)
//
// Evaluation of these channels vs loopTimeMs is #806's scope. This issue
// is instantiation/init only: no behaviour/force changes.

import assert from 'node:assert';
import { ParticleSystem } from './particles.js';

const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] };
const SEED = 0x558;
const N = 96;

function freshSystem(seed, n = N) {
  const sys = new ParticleSystem();
  sys.init(n, 1000, 700, assets, palette, seed);
  return sys;
}

/** Mean pairwise circular distance for values in [0,1). Uniform random → 0.25. */
function meanPairwiseCircular(vals) {
  const n = vals.length;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.abs(vals[i] - vals[j]) % 1;
      sum += Math.min(d, 1 - d);
      pairs++;
    }
  }
  return sum / pairs;
}

/** Mean pairwise absolute distance. Uniform [0,1) → 1/3. */
function meanPairwiseAbs(vals) {
  const n = vals.length;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      sum += Math.abs(vals[i] - vals[j]);
      pairs++;
    }
  }
  return sum / pairs;
}

const sys = freshSystem(SEED);
const phaseOffset = Array.from(sys.phaseOffset.slice(0, N));
const driftMul = Array.from(sys.driftMul.slice(0, N));
const speedMul = Array.from(sys.speedMul.slice(0, N));
const noiseSeed = Array.from(sys.noiseSeed.slice(0, N));

// ── 1. Statistical sibling divergence ──────────────────────────────────
{
  const d = meanPairwiseCircular(phaseOffset);
  assert.ok(
    d > 0.18,
    `#558: mean pairwise phase distance ${d.toFixed(4)} is too close to lockstep — ` +
    'siblings must diverge statistically, not by a single bit',
  );
  console.log(`[ok] phase offsets diverge: mean pairwise circular distance ${d.toFixed(4)} (uniform ≈ 0.25)`);
}
{
  for (const [name, vals] of [['driftMul', driftMul], ['speedMul', speedMul]]) {
    assert.ok(vals.every((v) => v >= 0.8 && v < 1.2), `#558: ${name} out of [0.8, 1.2)`);
    // Uniform [0.8,1.2) → mean pairwise |diff| ≈ 0.133. Threshold sits
    // far above lockstep (0) with wide margin for hash clumping.
    const d = meanPairwiseAbs(vals);
    assert.ok(d > 0.06, `#558: ${name} mean pairwise distance ${d.toFixed(4)} — multipliers in lockstep`);
    console.log(`[ok] ${name} in [0.8, 1.2), mean pairwise distance ${d.toFixed(4)} (uniform ≈ 0.133)`);
  }
}
{
  // Uniform [0,10) → mean pairwise |diff| ≈ 3.33.
  const d = meanPairwiseAbs(noiseSeed);
  assert.ok(d > 1.5, `#558: noiseSeed mean pairwise distance ${d.toFixed(4)} — noise seeds in lockstep`);
  console.log(`[ok] noise seeds diverge: mean pairwise distance ${d.toFixed(4)} (uniform ≈ 3.33)`);
}

// ── 2. Determinism: same seed → identical channels, bit-for-bit ─────────
{
  const again = freshSystem(SEED);
  for (const [name, a, b] of [
    ['phaseOffset', sys.phaseOffset, again.phaseOffset],
    ['driftMul', sys.driftMul, again.driftMul],
    ['speedMul', sys.speedMul, again.speedMul],
    ['noiseSeed', sys.noiseSeed, again.noiseSeed],
    ['x', sys.x, again.x],
    ['y', sys.y, again.y],
  ]) {
    for (let i = 0; i < N; i++) {
      assert.ok(
        Object.is(a[i], b[i]),
        `#558: ${name}[${i}] not reproducible across reruns (${a[i]} vs ${b[i]})`,
      );
    }
  }
  console.log('[ok] same seed reproduces identical uniqueness channels and positions bit-for-bit');
}

// ── 3. Cross-seed sanity: a different seed rolls different channels ──────
{
  const other = freshSystem(0x559);
  let diffs = 0;
  for (let i = 0; i < N; i++) if (sys.phaseOffset[i] !== other.phaseOffset[i]) diffs++;
  assert.ok(diffs === N, '#558: different seed produced identical phase offsets');
  console.log('[ok] different seed → different uniqueness channels');
}

console.log('particles.uniqueness.selfcheck OK');
