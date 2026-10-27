// refineMutate.js — #1144 refine phase: candidates are LOCAL mutations around what landed, not fresh dice.
//
// In EXPLORE the curator rolls every unlocked numeric key from its whole dice range (wild jumps). In REFINE the
// artist has just kept something and is settling it, so the pool is small variations of the live values instead.
// "How far" is one number, the SPREAD: a fraction of each key's dice range, applied as triangular noise (most
// variations are small, a few reach the edge). Matt tuned it live and locked 0.10 (2026-10-11); the tuning panel is gone.
//
// Honest by construction (KC-1 DS: no timers with opinions): phase comes from phase.js, never a clock; only keys the
// dice already rolls are touched (modifiers and composition are never mutated, so a landing cannot leave refine by
// changing the room); and MAX_SPREAD is capped so a single mutation can never be a "jump" by phase.js's own
// definition (selfcheck: refineMutate.selfcheck.mjs).
import { randomizeKey, DICE_RANGES } from '../state/paramUtils.js';

/** Locked by Matt, 2026-10-11 (#1144). */
export const DEFAULT_SPREAD = 0.1;
export const MIN_SPREAD = 0.01;
export const MAX_SPREAD = 0.2;

// The dice ranges — paramUtils.DICE_RANGES, the one declared table every
// random door reads. Until #1550 this was a hand mirror of randomizeKey's
// ranges; it now derives from the table itself, so the mirror cannot drift
// (writePathHonesty.selfcheck pins the identity). `dec` rounds to that many
// decimals, `int` to whole numbers; a pair is [low element range, high
// element range]. The selfcheck proves every roll falls inside.
export const REFINE_RANGES = DICE_RANGES;

export function clampSpread(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_SPREAD;
  return Math.min(MAX_SPREAD, Math.max(MIN_SPREAD, n));
}

const round = (v, spec) => (spec.int ? Math.round(v) : spec.dec != null ? +v.toFixed(spec.dec) : v);

// One element: triangular noise in [-1, 1] scaled by spread × the element's dice range, clamped back into it.
function mutateOne(cur, lo, hi, rng, spread, spec) {
  const noise = rng() + rng() - 1;
  const next = cur + noise * spread * (hi - lo);
  // A live value can sit outside the dice range (the sliders reach further than the dice do). Clamp to the dice
  // range EXTENDED to include the live value, so refine never yanks such a value back in: it only moves near it.
  return round(Math.min(Math.max(hi, cur), Math.max(Math.min(lo, cur), next)), spec);
}

/**
 * A local mutation of one key's live value. Returns the mutated value, or the plain dice roll when the key is
 * unknown or the live value is not usable (so refine never produces something the dice could not).
 */
export function mutateKey(key, current, rng, spread = DEFAULT_SPREAD) {
  const spec = REFINE_RANGES[key];
  const s = clampSpread(spread);
  if (!spec) return randomizeKey(key, rng);
  if (spec.pair) {
    if (!Array.isArray(current) || current.length !== 2 || !current.every(Number.isFinite))
      return randomizeKey(key, rng);
    return [
      mutateOne(current[0], spec.pair[0][0], spec.pair[0][1], rng, s, spec),
      mutateOne(current[1], spec.pair[1][0], spec.pair[1][1], rng, s, spec),
    ];
  }
  if (!Number.isFinite(current)) return randomizeKey(key, rng);
  return mutateOne(current, spec.lo, spec.hi, rng, s, spec);
}
