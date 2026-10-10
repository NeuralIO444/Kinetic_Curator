/**
 * easing.mjs — kernel-owned easing curves (#1239).
 *
 * Pure math, zero imports: safe for workers and selfchecks. gl/paletteMix.mjs
 * re-exports these so the live loop keeps its easing unchanged while the
 * dependency arrow points gl→kernel (itemMorph.selfcheck.mjs used to import
 * morphEase from gl/ — that kernel→gl edge is gone).
 */

/**
 * Always Alive Protocol: smooth ease-in / ease-out for item morph (chip clicks).
 * Replaces aggressive expoOut (which halted at 97% mid-flight and popped at landing)
 * with continuous smootherstep: zero jerk at endpoints, organic acceleration out of
 * the source pose, and soft deceleration into the destination pose.
 * Input clamped; output monotone inside [0,1], f(0)=0 and f(1)=1 exact (I1 invariant).
 */
export function morphEase(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}
