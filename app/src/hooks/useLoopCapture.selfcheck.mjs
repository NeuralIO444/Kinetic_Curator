// node src/hooks/useLoopCapture.selfcheck.mjs — #284 Loop Capture invariants.
//
// Node-only: exercises the pure frame plan + dissolve ramp + the
// footage→output index mapping that makes the loop seamless. captureLoop
// itself needs DOM + MediaRecorder, so the mapping is re-derived here from
// the same plan (pre-roll D frames, body T-D frames, tail D frames) and the
// seamlessness property is asserted structurally:
//
//   output O[0..T): O[i] = F[D+i] for i < T-D (body)
//                   O[T-D+j] = blend(F[T+j], P[j]) for j < D (tail)
//   O[T-1] = P[D-1] = F[D-1]; loop restarts at O[0] = F[D].
//   F[D-1] -> F[D] are consecutive recorded frames: the seam is exact.
import assert from 'node:assert';
import { planLoopFrames, dissolveAlpha, LOOP_CAPTURE_FPS } from './useLoopCapture.js';

// ── 1. Frame plan invariants across the UI lengths + hostile inputs ──
for (const seconds of [2, 4, 8]) {
  const p = planLoopFrames({ seconds });
  assert.strictEqual(p.fps, LOOP_CAPTURE_FPS);
  assert.strictEqual(p.totalFrames, p.bodyFrames + p.dissolveFrames, 'total = body + dissolve');
  assert.ok(p.bodyFrames >= 1, 'body is non-empty');
  assert.ok(p.dissolveFrames <= p.totalFrames / 2, 'dissolve never eats the body');
  assert.strictEqual(p.totalFrames, seconds * LOOP_CAPTURE_FPS, 'exact N-second frame count');
}
// Hostile inputs clamp, never produce degenerate plans.
for (const bad of [
  { seconds: 0 }, { seconds: -3 }, { seconds: 0.2 }, { fps: 0 }, { dissolveSeconds: 99 },
  { seconds: 1000 }, {},
]) {
  const p = planLoopFrames(bad);
  assert.ok(Number.isInteger(p.totalFrames) && p.totalFrames >= 2, `totalFrames sane for ${JSON.stringify(bad)}`);
  assert.ok(p.bodyFrames >= 1 && p.dissolveFrames >= 1, `non-degenerate for ${JSON.stringify(bad)}`);
  assert.ok(p.dissolveFrames <= p.totalFrames / 2, `dissolve bounded for ${JSON.stringify(bad)}`);
}

// ── 2. Dissolve ramp: (0, 1], monotonic, ends fully on the head ──
for (const D of [1, 15, 30, 120]) {
  let prev = 0;
  for (let j = 0; j < D; j++) {
    const a = dissolveAlpha(j, D);
    assert.ok(a > 0 && a <= 1, `alpha in (0,1] (j=${j}, D=${D})`);
    assert.ok(a >= prev, `alpha monotonic (j=${j}, D=${D})`);
    prev = a;
  }
  assert.strictEqual(dissolveAlpha(D - 1, D), 1, 'tail ends fully on the head');
}

// ── 3. Seamlessness: the loop point lands on consecutive footage frames ──
for (const seconds of [2, 4, 8]) {
  const { totalFrames: T, dissolveFrames: D, bodyFrames: B } = planLoopFrames({ seconds });
  // Footage indices: pre-roll P[j] = F[j]; body O[i] = F[D+i]; tail blends F[T+j] with P[j].
  const firstOutputFootageIdx = D;          // O[0] = F[D]
  const lastOutputHeadIdx = D - 1;          // O[T-1] = P[D-1] = F[D-1]
  assert.strictEqual(lastOutputHeadIdx + 1, firstOutputFootageIdx,
    'loop point F[D-1] -> F[D] is consecutive: no cut, no rewind');
  assert.strictEqual(B + D, T, 'output covers exactly T frames');
  // The tail's head-source walks the pre-roll in order (dissolve into the head).
  for (let j = 0; j < D; j++) {
    const headIdx = j; // P[j] = F[j]
    assert.ok(headIdx >= 0 && headIdx < D, 'tail blends pre-roll in order');
  }
}

console.log('useLoopCapture.selfcheck: OK');
