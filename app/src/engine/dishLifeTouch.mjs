// dishLifeTouch.mjs — DISH LIFE slice 3c (#1923): "the performer touched the instrument". A tiny pending-touch bus.
//
// Wall-clock events (a pointer move, a key, a MIDI message) land here the instant they happen; the live loop
// CONSUMES them once per frame and hands the touch to the idle clock on the LOOP clock. The event never reaches the
// clock directly, so the culture's wake and end are decisions made at a frame boundary and stamped on the recorded
// input — the log stays the authority. No DOM, no timers; one slot (the latest touch wins; any one ends the culture).
import { TOUCH_SOURCES } from './dishLifePhase.mjs';

let pending = null;

/** A touch happened. Unknown sources are ignored. Cheap: safe to call from a pointermove. */
export function noteTouch(source = 'pointer', level = 1) {
  if (!TOUCH_SOURCES.includes(source)) return false;
  pending = { source, level: Number.isFinite(Number(level)) ? Number(level) : 1 };
  return true;
}

/** Take the pending touch (or null) and clear it. Called once per frame by the loop. */
export function consumeTouch() {
  const p = pending;
  pending = null;
  return p;
}

/** Drop any pending touch without delivering it (a loop being disposed / a test). */
export function clearTouch() {
  pending = null;
}
