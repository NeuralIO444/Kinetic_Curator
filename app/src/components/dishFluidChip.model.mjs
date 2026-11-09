// dishFluidChip.model.mjs — FERROFLUID chip (#1997): the dish family's chip posture for the fluid.
//
// One pure module the chip component renders and the headless lane verifies: the chip's state
// machine (off / arming / on / slowed / held — the dish-family vocabulary: DISH LIFE's glider
// chip carries the same slowed/held truth off its own shed), the help ids per state, and the
// performer's preference (on/off + the three dials), persisted per viewer like the dishLife
// pref ('kc.dishFluid.v1'). The MAGNET arm is NOT part of the pref: arming the hand is a
// moment, not a preference.

import { FLUID_SHED_RUNGS } from '../engine/dishFluid.mjs';

/** The localStorage key for the ferrofluid performer's preference. */
export const FERRO_PREF_KEY = 'kc.dishFluid.v1';

/** The default preference: the fluid off, the dials at the kernel's stamped defaults. */
export const FERRO_PREF_DEFAULTS = Object.freeze({ on: false, flow: 0.5, pull: 0.7, couple: 0.5 });

/**
 * The chip's state from the live facts: the mode's on/off, the hand's arming, and the
 * governor's rung (an index into the kernel's ladder; > 0 = shedding, last rung = held).
 */
export function ferroChipState({ on, arming, shed }) {
  if (!on) return 'off';
  if (arming) return 'arming';
  const rung = shed | 0;
  if (rung >= FLUID_SHED_RUNGS.length - 1) return 'held';
  if (rung >= 1) return 'slowed';
  return 'on';
}

/** Help-copy id per chip state (data/helpCopy.js, group 'Master'). */
export const FERRO_HELP = Object.freeze({
  off: 'ferro-off',
  arming: 'ferro-arming',
  on: 'ferro-on',
  slowed: 'ferro-slowed',
  held: 'ferro-held',
});

/** The chip's one-word state line. */
export function ferroStateWord(state) {
  return { off: 'off', arming: 'placing magnets', on: 'in the dish', slowed: 'slowed', held: 'held' }[state] || 'off';
}

const clamp01 = (v, dflt) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : dflt);

/** A stored preference, sanitized: missing/garbled reads as the defaults, field by field. Pure. */
export function sanitizeFerroPref(raw) {
  if (!raw || typeof raw !== 'object') return { ...FERRO_PREF_DEFAULTS };
  return {
    on: raw.on === true,
    flow: raw.flow === undefined ? FERRO_PREF_DEFAULTS.flow : clamp01(raw.flow, FERRO_PREF_DEFAULTS.flow),
    pull: raw.pull === undefined ? FERRO_PREF_DEFAULTS.pull : clamp01(raw.pull, FERRO_PREF_DEFAULTS.pull),
    couple: raw.couple === undefined ? FERRO_PREF_DEFAULTS.couple : clamp01(raw.couple, FERRO_PREF_DEFAULTS.couple),
  };
}

/** Read the stored preference (never throws; a private-mode failure reads as the defaults). */
export function loadFerroPref(storage) {
  try {
    const raw = storage && storage.getItem(FERRO_PREF_KEY);
    return sanitizeFerroPref(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...FERRO_PREF_DEFAULTS };
  }
}

/** Persist the preference (never throws — a full or blocked store just loses the nicety). */
export function saveFerroPref(storage, pref) {
  try {
    if (storage) storage.setItem(FERRO_PREF_KEY, JSON.stringify(sanitizeFerroPref(pref)));
  } catch {
    /* the pref is a nicety; the performance never depends on it */
  }
}
