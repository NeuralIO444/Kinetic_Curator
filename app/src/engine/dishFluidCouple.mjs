// dishFluidCouple.mjs — the fluid → culture direction of the ferrofluid coupling (#1997).
//
// The other direction (the culture's level biasing the fluid's feed) lives in the kernel
// (engine/dishFluid.mjs stepFluid, CULTURE_FEED_GAIN). This module is the seam the culture's
// stage reads: where the fluid's dark phase lies dense on the dish, the culture's births are
// biased up — a dead cell the rule would not birth can still be born when the fluid over it is
// dense enough and the seeded stream deals it in. Deaths and the terrain are never touched:
// bedrock and mask cells are structurally out of reach (the same blocked() rule the culture
// core applies), and a living cell's fate stays the rule's alone.
//
// The admission test, as this seam passes it:
//   SEEDED / REPLAYABLE  the injection is a pure function of (culture, density, strength,
//                        seed) — the density is the fluid stage's published state from the
//                        last applied frame (one frame behind, the dish's standing read
//                        discipline) and the dial rides the recorded input stream.
//   ONE-WAY              this writes only dead→alive births into the culture it is handed,
//                        before that culture's own step; it reads nothing back.
//   BEDROCK              blocked cells (mask / bedrock) are skipped before any draw — the
//                        fluid biases births, never the terrain record.
//   SHEDDABLE            at strength 0 the seam is inert and the culture is the uncoupled
//                        culture, number for number.

import { hashU01 } from './kernel/rng.js';

/** The fluid density at or below which no birth is ever biased in. */
export const FLUID_BIRTH_FLOOR = 0.25;
/** The seeded stream the birth deal draws on (registered 'spatial' in kernel/rng.js, #1238). */
export const FLUID_BIRTH_CHANNEL = 'dish-fluid-birth';

/** The culture core's blocked rule, read off the culture's own public fields. */
function blocked(culture, i) {
  return (culture.mask && !culture.mask[i]) || (culture.bedrock && culture.bedrock[i]);
}

/**
 * The birth chance for one cell: 0 at or below the floor, rising linearly with the density
 * above it, scaled by the coupling strength. Pure.
 */
export function fluidBirthChance(density, strength) {
  const d = Number.isFinite(Number(density)) ? Number(density) : 0;
  const s = Number.isFinite(Number(strength)) ? Math.min(1, Math.max(0, Number(strength))) : 0;
  if (!(s > 0) || d <= FLUID_BIRTH_FLOOR) return 0;
  return s * ((d - FLUID_BIRTH_FLOOR) / (1 - FLUID_BIRTH_FLOOR));
}

/**
 * Bias one generation's births: for every dead, unblocked cell whose fluid density clears
 * the floor, deal a birth from the seeded stream at (seed, generation, index). Mutates the
 * culture's current grid in place (dead → alive only) and returns how many cells were born.
 * The generation in the deal index means a cell refused at generation g is re-dealt at
 * g + 1, never sticky. Call BEFORE stepCulture for the generation it should feed.
 */
export function injectFluidBirths(culture, density, strength, seed = 0) {
  if (!culture || !density || !(Number(strength) > 0)) return 0;
  const n = culture.cur.length;
  if (density.length !== n) return 0;
  const gen = culture.gen | 0;
  let born = 0;
  for (let i = 0; i < n; i++) {
    if (culture.cur[i] !== 0) continue;
    const chance = fluidBirthChance(density[i], strength);
    if (!(chance > 0)) continue;
    if (blocked(culture, i)) continue;
    if (hashU01(seed | 0, FLUID_BIRTH_CHANNEL, gen * 8192 + i) < chance) {
      culture.cur[i] = 1;
      born++;
    }
  }
  return born;
}
