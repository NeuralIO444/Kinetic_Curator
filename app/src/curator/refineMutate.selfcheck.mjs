// node src/curator/refineMutate.selfcheck.mjs
// #1144 — refine mutates around what landed. Pins: the ranges mirror the dice, mutations stay in range and keep
// their type, spread scales the move, no single mutation can be a phase "jump", and the live curate press obeys.
import assert from 'node:assert/strict';
import { RANDOMIZABLE_KEYS, randomizeKey } from '../state/paramUtils.js';
import { PARAM_SPEC } from '../data/layout-modes.js';
import { JUMP_FRACTION, initPhase, resetPhase, getPhase, PHASE_REFINE } from './phase.js';
import { mkRng } from '../engine/prng.js';
import { REFINE_RANGES, mutateKey, clampSpread, DEFAULT_SPREAD, MIN_SPREAD, MAX_SPREAD } from './refineMutate.js';
import { getRefineSpread, setRefineSpread, resetRefineSpread } from './refineSpread.js';

const inRange = (v, lo, hi) => v >= lo - 1e-9 && v <= hi + 1e-9;
const rngOf = (seed) => mkRng(seed);

// 1. every key the dice roll has a refine range, and every dice roll falls inside it (no drift from paramUtils).
for (const key of RANDOMIZABLE_KEYS) {
  const spec = REFINE_RANGES[key];
  assert.ok(spec, `${key}: has a refine range`);
  const rng = rngOf(7);
  for (let i = 0; i < 400; i++) {
    const v = randomizeKey(key, rng);
    if (spec.pair) {
      assert.ok(inRange(v[0], ...spec.pair[0]) && inRange(v[1], ...spec.pair[1]), `${key}: dice ${v} inside range`);
    } else {
      assert.ok(inRange(v, spec.lo, spec.hi), `${key}: dice ${v} inside [${spec.lo}, ${spec.hi}]`);
    }
  }
}
for (const key of Object.keys(REFINE_RANGES)) assert.ok(RANDOMIZABLE_KEYS.includes(key), `${key}: only dice keys are mutated`);

// 2. mutations stay in range, keep their rounding, keep pair order, and are deterministic.
for (const key of RANDOMIZABLE_KEYS) {
  const spec = REFINE_RANGES[key];
  const cur = randomizeKey(key, rngOf(11));
  const a = rngOf(99);
  const b = rngOf(99);
  for (let i = 0; i < 300; i++) {
    const v = mutateKey(key, cur, a, MAX_SPREAD);
    assert.deepStrictEqual(v, mutateKey(key, cur, b, MAX_SPREAD), `${key}: deterministic`);
    if (spec.pair) {
      assert.ok(inRange(v[0], ...spec.pair[0]) && inRange(v[1], ...spec.pair[1]), `${key}: ${v} in range`);
      assert.ok(v[0] <= v[1], `${key}: pair order kept`);
      if (spec.int) assert.ok(v.every(Number.isInteger), `${key}: ints stay ints`);
    } else {
      assert.ok(inRange(v, spec.lo, spec.hi), `${key}: ${v} in range`);
      if (spec.int) assert.ok(Number.isInteger(v), `${key}: int stays int`);
    }
  }
}

// 3. spread scales the move; the dial is clamped (never 0, never a free-for-all); junk is the default.
{
  const meanMove = (spread) => {
    const rng = rngOf(5);
    let sum = 0;
    for (let i = 0; i < 2000; i++) sum += Math.abs(mutateKey('wind', 1.0, rng, spread) - 1.0);
    return sum / 2000;
  };
  assert.ok(meanMove(0.2) > meanMove(0.05) * 2.5, 'a wider spread moves further');
  assert.equal(clampSpread(0), MIN_SPREAD);
  assert.equal(clampSpread(9), MAX_SPREAD);
  assert.equal(clampSpread('x'), DEFAULT_SPREAD);
  assert.equal(setRefineSpread(0.17), 0.17);
  assert.equal(getRefineSpread(), 0.17);
  resetRefineSpread();
  assert.equal(getRefineSpread(), DEFAULT_SPREAD);
}

