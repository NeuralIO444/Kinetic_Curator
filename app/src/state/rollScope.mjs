// rollScope.mjs — MODE/MOTION chips as roll-scope modifiers (#964).
//
// The ModeStrip chips no longer select composition/motion outright. They arm
// a roll scope: the armed MODE pins the layout mode (and keeps the
// composition too), the armed MOTION pins the motion numbers. The next
// KINETIC roll reworks everything else ("more like this, but different").
// No chips armed → today's full-freedom roll.
//
// Arms persist until disarmed — the fast, performance-friendly version of
// the Build panel's locks. Arms win over whatever a roll deals (and over
// lockedParams for their keys): the arm is the most recent explicit gesture.
//
// Pure and wall-clock-free so the pinning rule is unit-testable without a
// store (see rollScope.selfcheck.mjs).
import { MOTION_MODES } from '../data/voices.js';

/** The layoutParams keys a motion mode owns. Union of every MOTION_MODES entry's params. */
export const MOTION_KEYS = Object.freeze(['behave', 'lifeDrift', 'noiseSpeed', 'wind', 'flap', 'breath']);

/** The armed motion's params, or null when nothing (or an unknown id) is armed. */
export function armedMotionParams(armedMotion) {
  if (!armedMotion) return null;
  const m = MOTION_MODES.find((x) => x.id === armedMotion);
  return m ? { ...m.params } : null;
}

/**
 * Pin the armed roll scope onto a layoutParams object a roll is building.
 * Returns a new object; the input is untouched.
 * - armedMode: pin `mode` to the armed chip.
 * - armedMotion: overwrite the motion keys with the armed motion's numbers.
 */
export function pinRollScope(layoutParams, armedMode, armedMotion) {
  const next = { ...layoutParams };
  if (armedMode) next.mode = armedMode;
  const mp = armedMotionParams(armedMotion);
  if (mp) {
    for (const k of MOTION_KEYS) {
      if (mp[k] !== undefined) next[k] = mp[k];
    }
  }
  return next;
}
