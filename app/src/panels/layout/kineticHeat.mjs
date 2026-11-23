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
//   KINETIC_HEAT_PER_TAP (two heat-adding rapid taps cross the CHAOS line).
//   Idle heat decays with KINETIC_HEAT_HALF_LIFE_MS half-life.
// - Run: consecutive taps with gaps < KINETIC_WARM_MS (the #944 warm window).
//   #1772 — the run is a filter sweeping left to right (Matt, 2026-10-27): tap 1 → LOOK, 2 → VOICE, ≥3 → CURATOR
//   (a capped nudge, scaled by heat since #2452); a ≥3rd tap at heat ≥ KINETIC_CHAOS_HEAT breaks into CHAOS
//   (hammering) — at EVERY scope since #2452 (Matt's law: hit it a lot, it changes more, not less; the
//   scope sizes the decks, it no longer caps the size of the change — the KOZ-only gate is retired).
//   Heat picks how far the run has swept, not how violent a re-roll is — until hammering.
// - A stale tap (gap ≥ warm window) starts a fresh run: LOOK, heat 0.
//
// (#944's simple warm/fresh router, kineticWarm.mjs, retired with the RULES/WEATHER passes — #1772 cleanup.)

/** A second KINETIC tap within this window finds the button "warm" (#944). */
export const KINETIC_WARM_MS = 2000;

/** A tap within this window of the last tap adds heat (rapid tapping). #2452: 600 → 1000 — a human hammer counts as rapid. */
export const KINETIC_HEAT_TAP_MS = 1000;

/** Idle heat half-life — tune by feel. #2452: 2000 → 3500 — heat survives a human pause between presses. */
export const KINETIC_HEAT_HALF_LIFE_MS = 3500;

/** Heat added per rapid tap. #2452: 0.34 → 0.5 — two rapid presses to hot. */
export const KINETIC_HEAT_PER_TAP = 0.5;

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
// bands. A plain holder: the button is the only writer; the readers are the keep's bands, the room readout,
// and — since #2452 — the store's curator pass, which scales its nudge by this standing heat (the button
// publishes the tap's post-route heat before it dispatches the pass, so the pass reads its own tap's heat).
let shown = 0;
export function publishShownHeat(h) {
  shown = Number.isFinite(h) ? Math.max(0, Math.min(1, h)) : 0;
}
export function shownHeat() {
  return shown;
}
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
 * @returns {{ layer: 'look'|'voice'|'curator'|'chaos', heat: number, taps: number,
 *   lastTapAt: number }} heat is post-tap heat (decayed then added); taps is
 *   the run length; lastTapAt echoes `now` so runs thread through calls.
 *
 * #2452 — there is no scope gate here any more: at/above the CHAOS line a
 * 3rd+ tap breaks into the full re-roll at every START scope. The scope
 * (kineticScope.mjs) still sizes the decks the passes deal from; it no
 * longer caps the SIZE of the change. (The gate was the #1772 rule; this
 * supersedes it in that one respect.)
 */
export function routeKineticTapHeat(run, now) {
  const lastTapAt = run.lastTapAt || 0;
  const dt = now - lastTapAt;
  if (dt >= KINETIC_WARM_MS || lastTapAt === 0) {
    // Stale (or never tapped): a fresh run starts the sweep at the LOOK.
    return { layer: 'look', heat: 0, taps: 1, lastTapAt: now };
  }
  let heat = decayHeat(run.heat || 0, dt);
  const taps = (run.taps || 0) + 1;
  if (dt < KINETIC_HEAT_TAP_MS) heat = addHeat(heat);
  if (taps >= 3 && heat >= KINETIC_CHAOS_HEAT) {
    return { layer: 'chaos', heat, taps, lastTapAt: now };
  }
  return { layer: taps >= 3 ? 'curator' : taps === 2 ? 'voice' : 'look', heat, taps, lastTapAt: now };
}

/** #1772 — the TE micro-label for the pass a tap actually ran (KC-1 DS: honest signals): L / V / C, and X for chaos. */
export const KINETIC_LAYER_LABEL = Object.freeze({ look: 'L', voice: 'V', curator: 'C', chaos: 'X' });
export function kineticLayerLabel(layer) {
  return KINETIC_LAYER_LABEL[layer] ?? '';
}

/**
 * #2050 — the layer a tap at `now` WOULD fire, asked of the router itself.
 *
 * Single-source law (top-bar legibility spec): the KIN detent is never a
 * parallel prediction that could drift from the router — it is the router's
 * own decision, run on the standing run state with the performer's clock.
 * The router is pure and never mutates `run`, so asking costs nothing and
 * can never disagree with the tap that follows at the same `now`: stale run
 * → 'look'; a live run's 2nd tap → 'voice'; 3rd+ → 'curator', or 'chaos'
 * when the decayed-then-added heat clears the CHAOS line — at every scope
 * since #2452, so a full-heat detent honestly reads CHAOS wherever the
 * START pill stands.
 */
export function nextKineticLayer(run, now) {
  return routeKineticTapHeat(run, now).layer;
}

/** #2050 — the TE detent words for the NEXT pass (the spec's table): full words, one per layer. */
export const KINETIC_NEXT_LABEL = Object.freeze({
  look: 'LOOK',
  voice: 'VOICE',
  curator: 'CUR',
  chaos: 'CHAOS',
});
export function kineticNextLabel(layer) {
  return KINETIC_NEXT_LABEL[layer] ?? '';
}
