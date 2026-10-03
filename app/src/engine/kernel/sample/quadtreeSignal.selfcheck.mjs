// node src/engine/kernel/sample/quadtreeSignal.selfcheck.mjs
// #721 slice 2 — interestingness acceptance: null-audio → field-only,
// all-zero bands relax (never empty/frozen), blend extremes grow visibly
// different trees, and the ~1.5s release decays monotonically.

import assert from 'node:assert';
import { buildQuadtree, clearQuadtreeCache, QUAD_LEAF_BUDGET } from './quadtree.js';
import {
  QUAD_BAND_ORDER,
  audioTermAt,
  fieldTermAt,
  makeQuadtreeField,
  blendInteresting,
  createBandSmoother,
  makeQuadtreeInterestingness,
  quantizeBands,
} from './quadtreeSignal.js';

const SEED = 99;
const bandsOf = (v) => Object.fromEntries(QUAD_BAND_ORDER.map((k) => [k, v]));
// Kick-heavy: sub hot, air quiet. Bright: the reverse.
const KICK = { sub: 0.9, bass: 0.7, mud: 0.4, mids: 0.2, edge: 0.1, pres: 0.05, air: 0.02 };
const BRIGHT = { sub: 0.02, bass: 0.05, mud: 0.1, edge: 0.4, pres: 0.7, air: 0.9, mids: 0.2 };

// ── spectral geography: sub at the bottom, air at the top ─────────────────
{
  const bottom = audioTermAt(KICK, 0.5, 1.0);
  const top = audioTermAt(KICK, 0.5, 0.0);
  assert.ok(bottom > top, `kick should read hotter at the floor (${bottom} vs ${top})`);
  assert.ok(bottom > 0.5, 'floor should approach the sub level');
  const bTop = audioTermAt(BRIGHT, 0.5, 0.0);
  const bBottom = audioTermAt(BRIGHT, 0.5, 1.0);
  assert.ok(bTop > bBottom, 'bright mix should read hotter at the ceiling');
  assert.strictEqual(audioTermAt(null, 0.5, 0.5), 0, 'null bands → 0');
  assert.strictEqual(audioTermAt(bandsOf(0), 0.5, 0.5), 0, 'all-zero bands → 0 (hiss guard)');
  // Seamless: neighboring bands interpolate, no hard step at boundaries.
  const mid1 = audioTermAt(KICK, 0.5, 0.49);
  const mid2 = audioTermAt(KICK, 0.5, 0.51);
  assert.ok(Math.abs(mid1 - mid2) < 0.15, 'no hard seams between bands');
}

// ── field term: ridges read hot, flats read cold, bounded ─────────────────
{
  const field = makeQuadtreeField(SEED, null, 0);
  let min = 1, max = 0, sum = 0;
  const N = 40;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const v = fieldTermAt(field, (i + 0.5) / N, (j + 0.5) / N);
      assert.ok(v >= 0 && v <= 1, `field term out of bounds: ${v}`);
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
  }
  assert.ok(max > 0.15, `field should have real ridges (max ${max})`);
  assert.ok(min < 0.05, `field should have real flats (min ${min})`);
  const mean = sum / (N * N);
  assert.ok(mean > 0.01 && mean < 0.5, `sane distribution (mean ${mean})`);
  // Drift: a different z is a different field, still valid.
  const field2 = makeQuadtreeField(SEED, null, 7);
  const v2 = fieldTermAt(field2, 0.31, 0.47);
  assert.ok(v2 >= 0 && v2 <= 1);
}

// ── blend: zero-guard, normalization ───────────────────────────────────────
{
  assert.strictEqual(blendInteresting(0.8, 0.2, 0, 0), 0.2, 'both knobs at 0 → field-only');
  assert.strictEqual(blendInteresting(0.8, 0.2, 1, 0), 0.8, 'audio-only');
  assert.strictEqual(blendInteresting(0.8, 0.2, 0, 1), 0.2, 'field-only');
  assert.strictEqual(blendInteresting(0.8, 0.2, 0.5, 0.5), 0.5, 'even mix');
  assert.ok(blendInteresting(0.9, 0.9, -1, -2) >= 0, 'negative knobs clamp, never NaN');
}

