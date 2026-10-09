/**
 * swayView.mjs — the Director's sway view, read as a number. (#1258)
 *
 * The Director computes a sway view on every tick (see director.js); this
 * module is the sanctioned reader: it turns that view into a 0..1 magnitude
 * the UI can carry in the store. It knows nothing about the lean internals —
 * only the public shape of the sway view ({ temperatureDelta }).
 *
 * UI surface files must never reference the scheduler (director.selfcheck:
 * "the Director never renders"). They read the magnitude from the store,
 * which the pick path writes; they never import director.js.
 */

/** M2's warming range: temperatureDelta lives in 0..0.15 (floor 0.4, cap 0.55). */
export const SWAY_DELTA_MAX = 0.15;

/**
 * Proposed visibility threshold for the presence mark — Matt decides on
 * review. Lives here (not in the JSX) so the selfcheck can assert the real
 * constant the mark uses.
 */
export const SWAY_VISIBLE_THRESHOLD = 0.02;

/**
 * Normalize a sway view to 0..1. Neutral/absent/garbage views read 0 —
 * silence is the default, never a guess.
 */
export function swayMagnitude(view) {
  const d = view == null ? NaN : Number(view.temperatureDelta);
  if (!Number.isFinite(d) || d <= 0) return 0;
  return Math.min(1, Math.max(0, d / SWAY_DELTA_MAX));
}

// ─── the ephemeral current magnitude (NOT store state) ───
// Deniability law (queenDeniability.selfcheck): "state is data, so she must
// not appear in it" — no store key may be named sway/queen/lean. The sway
// signal is ephemeral, not data, so it lives here: the pick path publishes
// it, the presence mark reads it. Never serialized, never in devtools.
let currentMagnitude = 0;

/** Called by the pick path after the Director ticks. */
export function setSwayMagnitude(n) {
  currentMagnitude = Number.isFinite(n) && n > 0 ? Math.min(1, n) : 0;
}

/** Called by the presence mark on render. */
export function getSwayMagnitude() {
  return currentMagnitude;
}
