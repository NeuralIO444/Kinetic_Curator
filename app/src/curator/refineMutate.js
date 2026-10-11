// refineMutate.js — #1144 refine phase: candidates are LOCAL mutations around what landed, not fresh dice.
//
// In EXPLORE the curator rolls every unlocked numeric key from its whole dice range (wild jumps). In REFINE the
// artist has just kept something and is settling it, so the pool is small variations of the live values instead.
// "How far" is one number, the SPREAD: a fraction of each key's dice range, applied as triangular noise (most
// variations are small, a few reach the edge). The spread is the tuning dial (Matt, 2026-10-11, "C").
//
// Honest by construction (KC-1 DS: no timers with opinions): phase comes from phase.js, never a clock; only keys the
// dice already rolls are touched (modifiers and composition are never mutated, so a landing cannot leave refine by
// changing the room); and MAX_SPREAD is capped so a single mutation can never be a "jump" by phase.js's own
// definition (selfcheck: refineMutate.selfcheck.mjs).
import { randomizeKey } from '../state/paramUtils.js';

export const DEFAULT_SPREAD = 0.1;
export const MIN_SPREAD = 0.01;
export const MAX_SPREAD = 0.2;

// The dice ranges, mirrored from paramUtils.randomizeKey (the selfcheck proves every roll falls inside).
// `dec` rounds to that many decimals, `int` to whole numbers; a pair is [low element range, high element range].
export const REFINE_RANGES = Object.freeze({
  count: { lo: 30, hi: 600, int: true },
  scale: { pair: [[0.1, 1.0], [1.0, 3.0]], dec: 2 },
  rotate: { pair: [[-180, 0], [0, 180]], int: true },
  alpha: { pair: [[15, 60], [70, 100]], int: true },
  jitter: { lo: 0, hi: 150, int: true },
  density: { lo: 20, hi: 120, int: true },
  zTiers: { lo: 1, hi: 10, int: true },
  noiseFreq: { lo: 0.002, hi: 0.015, dec: 4 },
  noiseSpeed: { lo: 0.1, hi: 2.0, dec: 2 },
  displacement: { lo: 0, hi: 150, int: true },
  particleCount: { lo: 50, hi: 300, int: true },
  swarmCohesion: { lo: 0.2, hi: 4.0, dec: 2 },
  gravityWells: { lo: 0.1, hi: 3.0, dec: 2 },
  damping: { lo: 0.9, hi: 0.98, dec: 2 },
  wind: { lo: 0.2, hi: 2.0, dec: 2 },
  flap: { lo: 0.05, hi: 0.9, dec: 2 },
  breath: { lo: 0, hi: 0.8, dec: 2 },
  lifeDrift: { lo: 0.1, hi: 0.9, dec: 2 },
});

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
    if (!Array.isArray(current) || current.length !== 2 || !current.every(Number.isFinite)) return randomizeKey(key, rng);
    return [
      mutateOne(current[0], spec.pair[0][0], spec.pair[0][1], rng, s, spec),
      mutateOne(current[1], spec.pair[1][0], spec.pair[1][1], rng, s, spec),
    ];
  }
  if (!Number.isFinite(current)) return randomizeKey(key, rng);
  return mutateOne(current, spec.lo, spec.hi, rng, s, spec);
}
