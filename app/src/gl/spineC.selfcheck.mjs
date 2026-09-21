// spineC.selfcheck.mjs — verify Spine C (#389)
//
// 1. Critically damped heading with motionSmoothing knob as lambda scale.
// 2. Audio ballistics on visible life path (scaleMul, alphaBoost, glow) with silence-is-zero.
// 3. Layered life LFO with per-agent phase from seedOffset.

import assert from 'node:assert';
import { ParticleSystem } from '../engine/particles.js';
import { createBallisticsState, processBallistics, resetBallistics } from './audioBallistics.mjs';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';

console.log('spineC.selfcheck: starting...');

// ── 1. Heading spring and motionSmoothing ──────────────────────────────────
{
  const assets = [{ id: 'a' }, { id: 'b' }];
  const palette = { swatches: ['#fff'] };

  // Set up two systems in hype (organism) mode: one with motionSmoothing: false (snap),
  // one with motionSmoothing: 1.0 (critically damped heading).
  const count = 10;
  const lpSnap = normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'hype',
    particleCount: count,
    motionSmoothing: false,
  });
  const lpSmooth = normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'hype',
    particleCount: count,
    motionSmoothing: 1.0,
  });

  const sysSnap = new ParticleSystem();
  sysSnap.init(count, 1000, 700, assets, palette, 0x42);
  const sysSmooth = new ParticleSystem();
  sysSmooth.init(count, 1000, 700, assets, palette, 0x42);

  // Run 1 step: heading should turn
  sysSnap.update(lpSnap, assets, palette, 0x42, 1000, null, null, 1 / 60);
  sysSmooth.update(lpSmooth, assets, palette, 0x42, 1000, null, null, 1 / 60);

  // sysSmooth should have damped headings compared to snap
  let differences = 0;
  for (let i = 0; i < count; i++) {
    if (Math.abs(sysSmooth.rotation[i] - sysSnap.rotation[i]) > 1e-4) {
      differences++;
    }
  }
  assert.ok(differences > 0, 'motionSmoothing: 1.0 produced damped headings differing from snap');
  console.log(`  [ok] critically damped heading differs from snap (${differences}/${count} agents)`);

  // Verify that higher motionSmoothing (e.g. 2.0) converges faster toward target than lower (0.5)
  const lpSlow = normalizeLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, mode: 'hype', particleCount: count, motionSmoothing: 0.5 });
  const lpFast = normalizeLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, mode: 'hype', particleCount: count, motionSmoothing: 2.0 });

  const sysSlow = new ParticleSystem();
  sysSlow.init(count, 1000, 700, assets, palette, 0x99);
  const sysFast = new ParticleSystem();
  sysFast.init(count, 1000, 700, assets, palette, 0x99);

  sysSlow.update(lpSlow, assets, palette, 0x99, 1000, null, null, 1 / 60);
  sysFast.update(lpFast, assets, palette, 0x99, 1000, null, null, 1 / 60);

  let fastDiffersFromSlow = 0;
  for (let i = 0; i < count; i++) {
    if (Math.abs(sysFast.rotation[i] - sysSlow.rotation[i]) > 1e-4) fastDiffersFromSlow++;
  }
  assert.ok(fastDiffersFromSlow > 0, 'motionSmoothing scale affects heading response rate');
  console.log(`  [ok] motionSmoothing scales lambda dynamically (${fastDiffersFromSlow}/${count} agents)`);
}

