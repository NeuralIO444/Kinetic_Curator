// whisper.selfcheck.mjs — #1139 PR-2: the five lines ship verbatim, each
// within budget; the beat tracker judges attacks honestly; the trace stays
// silent by default.
import assert from 'node:assert';
import { LINES, say, onWhisper, resetWhisper } from './whisper.js';
import { createBeatTracker, confidentFromPeaks, ATTACK_FLOOR, CONFIDENCE_BAR } from './beatConfidence.mjs';
import { trace } from './queenLean.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

ok('the five lines are verbatim', () => {
  assert.equal(LINES.LOST, "input's gone. i'm still listening.");
  assert.equal(LINES.FOUND, 'there you are.');
  assert.equal(LINES.RAW, 'raw. good.');
  assert.equal(LINES.HEAR, 'i hear you.');
  assert.equal(LINES.DANCE, 'dance.');
  assert.equal(Object.keys(LINES).length, 5, 'exactly five lines');
});

ok('each line fires at most once per page load', () => {
  resetWhisper();
  const heard = [];
  const off = onWhisper((key, line) => heard.push([key, line]));
  assert.equal(say('DANCE'), true, 'first fire speaks');
  assert.equal(say('DANCE'), false, 'second fire is silent');
  assert.deepEqual(heard, [['DANCE', 'dance.']], 'listener heard it once');
  assert.equal(say('NOPE'), false, 'unknown keys stay silent');
  off();
  resetWhisper();
});

ok('beat tracker: two attacks ≥ 0.62 → confident', () => {
  assert.equal(ATTACK_FLOOR, 0.3);
  assert.equal(CONFIDENCE_BAR, 0.62);
  const t = createBeatTracker();
  assert.equal(t.confident, false, 'no attacks yet');
  // two attack shapes: rise past the floor, peak, fall
  for (const peak of [0.7, 0.85]) {
    for (const v of [0.1, 0.35, peak, 0.2]) t.push(v);
  }
  assert.equal(t.confident, true, 'two confident attacks');
  assert.deepEqual(confidentFromPeaks(t.peaks.slice(-2)), true);
  const weak = createBeatTracker();
  for (const v of [0.1, 0.35, 0.4, 0.2, 0.1, 0.35, 0.4, 0.2]) weak.push(v);
  assert.equal(weak.confident, false, 'sub-bar peaks stay unconfident');
  assert.equal(confidentFromPeaks([0.9]), false, 'one attack is not enough');
});

ok('trace is silent by default and never throws', () => {
  // node has no localStorage — trace must stay silent, not crash.
  trace('m1', { bias: 0.06 });
  trace('m2');
});

console.log(`\nwhisper: ${n} checks passed`);
