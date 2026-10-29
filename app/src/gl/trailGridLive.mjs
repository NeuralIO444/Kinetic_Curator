// trailGridLive.mjs — #1808 slice 1: the backstage TRAILGRID view's wire.
//
// The AgeReadout pattern (#1805), one rung up: a dev-only readout fed by
// a registered getter, never a stage surface. While ?debug=trailgrid is
// on the URL the live loop requests the age buffer in its recipe (the
// grid's dominant ages ride it; no flag, no allocation beyond that
// consumer) and registers its ACCUM object here; TrailGridReadout polls
// readTrailGridFrame(), which pulls one snapshot through the object's
// readTrail() and derives the grid from it. The read happens only on
// the readout's poll — the same throttle discipline as the AGE view's
// readback, widened from a field to a grid, frame-stamped with the
// buffer's own step count (deterministic state, never a wall clock).
// Nothing on the performer's surface changes, and nothing consumes the
// grid for steering in this slice.

import { deriveTrailGrid } from './trailGrid.mjs';

export const DEBUG_TRAILGRID =
  typeof window !== 'undefined' &&
  !!window.location &&
  new URLSearchParams(window.location.search || '').get('debug') === 'trailgrid';

let reader = null;

/** Register (or clear, with null) the object the readout pulls trail
 *  snapshots from: anything with readTrail() — the live loop's ACCUM
 *  object. */
export function setTrailGridReader(obj) {
  reader = obj || null;
}

/** The latest trail grid derived from the live loop, or null when no
 *  loop is running the buffer (or the read fails — a debug view
 *  degrades to its empty state, never to an exception). */
export function readTrailGridFrame() {
  try {
    if (!reader || typeof reader.readTrail !== 'function') return null;
    const snap = reader.readTrail();
    if (!snap) return null;
    return deriveTrailGrid({
      data: snap.data,
      ageData: snap.ageData,
      width: snap.width,
      height: snap.height,
      stamp: snap.stamp,
    });
  } catch {
    return null;
  }
}