// ── null-audio → field-only tree (never empty, never frozen) ───────────────
{
  clearQuadtreeCache();
  const fieldOnly = buildQuadtree({
    interestingness: makeQuadtreeInterestingness({ seed: SEED, quadAudio: 0.5, quadField: 0.5, bands: null }),
    seed: SEED, maxDepth: 5,
  });
  assert.ok(fieldOnly.length > 1, 'field-only signal must still subdivide (never empty)');
  assert.ok(fieldOnly.length <= QUAD_LEAF_BUDGET);
  const zeroBands = buildQuadtree({
    interestingness: makeQuadtreeInterestingness({ seed: SEED, quadAudio: 0.5, quadField: 0.5, bands: bandsOf(0) }),
    seed: SEED, maxDepth: 5, signalKey: 'zero',
  });
  assert.deepStrictEqual(
    zeroBands.map((L) => [L.x, L.y, L.depth]),
    fieldOnly.map((L) => [L.x, L.y, L.depth]),
    'all-zero bands relax to exactly the field-only tree',
  );
}

// ── blend extremes grow visibly different trees from the same seed ─────────
{
  clearQuadtreeCache();
  const audioLed = buildQuadtree({
    interestingness: makeQuadtreeInterestingness({ seed: SEED, quadAudio: 1, quadField: 0, bands: KICK }),
    seed: SEED, maxDepth: 5, signalKey: 'audio-led',
  });
  const fieldLed = buildQuadtree({
    interestingness: makeQuadtreeInterestingness({ seed: SEED, quadAudio: 0, quadField: 1, bands: KICK }),
    seed: SEED, maxDepth: 5, signalKey: 'field-led',
  });
  const sig = (leaves) => leaves.map((L) => `${L.x.toFixed(4)},${L.y.toFixed(4)},${L.depth}`).join(';');
  assert.ok(sig(audioLed) !== sig(fieldLed), 'blend extremes must grow different trees');
  // Audio-led with kick: deeper leaves cluster toward the floor (sub).
  const deepAudio = audioLed.filter((L) => L.depth >= 4);
  const meanY = deepAudio.reduce((s, L) => s + L.y + L.h / 2, 0) / deepAudio.length;
  assert.ok(meanY > 0.55, `kick-driven depth should pool at the floor (meanY ${meanY})`);
}

// ── release: monotonic decay, ~1.5s, no pops ───────────────────────────────
{
  const sm = createBandSmoother();
  // Saturate the attack first (several ticks at full level).
  for (let t = 0; t <= 500; t += 100) sm.update(KICK, t);
  const start = sm.peek().sub;
  assert.ok(start > 0.8, `attack should saturate near the live level (got ${start})`);
  const decay = [];
  for (let t = 600; t <= 5600; t += 100) {
    decay.push(sm.update(null, t).sub);
  }
  for (let i = 1; i < decay.length; i++) {
    assert.ok(decay[i] <= decay[i - 1] + 1e-12, `release must be monotonic (pop at step ${i})`);
  }
  assert.ok(decay[decay.length - 1] < 0.05, 'release reaches ~zero within ~5s');
  // ~1.5s time constant: after 1.5s the level should be near 1/e of start.
  const ratio = decay[15] / decay[0]; // t=2100ms vs t=600ms → 1.5s of decay
  assert.ok(ratio > 0.2 && ratio < 0.55, `~1.5s release tau (ratio ${ratio})`);
  // Attack is fast: a rise tracks within a few ticks.
  sm.reset();
  sm.update(bandsOf(0), 0);
  const hot = sm.update(KICK, 300);
  assert.ok(hot.sub > 0.5, 'attack reaches hot levels quickly');
}

// ── quantize: coarse enough to not rebuild on noise ────────────────────────
{
  assert.strictEqual(quantizeBands(null), 'off');
  const a = quantizeBands(KICK);
  const b = quantizeBands({ ...KICK, sub: KICK.sub + 0.005 });
  assert.strictEqual(a, b, 'sub-quantum wobble must not change the key');
  const c = quantizeBands({ ...KICK, sub: 0.1 });
  assert.ok(c !== a, 'real changes must change the key');
}

console.log('quadtreeSignal.selfcheck: OK');
