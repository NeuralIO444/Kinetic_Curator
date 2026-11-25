// fpsMath.selfcheck.mjs — audit standards, hooks tests slice 1 (#1686).
// Characterization pins for useFpsMeter's pure core, hand-derived from
// the hook's inline formulas BEFORE extraction:
//   fps = round1(frames / elapsedMs * 1000)
//   stage snapshot = round2(total / n) per stage (0 when n = 0), drained
//   frame stats = { avg: round2(mean), worst: round2(max) } over deltas
import assert from 'node:assert';
import { fpsFromCount, frameStats, drainStageAverages, estimateRefreshFps } from './fpsMath.mjs';

assert.strictEqual(fpsFromCount(60, 1000), 60, '60 frames in 1000 ms is 60 fps');
assert.strictEqual(fpsFromCount(30, 500), 60, '30 frames in 500 ms is 60 fps');
assert.strictEqual(fpsFromCount(17, 283), 60.1, 'fps rounds to one decimal');
assert.strictEqual(fpsFromCount(0, 250), 0, 'no frames, no fps');

assert.deepStrictEqual(
  frameStats([16.7, 16.7, 33.4]),
  { avg: 22.27, worst: 33.4 },
  'avg is the rounded mean, worst is the rounded max',
);
assert.deepStrictEqual(frameStats([100]), { avg: 100, worst: 100 }, 'single sample');
assert.deepStrictEqual(frameStats([]), { avg: 0, worst: 0 }, 'empty window reads 0/0, never NaN');

{
  const samples = new Map([
    ['kernel', { total: 10, n: 4 }],
    ['gl', { total: 0, n: 0 }],
    ['bake', { total: 7.777, n: 3 }],
  ]);
  const snap = drainStageAverages(samples);
  assert.deepStrictEqual(
    snap,
    { kernel: 2.5, gl: 0, bake: 2.59 },
    'snapshot holds per-stage rounded averages; an unsampled stage reads 0',
  );
  assert.deepStrictEqual(samples.get('kernel'), { total: 0, n: 0 }, 'draining resets the accumulator');
  assert.deepStrictEqual(
    drainStageAverages(samples),
    { kernel: 0, gl: 0, bake: 0 },
    'a second drain with no new samples reads all zeros',
  );
}

// ── estimateRefreshFps (#2482) ──────────────────────────────────────
// The cadence lives at the bottom of the delta distribution: load
// stretches deltas to multiples of the refresh interval, never below
// it, and the rate is floored so jitter can only understate it.
{
  const flat = (ms, n) => Array.from({ length: n }, () => ms);
  // Too little evidence is no measurement, never an invented number.
  assert.strictEqual(estimateRefreshFps([]), null, 'empty window → null');
  assert.strictEqual(estimateRefreshFps(flat(16.6, 10)), null, 'below the sample floor → null');
  assert.strictEqual(estimateRefreshFps([NaN, -1, 0, Infinity]), null, 'no usable delta → null');
  assert.strictEqual(estimateRefreshFps(null), null, 'non-array → null');
  // Clean cadences read their rate (16.6ms ≈ a jittered 60Hz interval).
  assert.strictEqual(estimateRefreshFps(flat(16.6, 120)), 60, '60Hz cadence reads 60');
  assert.strictEqual(estimateRefreshFps(flat(8.3, 120)), 120, '120Hz cadence reads 120');
  assert.strictEqual(estimateRefreshFps(flat(6.9, 120)), 144, '144Hz reads 144 — the estimator itself is uncapped');
  // A mathematically perfect 60.00Hz cadence floors to 59: the floor is
  // the conservative side by design (an understated max stays reachable;
  // an overstated one would reopen the trap).
  assert.strictEqual(estimateRefreshFps(flat(1000 / 60, 120)), 59, 'perfect 60.00Hz floors to 59, never overstates');
  // Load does not drag the estimate: half the window at double interval
  // still reads the cadence at the distribution's bottom.
  const loaded = [...flat(16.6, 60), ...flat(33.2, 60)];
  assert.strictEqual(estimateRefreshFps(loaded), 60, 'stretched frames do not lower the cadence read');
  // A fully saturated window honestly reads its presented rate.
  assert.strictEqual(estimateRefreshFps(flat(33.3, 120)), 30, 'saturated window reads its presented 30');
}

console.log('fpsMath.selfcheck: OK — fps pure core pinned');
