// whisper — deniable transition lines (#1139).
//
// She speaks only at transitions, deadpan-warm lowercase, never attributed.
// Rule 10: the lines name no one; this module names no one. Copy ships
// verbatim (Matt, 2026-10-08):
//   "input's gone. i'm still listening." / "there you are." / "raw. good." /
//   "i hear you."                    → STIMULI, each at most once per page load
//   "dance."                         → PLAY, once per session, first beat
//
// Budgets are per page load (module state). A fired line never refires.
export const LINES = Object.freeze({
  LOST: "input's gone. i'm still listening.",
  FOUND: 'there you are.',
  RAW: 'raw. good.',
  HEAR: 'i hear you.',
  DANCE: 'dance.',
});

export const STIMULI_KEYS = Object.freeze(['LOST', 'FOUND', 'HEAR', 'RAW']);
export const PLAY_KEYS = Object.freeze(['DANCE']);

const fired = new Set();
const listeners = new Set();

/** Say a line (by key). Returns true if it was shown (budget not spent). */
export function say(key) {
  if (fired.has(key)) return false;
  const line = LINES[key];
  if (typeof line !== 'string') return false;
  fired.add(key);
  for (const fn of [...listeners]) {
    try {
      fn(key, line);
    } catch {
      /* a whisper never breaks the room */
    }
  }
  return true;
}

/** Subscribe to (key, line). Returns an unsubscribe function. */
export function onWhisper(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** For tests: clear budgets. */
export function resetWhisper() {
  fired.clear();
}
