// formation.js — #1355 Phase 3 step 3: the formation rule. Pure: no clock, no store, nothing rendered.
//
// docs/design/wet-lab-plan.md: a pin marks a spore. A spore becomes a creature only when BOTH hold:
//   ATTRACTION  the dish's fertility at the pin (a seeded noise field: Matt's decision 6, "a pin in a fertile patch
//               forms, a pin in a barren patch waits"; nothing from the pointer, so it replays exactly)
//   DENSITY     how crowded the dish is around that pin (curator/dishPressure.js pinPressures)
// each clearing a threshold set by the current stress BAND (roadmap Phase 2 table: hierarchy formation is easiest in
// RELAX, normal in NORMAL, harder in TIGHTEN). Matt (2026-10-12):
//   - both conditions must hold for FORM_HOLD_FRAMES consecutive frames (a mark brushing past does not form one)
//   - once formed, a creature STAYS formed until its pin moves or is removed (step 5 is where a creature changes)
// Every window is counted in frames. The thresholds are the roadmap's open tunables: the take's formation record
// (below) and the ?debug=stress readout are how they get tuned.
//
// THE LOG IS THE AUTHORITY (decision 1). The live tracker is fed QUANTIZED signals; a take records those signals
// (run-length) and every `hierarchy-form` event. Replay feeds the recorded signals through a fresh tracker and
// checks it produces the same events: the recorded events win, replay proves they follow.
import { makeNoiseField } from '../engine/kernel/field/index.js';
import { noiseSeedFor } from '../engine/kernel/rng.js';
import { BAND_RELAX, BAND_NORMAL, BAND_TIGHTEN } from './stress.js';

/** Consecutive frames both conditions must hold. */
export const FORM_HOLD_FRAMES = 30;
/**
 * Band thresholds. Attraction: the fertility field's measured distribution puts these at about the top 60 / 40 / 25%
 * of the dish (p40 0.47, p60 0.54, p75 0.61 over 40 seeds). Density: a share of dish-pressure saturation (24 marks).
 * No band yet (the tracker has not run) reads as NORMAL.
 */
export const FORM_THRESHOLDS = Object.freeze({
  [BAND_RELAX]: Object.freeze({ attraction: 0.47, density: 0.25 }),
  [BAND_NORMAL]: Object.freeze({ attraction: 0.55, density: 0.4 }),
  [BAND_TIGHTEN]: Object.freeze({ attraction: 0.61, density: 0.6 }),
});
/** Logged signal resolution. */
export const FORM_STEPS = 1000;
/** XOR'd into the noise seed so fertility is its own map, not the noise sampler's placement field. */
const FERTILITY_SALT = 0x5ee0f00d;

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
export const quantizeSignal = (v) => Math.round(clamp01(v) * FORM_STEPS) / FORM_STEPS;

/** The thresholds for a band (null / unknown -> NORMAL). */
export function thresholdsFor(band) {
  return FORM_THRESHOLDS[band] || FORM_THRESHOLDS[BAND_NORMAL];
}

/** Do both conditions clear the band's thresholds? (Strictly above, so a value sitting on the line waits.) */
export function conditionsHold(attraction, density, band) {
  const t = thresholdsFor(band);
  return clamp01(attraction) > t.attraction && clamp01(density) > t.density;
}

/**
 * The dish's fertility field for a seed: `at(x, y)` in scene units -> 0..1. Rides the NOISE sub-seed stream, so
 * re-rolling noise moves the fertile patches and nothing else does.
 */
export function fertilityField(seed, seedOffsets, canvasW, canvasH) {
  const f = makeNoiseField((noiseSeedFor(seed >>> 0, seedOffsets) ^ FERTILITY_SALT) >>> 0);
  const w = canvasW > 0 ? canvasW : 1;
  const h = canvasH > 0 ? canvasH : 1;
  return { at: (x, y) => f.sample(x / w, y / h) };
}

const samePin = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;

/**
 * The tracker. `update({ pins, attraction, density, band })` takes the pins (scene coords, in order) and one
 * attraction and one density per pin (already quantized), and returns `{ states, events }`:
 *   states  per pin { x, y, hold, formed }
 *   events  [{ type: 'hierarchy-form', pin, x, y }] for spores that formed on this update
 * A pin that moved, or a slot that emptied, starts over as a spore.
 */
