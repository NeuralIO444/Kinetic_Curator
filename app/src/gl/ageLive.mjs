// ageLive.mjs — #1805: the backstage AGE view's one wire.
//
// The StressReadout pattern (#1354): a dev-only readout fed by a
// registered getter, never a stage surface. While ?debug=age is on the
// URL the live loop requests the age buffer in its recipe (no flag, no
// allocation — the buffer exists only for this consumer) and registers
// its ACCUM object here; AgeReadout polls readAgeFrame() and paints the
// false-colour age map. Nothing on the performer's surface changes.

export const DEBUG_AGE =
  typeof window !== 'undefined' &&
  !!window.location &&
  new URLSearchParams(window.location.search || '').get('debug') === 'age';

let reader = null;

/** Register (or clear, with null) the object the readout pulls ages
 *  from: anything with readAge() — the live loop's ACCUM object. */
export function setAgeReader(obj) {
  reader = obj || null;
}

/** The latest age frame { data, width, height } from the live loop, or
 *  null when no loop is running the buffer (or the read fails — a debug
 *  view degrades to its empty state, never to an exception). */
export function readAgeFrame() {
  try {
    return reader && typeof reader.readAge === 'function' ? reader.readAge() : null;
  } catch {
    return null;
  }
}
