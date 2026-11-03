// fieldDirector.selfcheck.mjs — deterministic poet choice and debt.
// #1932 re-pin (cause: the genre gate, Matt's clarification 2026-11-03): the pick now requires
// AFFIRMED type eligibility — silence is the default. The temperature assertions below affirm it
// (they measure the temperature behaviour, as before); the gate itself is asserted at the end.
import {
  choosePoet,
  nextSlowDebt,
  preferredNext,
  POETS,
  TYPE_NATIVE_FAMILIES,
  isTypeNativeFamily,
} from './fieldDirector.js';

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
const a = choosePoet({ intensity: 0.2, slowDebt: 4, rng: rngA, typeEligible: true });
const rngB = makeRng(42);
const b = choosePoet({ intensity: 0.2, slowDebt: 4, rng: rngB, typeEligible: true });
assert(JSON.stringify(a) === JSON.stringify(b), 'seeded choice is identical');
assert(a && (a.poetId === 'greenleaf' || a.poetId === 'teijo'), 'cool leans held');

const hot = choosePoet({ intensity: 0.8, slowDebt: 0, rng: makeRng(99), typeEligible: true });
assert(hot && (hot.poetId === 'rosselli' || hot.poetId === 'gibson'), 'hot leans modular/sparse');

// #1932 — the genre gate: un-affirmed eligibility is silence at ANY temperature.
assert(
  choosePoet({ intensity: 0.8, slowDebt: 0, rng: makeRng(99) }) === null,
  'no eligibility affirmed: silence (hot)',
);
assert(
  choosePoet({ intensity: 0.2, slowDebt: 4, rng: makeRng(42) }) === null,
  'no eligibility affirmed: silence (cool)',
);
assert(
  choosePoet({ intensity: 0.5, slowDebt: 0, rng: makeRng(7), typeEligible: false }) === null,
  'eligibility refused: silence (neutral)',
);
assert(
  TYPE_NATIVE_FAMILIES.has('swiss') && TYPE_NATIVE_FAMILIES.has('bauhaus') && TYPE_NATIVE_FAMILIES.has('japanese'),
  'the type-native set is the ruled membership (swiss, bauhaus, japanese)',
);
assert(
  isTypeNativeFamily('swiss') &&
    !isTypeNativeFamily('grunge') &&
    !isTypeNativeFamily(null) &&
    !isTypeNativeFamily(undefined),
  'family read: native set only, null-safe',
);

const d1 = nextSlowDebt([], 'FULL BURN');
const d2 = nextSlowDebt(d1.history, 'FULL BURN');
assert(d2.debt >= d1.debt, 'slow debt accumulates on hot rooms');

const next = preferredNext('FULL BURN', () => 0);
assert(next === 'THE ROOM' || next === 'THE CLASH', 'transition stays adjacent');

assert(Object.keys(POETS).length === 4, 'four poets');

console.log(`fieldDirector.selfcheck: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
