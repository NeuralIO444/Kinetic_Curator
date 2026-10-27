// coldOpen.mjs — the top bar's first impression (#1103).
//
// On a cold open the two main verbs show their FULL names for a moment ([KINETIC] [CURATOR]), so a new person
// reads them once, then they cool down to [KIN] [CUR]. This is the one place that moment is defined: the
// length, who is spared it, and the (module-level) state every top-bar button reads, so it happens once per
// page load, not once per remount. Pure and DOM-free: the browser binds it in useColdOpen.js.

/**
 * Test hook: `window.__KC_HOLD_X` stretches every hold below. A starved CI runner (the watchdog trips at boot)
 * can take longer than a real 1.2 s just to reach the next assertion, so the e2e lengthens the window instead of
 * racing it. Unset (every real user) it is 1.
 */
export const hold = (ms) => ms * (Number(globalThis.__KC_HOLD_X) > 1 ? Number(globalThis.__KC_HOLD_X) : 1);

/** How long the verbs hold their full names. */
export const COLD_OPEN_MS = 2200;

/** How long a press (a K tap, a CURATOR roll) flashes the full name before it cools down. */
export const TAP_PULSE_MS = 1200;

/**
 * Should the cold open happen at all? Not for someone who asked for less motion, and not on a stage.
 * @param {{reducedMotion?: boolean, stage?: boolean}} env
 */
export const coldOpenWanted = ({ reducedMotion = false, stage = false } = {}) => !reducedMotion && !stage;

/** A tiny external store: `open` is true from start() until COLD_OPEN_MS later. */
export function createColdOpen({ ms = COLD_OPEN_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let open = false; let started = false; let timer = null;
  const listeners = new Set();
  const set = (v) => { if (open !== v) { open = v; listeners.forEach((f) => f()); } };
  return {
    /** Begin once. Returns whether it began (false when already begun, or unwanted). */
    start(env) {
      if (started) return false;
      started = true;
      if (!coldOpenWanted(env)) return false;
      set(true);
      timer = setTimer(() => { timer = null; set(false); }, ms);
      return true;
    },
    cancel() { if (timer != null) { clearTimer(timer); timer = null; } set(false); },
    get: () => open,
    subscribe: (f) => { listeners.add(f); return () => listeners.delete(f); },
  };
}
