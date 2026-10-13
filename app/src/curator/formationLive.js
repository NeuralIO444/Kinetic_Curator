// formationLive.js — #1355 Phase 3 step 3: the formation rule, fed by the live instrument. A module singleton.
//
// NOTHING IS BUILT YET: this only decides when each pinned spore would become a creature (step 4, the moth, is what
// assembles one). The ?debug=stress readout shows it, and a take records it, so the thresholds can be tuned.
//
// Per resolved frame (the resolver frame tap, gl/resolveTap.mjs — the same one dish pressure reads):
//   pins        the frame's own dish pins (scene coords: they are a resolver input, so a take records them for free)
//   attraction  the fertility field at each pin (curator/formation.js), from the frame's seed and seed offsets
//   density     each pin's dish pressure (curator/dishPressure.js pinPressures), from what the resolver placed
//   band        the live stress band (curator/stressLive.js)
// All quantized before the tracker sees them, so a take's record replays to the same `hierarchy-form` events.
import { createFormationTracker, fertilityField, quantizeSignal } from './formation.js';
import { pinPressures } from './dishPressure.js';
import { sanitizePins } from './dishPins.js';
import { getStressState } from './stressLive.js';
import { createLimbTracker } from './limbs.js';
import { createShiftTracker } from './davisShift.js';

let tracker = createFormationTracker();
const limbTracker = createLimbTracker();
let limbs = [];
const shiftTracker = createShiftTracker();
let traits = [];
let shiftTap = null;
let tap = null;
let latest = Object.freeze({ states: [], band: null });
let field = null;
let fieldKey = '';

/** A take's recorder: `fn(update, events)` gets every tracker update, or null to stop. */
export function setFormationTap(fn) {
  tap = typeof fn === 'function' ? fn : null;
}

/** The latest per-pin states: [{ x, y, hold, formed, attraction, density }] and the band they were judged in. */
export function getFormationState() {
  return latest;
}

/** Which pins have formed, per pin, as of the last resolved frame: the NEXT frame's input carries it (the moth reads it). */
export function getFormedPins() {
  return latest.states.map((s) => !!(s && s.formed));
}

/** Pairs of wings per pin (1 or 2) as of the last resolved frame: the NEXT frame's input carries it (the moth reads it). */
export function getLimbPairs() {
  return limbs;
}

/** Each formed pin's traits (Davis's shifts, made once at birth), as of the last resolved frame; null for an unformed pin. */
export function getPinTraits() {
  return traits;
}

/** Observe Davis's birth shifts: fn(born) for frames that made any (the `davis-shift` events). One listener (or null). */
export function setShiftTap(fn) {
  shiftTap = typeof fn === 'function' ? fn : null;
}

/** Start over (tests; and a take starts from fresh formation state, like the fresh resolver `rec` asks for). */
export function resetFormation() {
  tracker = createFormationTracker();
  latest = Object.freeze({ states: [], band: null });
  limbTracker.reset();
  limbs = [];
  shiftTracker.reset();
  traits = [];
}

/** The resolver frame tap. `getBand` is injectable for tests; live it is the stress tracker's band. */
export function observeFormation(input, output, getBand = () => getStressState().band) {
  const pins = sanitizePins(input && input.dishPins);
  const W = input && input.canvasW; const H = input && input.canvasH;
  let attraction = [];
  if (pins.length) {
    const key = JSON.stringify([input.seed >>> 0, input.seedOffsets ?? null, W, H]);
    if (key !== fieldKey) { field = fertilityField(input.seed, input.seedOffsets, W, H); fieldKey = key; }
    attraction = pins.map((p) => quantizeSignal(field.at(p.x, p.y)));
  }
  const density = pinPressures(pins, output, W, H).map(quantizeSignal);
  const band = getBand() ?? null;
  const u = { pins, attraction, density, band };
  const r = tracker.update(u);
  latest = Object.freeze({
    band,
    states: r.states.map((s, i) => (s ? { ...s, attraction: attraction[i], density: density[i] } : null)),
  });
  limbs = limbTracker.update(latest.states);
  const shifted = shiftTracker.update(latest.states, { seed: input && input.seed, seedOffsets: input && input.seedOffsets, band });
  traits = shifted.traits;
  if (shifted.born.length && shiftTap) { try { shiftTap(shifted.born); } catch { shiftTap = null; } }
  if (tap) tap(u, r.events);
  return r;
}
