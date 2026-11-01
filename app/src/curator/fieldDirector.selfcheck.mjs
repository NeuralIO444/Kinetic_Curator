// fieldDirector.selfcheck.mjs — deterministic poet choice and debt.
import { choosePoet, nextSlowDebt, preferredNext, POETS } from './fieldDirector.js';

let pass = 0;
let fail = 0;
const assert = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.error('FAIL', msg);
  }
};

// Seeded RNG that is deterministic
const makeRng = (seed) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

const rngA = makeRng(42);
const a = choosePoet({ intensity: 0.2, slowDebt: 4, rng: rngA });
const rngB = makeRng(42);
const b = choosePoet({ intensity: 0.2, slowDebt: 4, rng: rngB });
assert(JSON.stringify(a) === JSON.stringify(b), 'seeded choice is identical');
assert(a && (a.poetId === 'greenleaf' || a.poetId === 'teijo'), 'cool leans held');

const hot = choosePoet({ intensity: 0.8, slowDebt: 0, rng: makeRng(99) });
assert(hot && (hot.poetId === 'rosselli' || hot.poetId === 'gibson'), 'hot leans modular/sparse');

const d1 = nextSlowDebt([], 'FULL BURN');
const d2 = nextSlowDebt(d1.history, 'FULL BURN');
assert(d2.debt >= d1.debt, 'slow debt accumulates on hot rooms');

const next = preferredNext('FULL BURN', () => 0);
assert(next === 'THE ROOM' || next === 'THE CLASH', 'transition stays adjacent');

assert(Object.keys(POETS).length === 4, 'four poets');

console.log(`fieldDirector.selfcheck: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
