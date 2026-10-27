// node src/hooks/usePhraseLoop.selfcheck.mjs
//
// #458 — freeze-matrix guard: every auto-trigger (TIME evolve, AUDIO
// beats, METRO phrase ticks) must hold during slowRender/batchPaused,
// the same way. TIME's gate is inline in App.jsx (a component, not a
// pure function, so it's not imported here); AUDIO's gate is
// beatArbiter.js's routeBeat().gated, already covered by
// beatArbiter.selfcheck.mjs. This pins METRO's gate (metroTickGated,
// extracted from usePhraseLoop specifically so it's unit-testable
// without a React renderer) against the identical semantics.
import assert from 'node:assert/strict';
import { metroTickGated } from './usePhraseLoop.js';
import { routeBeat } from '../state/beatArbiter.js';

const armed = { phraseEnabled: true, phraseClock: 'audio', audioEnabled: true, evolveMode: true, evolveSource: 'beat' };

for (const slowRender of [false, true]) {
  for (const batchPaused of [false, true]) {
    const metro = metroTickGated({ slowRender, batchPaused });
    const audio = routeBeat({ ...armed, slowRender, batchPaused }).gated;
    assert.strictEqual(metro, audio,
      `metroTickGated(slowRender=${slowRender}, batchPaused=${batchPaused}) must agree with AUDIO's gate (routeBeat().gated) -- got metro=${metro}, audio=${audio}`);
  }
}

// Un-gated (both false): metro ticks are allowed.
assert.strictEqual(metroTickGated({ slowRender: false, batchPaused: false }), true, 'no freeze active -> ticks allowed');
// Either freeze source alone must hold it -- this is the exact row #458
// reports as missing before the fix (a fresh clone of this test against
// the pre-fix usePhraseLoop.js, which had no metroTickGated export at
// all, would fail to even import).
assert.strictEqual(metroTickGated({ slowRender: true, batchPaused: false }), false, 'slowRender alone must hold METRO');
assert.strictEqual(metroTickGated({ slowRender: false, batchPaused: true }), false, 'batchPaused alone must hold METRO');
assert.strictEqual(metroTickGated({ slowRender: true, batchPaused: true }), false, 'both must hold METRO');

console.log('usePhraseLoop.selfcheck: OK (#458 METRO freeze gate matches AUDIO\'s)');
