// trailGridLive.mjs — #1808 slice 1: the backstage TRAILGRID view's wire;
// #1837 (slice 2): the steering feed's wire, in the same module.
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
//
// Slice 2 adds the standing consumer slice 1 named: while a look that
// declares an ember weight is up (and the governor has not shed
// steering), the live loop offers its ACCUM object to
// updateTrailSteerGrid() after each landed step; the wire derives a
// fresh grid at cadence (TRAIL_STEER_EVERY steps, the #1807 stats
// throttle's beat) and holds it for the loop to stamp on the next
// resolver input. The grid is derived state — the loop stamps the held
// OBJECT, so between beats the input log records one identity, not a
// per-frame copy — and its stamp (the buffer's step count) keeps its
// staleness honest. A failed derivation keeps the last grid: its stamp
// ages in the open rather than the feed dying silently.

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

/** #1837 — steering derivations per this many ACCUM steps (~4 Hz at
 *  60 fps; the buffer statistics' STATS_EVERY beat, #1807). Embers live
 *  for seconds; a quarter-second-old grid steers them honestly, and
 *  the stamp on the grid says exactly how old it is. */
export const TRAIL_STEER_EVERY = 15;

let steerGrid = null; // the latest grid derived for steering, or null
let steerStamp = -1; // the ACCUM step count that grid was derived at

/**
 * The live loop's per-step offer (#1837): derive a fresh steering grid
 * from the ACCUM object when the cadence beat lands, and hold it for
 * getTrailSteerGrid(). Called only while steering is wanted (a look
 * declares the weight, creatures may exist, the shed is off) — when it
 * is not called, no readback and no derivation happen at all.
 */
export function updateTrailSteerGrid(accumObj) {
  if (!accumObj || typeof accumObj.readTrail !== 'function' || typeof accumObj.statsFrame !== 'function') return;
  const stamp = accumObj.statsFrame();
  if (steerGrid && stamp - steerStamp < TRAIL_STEER_EVERY) return;
  try {
    const snap = accumObj.readTrail();
    if (!snap) return;
    steerGrid = deriveTrailGrid({
      data: snap.data,
      ageData: snap.ageData,
      width: snap.width,
      height: snap.height,
      stamp: snap.stamp,
    });
    steerStamp = stamp;
  } catch {
    // Keep the last grid: its stamp keeps ageing in the open, and the
    // next beat retries. A steering feed degrades, it never faults.
  }
}

/** The held steering grid (see updateTrailSteerGrid), or null when no
 *  derivation has landed yet in this session. */
export function getTrailSteerGrid() {
  return steerGrid;
}

/** The ACCUM session ended: the steering feed carries nothing again. */
export function clearTrailSteerGrid() {
  steerGrid = null;
  steerStamp = -1;
}
