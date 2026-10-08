// effectiveTemp.js — THE single temperature source of truth (#1145, #1144).
//
// The builder review on #1145 found temperature in two places (pickPersona's
// constant 0.4, #1144's phase-driven values, the rooms' thermostat) and
// required one dial. This module is that dial: every temperature read in the
// pick path goes through effectiveTemp().
//
// Pipeline: room base_temp → phase modulation → clamp.
//   1. Room base: the room row's base_temp is an explicit override and wins.
//      No room (silence) → the global default 0.4 (yesterday's behavior).
//   2. Phase modulation (#1144's interface): refine cools the room, explore
//      warms it. #1144's phase logic is not built yet — phase defaults to
//      null, which applies NO modulation. When it lands, it passes
//      'refine' | 'explore' here; nothing else changes.
//   3. Clamp to the sane band [0.1, 0.55] (#1144's refine floor, M2's cap).
//
// Composition with the Queen's M2 (warmedTemperature: 0.4 + 0.15r): M2's
// breathing applies ON TOP of this base when #762's gate opens —
// finalT = clamp(effectiveTemp(...) + m2delta), m2delta in [0, 0.15].
// While the gate is closed M2 outputs neutral (0.4 base), so there is no
// double-count today. Do not fold M2's delta in here.

/** Yesterday's behavior: the constant pickPersona used before the Director. */
export const TEMP_DEFAULT = 0.4;
/** #1144's refine floor. */
export const TEMP_FLOOR = 0.1;
/** M2's cap — the warmest any pick may run. */
export const TEMP_CAP = 0.55;
/** Refine cools the room by this much (toward the 0.1 floor). */
export const REFINE_COOL = 0.15;
/** Explore warms the room by this much. */
export const EXPLORE_WARM = 0.1;

/**
 * @param {object} p { room?: { base_temp }, phase?: 'refine'|'explore'|null }
 * @returns the scheduled temperature, always within [0.1, 0.55].
 */
export function effectiveTemp({ room = null, phase = null } = {}) {
  let t = room && typeof room.base_temp === 'number' ? room.base_temp : TEMP_DEFAULT;
  if (phase === 'refine') t -= REFINE_COOL;
  else if (phase === 'explore') t += EXPLORE_WARM;
  // Unknown phase strings are ignored — never let a typo move the thermostat.
  return Math.min(TEMP_CAP, Math.max(TEMP_FLOOR, t));
}
