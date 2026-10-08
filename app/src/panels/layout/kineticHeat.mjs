// kineticHeat.mjs — #945 heat model + tap router for the KINETIC button.
//
// Pure and wall-clock-free: the caller passes `now` (Date.now() at the tap
// site — a human gesture timestamp, like #268's swell envelope and #944's
// kineticWarm, not a performer clock, so it stays out of the #806 must-loop
// law). Heat builds on rapid taps, decays when idle; the layer follows the
// tap count inside the warm window while heat gates the CHAOS ceiling.
//
// Model:
// - heat ∈ [0, 1]. A tap within KINETIC_HEAT_TAP_MS of the last adds
//   KINETIC_HEAT_PER_TAP (~3 rapid taps to max). Idle heat decays with
//   KINETIC_HEAT_HALF_LIFE_MS half-life.
// - Run: consecutive taps with gaps < KINETIC_WARM_MS (the #944 warm window).
//   tapCount 1 → RULES, 2 → WEATHER, ≥3 → CHAOS once heat ≥ KINETIC_CHAOS_HEAT.
//   A hot-but-not-chaotic third tap simmers at WEATHER — no regression vs #944.
// - A stale tap (gap ≥ warm window) starts a fresh run: RULES, heat 0.
//
// kineticWarm.mjs is left untouched — it remains the simple warm/fresh router
// #944's selfcheck pins. This module is the full heat-aware superset the
// button actually uses.

/** A second KINETIC tap within this window finds the button "warm" (#944). */
export const KINETIC_WARM_MS = 2000;

/** A tap within this window of the last tap adds heat (rapid tapping). */
export const KINETIC_HEAT_TAP_MS = 600;

/** Idle heat half-life — tune by feel. */
export const KINETIC_HEAT_HALF_LIFE_MS = 2000;

/** Heat added per rapid tap: ~3 rapid taps to reach max. */
export const KINETIC_HEAT_PER_TAP = 0.34;

/** Heat at/above which a 3rd+ tap in the run breaks into CHAOS. */
export const KINETIC_CHAOS_HEAT = 0.6;

/**
 * Decay heat over dtMs of idleness. Pure exponential decay toward 0.
 */
export function decayHeat(heat, dtMs) {
  if (!(heat > 0) || !(dtMs > 0)) return Math.max(0, heat || 0);
  return heat * Math.pow(0.5, dtMs / KINETIC_HEAT_HALF_LIFE_MS);
}

/**
 * Add one rapid tap's heat, capped at 1.
 */
export function addHeat(heat) {
  return Math.min(1, (heat || 0) + KINETIC_HEAT_PER_TAP);
}

// #1124 — the heat the KIN button is SHOWING right now, published by the button so a keep can freeze it into its
// bands. A plain holder: the button is the only writer, a keep the only reader.
let shown = 0;
export function publishShownHeat(h) { shown = Number.isFinite(h) ? Math.max(0, Math.min(1, h)) : 0; }
export function shownHeat() { return shown; }
/** The 4 steps a HITS band can show: 0 cool, 1 low, 2 warm, 3 hot (the same cuts as heatLevel, plus a low step). */
export function heatStep(heat) {
  if (!(heat > 0.01)) return 0;
  if (heat >= KINETIC_CHAOS_HEAT) return 3;
  if (heat >= 0.25) return 2;
  return 1;
}

/**
 * Coarse heat level for styling/kinemes: 'cool' | 'warm' | 'hot'.
 */
export function heatLevel(heat) {
  if (heat >= KINETIC_CHAOS_HEAT) return 'hot';
  if (heat >= 0.25) return 'warm';
  return 'cool';
}

/**
 * Route one KINETIC tap through the heat model.
 *
 * @param {{ heat: number, taps: number, lastTapAt: number }} run — heat and
 *   tap count as of the previous tap (heat at last tap, not decayed).
 * @param {number} now — Date.now() at this tap.
 * @returns {{ layer: 'rules'|'weather'|'chaos', heat: number, taps: number,
 *   lastTapAt: number }} heat is post-tap heat (decayed then added); taps is
 *   the run length; lastTapAt echoes `now` so runs thread through calls.
 */
export function routeKineticTapHeat(run, now) {
  const lastTapAt = run.lastTapAt || 0;
  const dt = now - lastTapAt;
  if (dt >= KINETIC_WARM_MS || lastTapAt === 0) {
    // Stale (or never tapped): fresh run, cool RULES cousin.
    return { layer: 'rules', heat: 0, taps: 1, lastTapAt: now };
  }
  let heat = decayHeat(run.heat || 0, dt);
  const taps = (run.taps || 0) + 1;
  if (dt < KINETIC_HEAT_TAP_MS) heat = addHeat(heat);
  if (taps >= 3 && heat >= KINETIC_CHAOS_HEAT) {
    return { layer: 'chaos', heat, taps, lastTapAt: now };
  }
  return { layer: taps >= 2 ? 'weather' : 'rules', heat, taps, lastTapAt: now };
}
