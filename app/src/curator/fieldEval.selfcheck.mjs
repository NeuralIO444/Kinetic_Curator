// fieldEval.selfcheck.mjs — 1000-step distribution assertions.
import { evalLoop, step, INITIAL_STATE } from './fieldEval.js';

let pass = 0;
let fail = 0;
const assert = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.error('FAIL', msg);
  }
};

const cool = evalLoop(42, 1000, 'steadyCool');
assert(cool.coolBias > 0.6, `cool bias ${cool.coolBias} > 0.6`);
assert(cool.hotBias < 0.3, `cool hotBias ${cool.hotBias} < 0.3`);

const hot = evalLoop(42, 1000, 'steadyHot');
assert(hot.hotBias > 0.5, `hot bias ${hot.hotBias} > 0.5`);

const streak = evalLoop(7, 30, 'hotStreak');
assert(streak.finalDebt >= 3, `hot streak forces debt ${streak.finalDebt}`);

// determinism
const a = evalLoop(123, 200, 'steadyCool');
const b = evalLoop(123, 200, 'steadyCool');
assert(JSON.stringify(a) === JSON.stringify(b), 'evalLoop deterministic');

// pure step identity
const s1 = step(INITIAL_STATE, { intensity: 0.2, verdict: 'AGREEMENT' }, () => 0.1);
const s2 = step(INITIAL_STATE, { intensity: 0.2, verdict: 'AGREEMENT' }, () => 0.1);
assert(JSON.stringify(s1) === JSON.stringify(s2), 'step pure');

console.log(`fieldEval.selfcheck: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
