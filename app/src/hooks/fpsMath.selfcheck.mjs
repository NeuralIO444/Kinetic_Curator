// fpsMath.selfcheck.mjs — audit standards, hooks tests slice 1 (#1686).
// Characterization pins for useFpsMeter's pure core, hand-derived from
// the hook's inline formulas BEFORE extraction:
//   fps = round1(frames / elapsedMs * 1000)
//   stage snapshot = round2(total / n) per stage (0 when n = 0), drained
//   frame stats = { avg: round2(mean), worst: round2(max) } over deltas
import assert from 'node:assert';
import { fpsFromCount, frameStats, drainStageAverages } from './fpsMath.mjs';

assert.strictEqual(fpsFromCount(60, 1000), 60, '60 frames in 1000 ms is 60 fps');
assert.strictEqual(fpsFromCount(30, 500), 60, '30 frames in 500 ms is 60 fps');
assert.strictEqual(fpsFromCount(17, 283), 60.1, 'fps rounds to one decimal');
assert.strictEqual(fpsFromCount(0, 250), 0, 'no frames, no fps');

assert.deepStrictEqual(frameStats([16.7, 16.7, 33.4]), { avg: 22.27, worst: 33.4 },
  'avg is the rounded mean, worst is the rounded max');
assert.deepStrictEqual(frameStats([100]), { avg: 100, worst: 100 }, 'single sample');
assert.deepStrictEqual(frameStats([]), { avg: 0, worst: 0 }, 'empty window reads 0/0, never NaN');

{
  const samples = new Map([
    ['kernel', { total: 10, n: 4 }],
    ['gl', { total: 0, n: 0 }],
    ['bake', { total: 7.777, n: 3 }],
  ]);
  const snap = drainStageAverages(samples);
  assert.deepStrictEqual(snap, { kernel: 2.5, gl: 0, bake: 2.59 },
    'snapshot holds per-stage rounded averages; an unsampled stage reads 0');
  assert.deepStrictEqual(samples.get('kernel'), { total: 0, n: 0 }, 'draining resets the accumulator');
  assert.deepStrictEqual(drainStageAverages(samples), { kernel: 0, gl: 0, bake: 0 },
    'a second drain with no new samples reads all zeros');
}

console.log('fpsMath.selfcheck: OK — fps pure core pinned');
