// kineticWarm.mjs — #944 tap-routing decision for the KINETIC button.
//
// Pure and wall-clock-free: the caller passes `now` (Date.now() at the tap
// site — a human gesture timestamp, like #268's swell envelope, not a
// performer clock, so it stays out of the #806 must-loop law). A tap within
// KINETIC_WARM_MS of the previous tap finds the button "warm" → WEATHER
// pass; otherwise → RULES pass. No timer needed: when the window lapses with
// no tap, the next tap simply sees a stale timestamp and counts as fresh.

/** A second KINETIC tap within this window finds the button "warm". */
export const KINETIC_WARM_MS = 2000;

/**
 * Route one KINETIC tap. Returns 'weather' when the tap lands inside the
 * warm window after `lastTapAt`, otherwise 'rules'. `lastTapAt = 0`
 * (never tapped) always routes to 'rules'.
 */
export function routeKineticTap(lastTapAt, now) {
  return now - (lastTapAt || 0) < KINETIC_WARM_MS ? 'weather' : 'rules';
}