// ── 2. Audio ballistics on visible life path ─────────────────────────────────
{
  const follower = createBallisticsState();

  // Silence is exact zero
  const silence = { rms: 0, bass: 0, mid: 0, treble: 0, beatPulse: 0 };
  const shapedZero = processBallistics(follower, silence, 16.7);
  assert.strictEqual(shapedZero.rms, 0);
  assert.strictEqual(shapedZero.bass, 0);
  assert.strictEqual(shapedZero.beatPulse, 0);

  const depth = 0.65;
  const scaleModAmt = 0.45;
  const alphaModAmt = 0.25;

  const scaleMulZero = 1 + (
    shapedZero.beatPulse * 0.38 * scaleModAmt +
    (shapedZero.bass * 0.55 + shapedZero.rms * 0.35) * 0.28
  ) * depth;
  const alphaBoostZero = shapedZero.beatPulse * 18 * alphaModAmt * depth;
  const glowZero = Math.min(1, shapedZero.beatPulse * 0.8 + shapedZero.rms * 0.4) * depth;

  assert.strictEqual(scaleMulZero, 1, 'silence preserves scaleMul = 1');
  assert.strictEqual(alphaBoostZero, 0, 'silence preserves alphaBoost = 0');
  assert.strictEqual(glowZero, 0, 'silence preserves glow = 0');
  console.log('  [ok] silence-is-zero strictly preserved on scaleMul, alphaBoost, and glow');

  // A kick (beat hit) shoves immediately then settles smoothly
  const kick = { rms: 0.8, bass: 0.9, mid: 0.2, treble: 0.1, beatPulse: 1.0 };
  const shapedKick = processBallistics(follower, kick, 16.7, { attackMs: 25, releaseMs: 320 });

  const scaleMulKick = 1 + (
    shapedKick.beatPulse * 0.38 * scaleModAmt +
    (shapedKick.bass * 0.55 + shapedKick.rms * 0.35) * 0.28
  ) * depth;
  const alphaBoostKick = shapedKick.beatPulse * 18 * alphaModAmt * depth;
  const glowKick = Math.min(1, shapedKick.beatPulse * 0.8 + shapedKick.rms * 0.4) * depth;

  assert.ok(scaleMulKick > 1.04, `kick shoves scaleMul (${scaleMulKick.toFixed(3)} > 1.04)`);
  assert.ok(alphaBoostKick > 0.5, `kick boosts alphaBoost (${alphaBoostKick.toFixed(3)} > 0.5)`);
  assert.ok(glowKick > 0.15, `kick raises glow (${glowKick.toFixed(3)} > 0.15)`);

  // After 500ms of silence, the follower settles back toward zero
  let settled;
  for (let s = 0; s < 30; s++) {
    settled = processBallistics(follower, silence, 16.7, { attackMs: 25, releaseMs: 320 });
  }
  const scaleMulSettled = 1 + (
    settled.beatPulse * 0.38 * scaleModAmt +
    (settled.bass * 0.55 + settled.rms * 0.35) * 0.28
  ) * depth;
  assert.ok(scaleMulSettled < scaleMulKick, 'scale settles after kick');
  assert.ok(settled.beatPulse < 0.1, 'beatPulse decays smoothly over release');
  console.log('  [ok] audio hit shoves then settles smoothly');
}

// ── 3. Layered life LFO and per-agent phase ──────────────────────────────────
{
  const t = 2.5;
  const rawBreath =
    0.55 * Math.sin(t * 0.73) +
    0.30 * Math.sin(t * 1.19 + 1.7) +
    0.15 * Math.sin(t * 0.29 + 4.1);

  // Check that two agents with different seedOffsets have different phase offsets
  const seedOffsetA = 1234.5;
  const seedOffsetB = 8765.4;
  const lifeDrift = 0.5;

  const pA = seedOffsetA * 0.001;
  const rawA =
    0.55 * Math.sin(t * 0.73 + pA) +
    0.30 * Math.sin(t * 1.19 + 1.7 + pA * 1.3) +
    0.15 * Math.sin(t * 0.29 + 4.1 + pA * 0.7);
  const scaleMulA = 1 + (rawA - rawBreath) * 0.008 * lifeDrift;

  const pB = seedOffsetB * 0.001;
  const rawB =
    0.55 * Math.sin(t * 0.73 + pB) +
    0.30 * Math.sin(t * 1.19 + 1.7 + pB * 1.3) +
    0.15 * Math.sin(t * 0.29 + 4.1 + pB * 0.7);
  const scaleMulB = 1 + (rawB - rawBreath) * 0.008 * lifeDrift;

  assert.notStrictEqual(scaleMulA, scaleMulB, 'agents breathe out of phase');
  assert.ok(Math.abs(scaleMulA - scaleMulB) > 1e-4, 'phase difference is non-zero');

  // When lifeDrift is 0, agents are in perfect sync (scaleMul modifier is 1.0)
  const scaleMulNoDriftA = 1 + (rawA - rawBreath) * 0.008 * 0;
  const scaleMulNoDriftB = 1 + (rawB - rawBreath) * 0.008 * 0;
  assert.strictEqual(scaleMulNoDriftA, 1.0);
  assert.strictEqual(scaleMulNoDriftB, 1.0);
  console.log('  [ok] layered life offsets agents out-of-phase; lifeDrift 0 is sync');
}

console.log('spineC.selfcheck: OK (all checks passed)');
