// modeStops.mjs — #1607 (Strata Q Phase 1): the pure half of the mode row.
//
// The stop table itself is authored data in data/layout-modes.js
// (PARAM_STOPS, beside PARAM_SPEC). This module is the arithmetic the
// ModeRow component renders by: which mode a stored value lights, and
// whether the value sits exactly on a stop. Stored values stay continuous
// (the data law) — a dice-authored 0.37 lights its NEAREST mode and wears
// the off-detent mark; only a hand tap on a mode writes a stop value.
//
// Nearest is by absolute distance in the param's own units, ties to the
// LOWER mode (the shift layer's precedent, shiftLayer.mjs). Stops are
// listed in effect order, which for identity-class params (damping,
// glassAlpha) descends numerically — the search does not assume order.
import { PARAM_STOPS } from '../../../data/layout-modes.js';

/** The four modes, in row order. Ids are the stored vocabulary; labels render upper-case (TE). */
export const MODE_IDS = Object.freeze(['off', 'low', 'mid', 'high']);
export const MODE_OPTIONS = Object.freeze(MODE_IDS.map((id) => ({ id, label: id.toUpperCase() })));

/** The authored stops for a shelf param key, or null when the param has none. */
export function stopsFor(key) {
  const entry = PARAM_STOPS[key];
  return entry ? entry.stops : null;
}

// Mode taps write the stop constants themselves, and normalizeLayoutParams
// passes them through unrounded (non-int params), so an on-detent value
// compares equal to its stop bit-for-bit. The epsilon only absorbs the
// arithmetic a caller might do on the way in (percent round-trips).
const EPS = 1e-9;

/**
 * The display state of a mode row for a stored value:
 * { index, id, exact } — the nearest mode, and whether the value IS that
 * stop (exact) or merely nearest to it (the row then wears the off-detent
 * mark: the lit mode carries a dot, DS §2.1). Null when there is nothing
 * to light (no stops, or a non-finite value).
 */
export function modeStateFor(stops, value) {
  if (!stops || !Number.isFinite(value)) return null;
  let index = 0;
  let best = Infinity;
  let exact = false;
  stops.forEach((stop, i) => {
    const d = Math.abs(stop - value);
    if (d <= EPS) exact = true;
    if (d < best - EPS) {
      best = d;
      index = i;
    }
  });
  return { index, id: MODE_IDS[index], exact };
}
