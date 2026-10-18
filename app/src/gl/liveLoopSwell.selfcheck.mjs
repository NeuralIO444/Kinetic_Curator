// liveLoopSwell.selfcheck.mjs — audit fix 5 (#1680): the #268 SWELL
// envelope runs on loop time, not the wall clock.
//
// liveLoop needs a real GL context, so — in this module's established
// idiom — the envelope math is a pure exported helper (swellProgress)
// and this suite pins its behaviour with performance.now POISONED:
// any wall-clock read in the envelope path throws. Source assertions
// pin the wiring (the stamp and the progress derivation), aimed at the
// defect's exact pre-fix lines:
//   swellAccum:  swellStart = performance.now()
//   envelope:    (performance.now() - swellStart) / 2000
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

performance.now = () => { throw new Error('the swell read the wall clock'); };

const src = readFileSync(new URL('./liveLoop.mjs', import.meta.url), 'utf8');
assert.ok(!src.includes('swellStart = performance.now'),
  'swellAccum must stamp loop time, not performance.now()');
assert.ok(!src.includes('(performance.now() - swellStart)'),
  'the envelope must derive progress from loop time, not performance.now()');
assert.ok(src.includes('swellProgress(loopTimeMs, swellStart)'),
  'the envelope must be wired to the pure helper with loop time');

const { swellProgress, SWELL_DURATION_MS } = await import('./liveLoop.mjs');
assert.strictEqual(typeof swellProgress, 'function', 'liveLoop must export swellProgress');
assert.strictEqual(SWELL_DURATION_MS, 2000, 'the swell lasts 2000 ms of loop time, as #268 designed');

// No gesture in flight: silent at any loop time.
for (const t of [0, 1, 5000, 1e9]) {
  assert.strictEqual(swellProgress(t, null), 0, `no swell in flight at t=${t}`);
}

// The envelope, driven purely by loop-time arguments (wall clock poisoned).
const S = 1000; // gesture stamped at loop time 1000
assert.strictEqual(swellProgress(S, S), 0, 'envelope starts at 0');
assert.strictEqual(swellProgress(S + 1000, S), 1, 'envelope peaks at the midpoint');
assert.strictEqual(swellProgress(S + 2000, S), 0, 'envelope completes at 2000 ms');
assert.strictEqual(swellProgress(S + 5000, S), 0, 'envelope stays complete');
const quarter = swellProgress(S + 500, S);
assert.ok(Math.abs(quarter - Math.SQRT1_2) < 1e-9, `quarter point is sin(pi/4), got ${quarter}`);
assert.ok(Math.abs(swellProgress(S + 1500, S) - quarter) < 1e-9, 'rise and fall are symmetric');
assert.ok(swellProgress(S + 250, S) < quarter, 'envelope rises monotonically to the midpoint');

console.log('liveLoopSwell.selfcheck: OK — the swell breathes on loop time');
