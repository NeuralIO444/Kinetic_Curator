// governorCuts.selfcheck.mjs — #103 Track A: GPU-implied frame rate feeding
// the governor's sustain windows. Under vsync the rAF cadence lies; the
// governor must act on the worse of the two rates.
import assert from 'node:assert';
import { gpuImpliedFps, effectiveGovernorFps } from './governorCuts.js';

// Absent timing → Infinity → governor reduces exactly to the rAF rate.
assert.strictEqual(gpuImpliedFps(undefined), Infinity);
assert.strictEqual(gpuImpliedFps(null), Infinity);
assert.strictEqual(gpuImpliedFps({}), Infinity);
assert.strictEqual(gpuImpliedFps({ gpuFrame: 0 }), Infinity);
assert.strictEqual(effectiveGovernorFps(60, undefined), 60);
assert.strictEqual(effectiveGovernorFps(30, {}), 30);

// GPU-bound while rAF reads 60: 40ms GPU frame → 25fps implied → the
// governor sees 25, not 60 (trips the low-FPS sustain windows).
assert.strictEqual(gpuImpliedFps({ gpuFrame: 40 }), 25);
assert.strictEqual(effectiveGovernorFps(60, { gpuFrame: 40 }), 25);

// GPU-bound + rAF-low: the worse of the two wins.
assert.strictEqual(effectiveGovernorFps(20, { gpuFrame: 40 }), 20);

// Healthy GPU (16.6ms → 60fps) with rAF 60: no behaviour change.
assert.strictEqual(effectiveGovernorFps(60, { gpuFrame: 16.6 }) > 59.9, true);

// Garbage stage values never poison the governor.
assert.strictEqual(effectiveGovernorFps(60, { gpuFrame: 'hot' }), 60);
assert.strictEqual(effectiveGovernorFps(60, { gpuFrame: NaN }), 60);
assert.strictEqual(effectiveGovernorFps(60, { gpuFrame: -5 }), 60);

console.log('[selfcheck] governorCuts (#103 GPU-implied FPS): 12 cases passed');