// 4. no single mutation can be a phase "jump": the worst move at MAX_SPREAD stays under JUMP_FRACTION of the
//    control's own range, so a refine landing can never push the phase out of refine by itself.
for (const key of RANDOMIZABLE_KEYS) {
  const spec = REFINE_RANGES[key];
  const ps = PARAM_SPEC[key];
  if (!ps || spec.pair) continue;
  const worst = (MAX_SPREAD * (spec.hi - spec.lo)) / (ps.max - ps.min);
  assert.ok(worst < JUMP_FRACTION, `${key}: worst mutation ${worst.toFixed(3)} < jump ${JUMP_FRACTION}`);
}

// 4b. a live value outside the dice range is not yanked back in: refine moves near it.
{
  const out = mutateKey('count', 780, rngOf(4), 0.1);
  assert.ok(Math.abs(out - 780) <= 0.1 * (600 - 30) + 1, `out-of-range live value stays near itself (got ${out})`);
  assert.ok(out > 600, 'it did not snap into the dice range');
}

// 5. unusable live values fall back to the dice (refine never produces what the dice could not).
assert.ok(inRange(mutateKey('count', undefined, rngOf(3), 0.1), 30, 600));
assert.ok(inRange(mutateKey('count', NaN, rngOf(3), 0.1), 30, 600));
assert.ok(Array.isArray(mutateKey('scale', 3, rngOf(3), 0.1)));
assert.equal(mutateKey('nope', 5, rngOf(3), 0.1), undefined, 'unknown key = the dice answer (undefined)');

// 6. the live press: in refine the landed scene is within spread of the live values; in explore it is not.
{
  const { useStore } = await import('../state/store.js');
  let cb = null;
  initPhase((f) => { cb = f; });
  const keep = (n) => ({ keeps: new Array(n).fill(0), favorites: [], seed: 1, activeVoiceId: null, voice: null, layoutParams: {} });
  cb(keep(1), keep(0)); // a keep lands: REFINE
  assert.equal(getPhase(), PHASE_REFINE);
  setRefineSpread(0.1);
  const base = { ...useStore.getInitialState().layoutParams };
  let maxFrac = 0;
  for (let press = 0; press < 12; press++) {
    useStore.setState({ seed: 4242, curatePress: press, lockedParams: {}, layoutParams: { ...base } });
    useStore.getState().curateUnlocked();
    const out = useStore.getState().layoutParams;
    for (const key of RANDOMIZABLE_KEYS) {
      const spec = REFINE_RANGES[key];
      if (spec.pair || !Number.isFinite(base[key])) continue;
      // rounding to the key's own grid (whole numbers / decimals) may add up to half a step
      const unit = spec.int ? 1 : 10 ** -(spec.dec ?? 6);
      const slack = (0.5 * unit) / (spec.hi - spec.lo);
      const frac = Math.abs(out[key] - base[key]) / (spec.hi - spec.lo) - slack;
      maxFrac = Math.max(maxFrac, frac);
    }
    for (const k of ['composition', 'mode', 'behave', 'blendMode', 'symmetry']) {
      assert.equal(out[k], base[k], `${k}: refine never changes the room`);
    }
  }
  assert.ok(maxFrac <= 0.1 + 1e-6, `refine stayed within the spread (max ${maxFrac.toFixed(3)} of range)`);
  resetPhase();
  let wild = 0;
  for (let press = 0; press < 12; press++) {
    useStore.setState({ seed: 4242, curatePress: press, lockedParams: {}, layoutParams: { ...base } });
    useStore.getState().curateUnlocked();
    const out = useStore.getState().layoutParams;
    for (const key of RANDOMIZABLE_KEYS) {
      const spec = REFINE_RANGES[key];
      if (spec.pair || !Number.isFinite(base[key])) continue;
      if (Math.abs(out[key] - base[key]) / (spec.hi - spec.lo) > 0.3) wild += 1;
    }
  }
  assert.ok(wild > 0, 'explore (no phase) still rolls the whole range');
  resetRefineSpread();
}

console.log('refineMutate.selfcheck: ok');