export function createFormationTracker() {
  let slots = []; // [{ x, y, hold, formed }]
  return {
    update({ pins = [], attraction = [], density = [], band = null } = {}) {
      const events = [];
      const next = [];
      for (let i = 0; i < pins.length; i++) {
        const p = pins[i];
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) { next.push(null); continue; }
        const prev = samePin(slots[i], p) ? slots[i] : null;
        const s = prev ? { ...prev } : { x: p.x, y: p.y, hold: 0, formed: false };
        if (!s.formed) {
          s.hold = conditionsHold(attraction[i], density[i], band) ? s.hold + 1 : 0;
          if (s.hold >= FORM_HOLD_FRAMES) {
            s.formed = true;
            events.push({ type: 'hierarchy-form', pin: i, x: s.x, y: s.y });
          }
        }
        next.push(s);
      }
      slots = next;
      return { states: slots.map((s) => (s ? { ...s } : null)), events };
    },
    states() { return slots.map((s) => (s ? { ...s } : null)); },
  };
}

// ── the take's record ───────────────────────────────────────────────────────────────────────────────────────────

export const FORMATION_RECORD_VERSION = 1;

const signalKey = (u) => JSON.stringify([u.pins.map((p) => (p ? [p.x, p.y] : null)), u.attraction, u.density, u.band]);

/**
 * Recorder: feed it every tracker update (the same quantized signals the tracker got) and the events that update
 * produced. `getFrame()` annotates; order is what replays. A take starts from FRESH formation state, the way `rec`
 * restarts the scene (dish spine step 4), so the record needs no initial state.
 */
export function createFormationRecorder({ getFrame = () => 0 } = {}) {
  const runs = []; // [frame, pins, attraction, density, band, n]
  const forms = []; // [frame, pin, x, y, update] — `update` is the tracker update's ordinal in the take: replay
  // must reproduce WHEN a spore formed, not just which one did
  let last = null;
  let lastKey = null;
  let ordinal = 0;
  return {
    update(u, events = []) {
      const frame = getFrame() | 0;
      const at = ordinal++;
      const key = signalKey(u);
      if (last && key === lastKey) last[5] += 1;
      else {
        last = [frame, u.pins.map((p) => (p ? { x: p.x, y: p.y } : null)), u.attraction.slice(), u.density.slice(), u.band ?? null, 1];
        lastKey = key;
        runs.push(last);
      }
      for (const e of events) if (e.type === 'hierarchy-form') forms.push([frame, e.pin, e.x, e.y, at]);
    },
    finish() {
      return {
        version: FORMATION_RECORD_VERSION,
        runs: runs.map((r) => [r[0], r[1].map((p) => (p ? { ...p } : null)), r[2].slice(), r[3].slice(), r[4], r[5]]),
        forms: forms.map((f) => f.slice()),
      };
    },
  };
}

/** Replay a record's signals through a fresh tracker: the `hierarchy-form` events they produce, as [pin, x, y, update]. */
export function replayFormation(record) {
  const t = createFormationTracker();
  const out = [];
  let at = 0;
  for (const [, pins, attraction, density, band, n] of record.runs) {
    for (let i = 0; i < n; i++, at++) {
      for (const e of t.update({ pins, attraction, density, band }).events) out.push([e.pin, e.x, e.y, at]);
    }
  }
  return out;
}

/**
 * Check a record: do its logged forms follow from its logged signals?
 * @returns {{ ok: boolean, forms: number, firstMismatch: number|null }}
 */
export function verifyFormationRecord(record) {
  if (!record || record.version !== FORMATION_RECORD_VERSION || !Array.isArray(record.runs) || !Array.isArray(record.forms)) {
    return { ok: false, forms: 0, firstMismatch: 0 };
  }
  const got = replayFormation(record);
  const want = record.forms.map((f) => [f[1], f[2], f[3], f[4]]);
  const n = Math.max(got.length, want.length);
  for (let i = 0; i < n; i++) {
    const a = got[i]; const b = want[i];
    if (!a || !b || a.some((v, k) => v !== b[k])) return { ok: false, forms: want.length, firstMismatch: i };
  }
  return { ok: true, forms: want.length, firstMismatch: null };
}
