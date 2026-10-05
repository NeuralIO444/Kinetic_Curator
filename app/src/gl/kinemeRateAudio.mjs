// kinemeRateAudio.mjs — apply the #790 clock.kinemeRate route output to the kineme clock.
//
// The route output is a rate MULTIPLIER for the anchored kineme clock
// (createKinemeClock in data/kinemes.js): 1 = today's rate exactly, >1 =
// faster kineme cycling, <1 = slower. The clock re-anchors on rate changes,
// so per-frame audio modulation never jumps.
//
// Mapping (this module owns the feel):
// - undefined / 0 (no route in the table, or digital silence) → 1: the loop
//   is bit-identical to today, and when the audio driver drops out the piece
//   relaxes to the base rate instead of stalling (#721).
// - otherwise clamped to [0.1, 4]: loud audio can push 4x, quiet audio can
//   drag to a 0.1x crawl, but the clock never stalls at exactly 0 and never
//   sees a non-finite rate (a NaN rate would poison the anchored clock for
//   the whole frame).
//
// 0 (no route in the table / default table) leaves the rate untouched, so
// today's render is bit-identical.

/** Clamp a route kinemeRate output to a finite rate multiplier. Never trust the caller. */
export function sanitizeKinemeRateAudio(v) {
  if (!Number.isFinite(v)) return 1;
  if (v === 0) return 1;
  return Math.min(4, Math.max(0.1, v));
}

/**
 * Apply an audio kineme-rate multiplier on top of the base kineme rate.
 * Pure function of its inputs (no mutation — the clock owns its anchors).
 * Returns the effective rate for kinemeClock.at().
 */
export function applyKinemeRateAudio(baseRate, routeOut) {
  const mult = sanitizeKinemeRateAudio(routeOut);
  const base = Number.isFinite(baseRate) ? Math.max(0, baseRate) : 1;
  if (mult === 1) return base;
  return base * mult;
}
