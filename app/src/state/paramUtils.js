// Shared parameter randomization + morph key lists
import { PALETTES } from '../data/palettes.js';

export const RANDOMIZABLE_KEYS = [
  'count', 'scale', 'rotate', 'alpha', 'jitter', 'density', 'zTiers',
  'noiseFreq', 'noiseSpeed', 'displacement', 'particleCount',
  'swarmCohesion', 'gravityWells', 'damping',
  // #518: motion factors — the curator shapes them, RANDOMIZE and Evolve roll them.
  'wind', 'flap', 'breath', 'lifeDrift',
];

export const MORPHABLE_KEYS = [...RANDOMIZABLE_KEYS];

const rand = (lo, hi, rng) => lo + rng() * (hi - lo);
const randInt = (lo, hi, rng) => Math.floor(rand(lo, hi + 1, rng));

/**
 * #1550 — THE roll ranges: the one declared table every random door reads.
 *
 * PARAM_SPEC / RANGE_SPEC (data/layout-modes.js) are the document's truth —
 * what a value may BE once it lands. This table is the doors' truth — what
 * the dice, CURATE and the refine mutations may PROPOSE. Every range here
 * is a sub-range of the document spec, with one declared exception: density
 * proposes to 120 while the document caps at 100 (#272) — the dice may
 * propose past the cap, and the store's write doors clamp at write time
 * (layoutSlice), so no landed value is ever out of spec. That overhang is
 * declared here and pinned in writePathHonesty.selfcheck; it is the only one.
 *
 * Before #1550 these ranges existed three times — the randomizeKey switch,
 * Evolve's private table in generateLayoutTargets, and refineMutate's hand
 * mirror — and the copies had drifted apart (E1a finding: count, density,
 * noiseFreq, gravityWells, swarmCohesion, plus construction differences on
 * the pair keys and the int endpoints). Now randomizeKey,
 * generateLayoutTargets and refineMutate's REFINE_RANGES all read THIS
 * table, so a second table cannot drift in silently: the write-path suite
 * pins the derivation.
 *
 * Shape: a scalar is { lo, hi } plus `int: true` (whole numbers, both ends
 * reachable) or `dec` (round to that many decimals); a pair is
 * { pair: [[lo, hi], [lo, hi]], ... } — the two element ranges.
 */
export const DICE_RANGES = Object.freeze({
  count:         { lo: 30, hi: 600, int: true },
  scale:         { pair: [[0.1, 1.0], [1.0, 3.0]], dec: 2 },
  rotate:        { pair: [[-180, 0], [0, 180]], int: true },
  alpha:         { pair: [[15, 60], [70, 100]], int: true },
  jitter:        { lo: 0, hi: 150, int: true },
  density:       { lo: 20, hi: 120, int: true },
  zTiers:        { lo: 1, hi: 10, int: true },
  noiseFreq:     { lo: 0.002, hi: 0.015, dec: 4 },
  noiseSpeed:    { lo: 0.1, hi: 2.0, dec: 2 },
  displacement:  { lo: 0, hi: 150, int: true },
  particleCount: { lo: 50, hi: 300, int: true },
  swarmCohesion: { lo: 0.2, hi: 4.0, dec: 2 },
  gravityWells:  { lo: 0.1, hi: 3.0, dec: 2 },
  damping:       { lo: 0.90, hi: 0.98, dec: 2 },
  wind:          { lo: 0.2, hi: 2.0, dec: 2 },
  flap:          { lo: 0.05, hi: 0.9, dec: 2 },
  breath:        { lo: 0, hi: 0.8, dec: 2 },
  lifeDrift:     { lo: 0.1, hi: 0.9, dec: 2 },
});
for (const spec of Object.values(DICE_RANGES)) {
  if (spec.pair) spec.pair.forEach((el) => Object.freeze(el));
  Object.freeze(spec);
}

const rollElement = ([lo, hi], spec, rng) => (spec.int
  ? randInt(lo, hi, rng)
  : +(rand(lo, hi, rng).toFixed(spec.dec)));

const rollSpec = (spec, rng) => (spec.pair
  ? [rollElement(spec.pair[0], spec, rng), rollElement(spec.pair[1], spec, rng)]
  : rollElement([spec.lo, spec.hi], spec, rng));

/** rng is injectable (#518): CURATE passes a seeded stream; dice buttons keep Math.random. */
export function randomizeKey(key, rng = Math.random) {
  const spec = DICE_RANGES[key];
  if (!spec) return undefined;
  return rollSpec(spec, rng);
}

/**
 * #1550 — Evolve's DECLARED sub-range: the one key where a morph target
 * deliberately proposes narrower than the dice. Everything not listed
 * here rolls the shared DICE_RANGES. (Before #1550, generateLayoutTargets
 * carried a whole second table that had drifted from the dice on five
 * keys; four were drift and are unified — this is the deliberate
 * remainder, kept in the open and pinned by writePathHonesty.selfcheck.)
 *
 * swarmCohesion 0.5–3.5 (dice 0.2–4.0): a morph is a journey the
 * performer watches, not a dice slam — targets stay off the cohesion
 * extremes, so one Evolve never slams the swarm from flocked to
 * scattered (or back) in a single morph.
 */
export const EVOLVE_TARGET_OVERRIDES = Object.freeze({
  swarmCohesion: Object.freeze({ lo: 0.5, hi: 3.5, dec: 2 }),
});

/** Build a random layout-param target object for Evolve (respects locks). */
export function generateLayoutTargets(state) {
  const newLayout = {};
  for (const key of RANDOMIZABLE_KEYS) {
    if (state.lockedParams[key]) continue;
    newLayout[key] = rollSpec(EVOLVE_TARGET_OVERRIDES[key] || DICE_RANGES[key], Math.random);
  }
  return newLayout;
}

// Derived from the palette catalog so new palettes join Evolve's cycle
// without a second edit site.
export const PALETTE_IDS = PALETTES.map((p) => p.id);
