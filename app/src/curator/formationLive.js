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
import { birthCentre } from './director.js'; // #1356 step 5: the nudge toward the recent keeps (hosted there, never a surface)
import { TRAIT_DEFAULTS } from '../engine/creature.js';

let tracker = createFormationTracker();
const limbTracker = createLimbTracker();
let limbs = [];
const shiftTracker = createShiftTracker();
let traits = [];
let shiftTap = null;
let roomProvider = null;
const keepRing = []; // session-only: the traits of the moths alive at each recent keep (never saved)
const KEEP_RING_CAP = 8;
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

let hosted = [];

/**
 * #1634 slice 2 — which pin hosts the DISH creature (the second family): the FIRST formed pin, and only
 * that one (the MVP is one creature; the other formed pins host moths). Computed from the same states the
 * moth reads, so it rides the NEXT frame's input beside dishFormed and replays from the take like it.
 */
export function getDishHosted() {
  return hosted;
}

/** Each formed pin's traits (Davis's shifts, made once at birth), as of the last resolved frame; null for an unformed pin. */
export function getPinTraits() {
  return traits;
}

/**
 * Where a moth's birth reads the room (Phase 4 step 3): fn() => { width, room } from the two Directors' live states.
 * Called only at a birth. Null = no room: the band's width as it was.
 */
export function setRoomProvider(fn) {
  roomProvider = typeof fn === 'function' ? fn : null;
}

/** A keep just landed: remember the traits of the moths alive now (a session ring; nothing without a moth). */
export function noteKeep() {
  const alive = traits.filter(Boolean).map((t) => ({ ...t }));
  if (!alive.length) return;
  keepRing.push(alive);
  while (keepRing.length > KEEP_RING_CAP) keepRing.shift();
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
  hosted = [];
  shiftTracker.reset();
  traits = [];
  keepRing.length = 0;
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
  hosted = latest.states.map((s, i) => !!(s && s.formed) && !latest.states.slice(0, i).some((p) => p && p.formed));
  const shifted = shiftTracker.update(latest.states, {
    seed: input && input.seed, seedOffsets: input && input.seedOffsets, band,
    room: () => { try { return roomProvider ? roomProvider() : null; } catch { return null; } },
    centre: (r) => birthCentre({ ring: keepRing, keeps: r && r.keeps, allowance: r && r.allowance, defaults: TRAIT_DEFAULTS }),
  });
  traits = shifted.traits;
  if (shifted.born.length && shiftTap) { try { shiftTap(shifted.born); } catch { shiftTap = null; } }
  if (tap) tap(u, r.events);
  return r;
}
