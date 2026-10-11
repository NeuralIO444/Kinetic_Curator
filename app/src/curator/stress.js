// stress.js — #1354 (Phase 2): the stress value and its three bands. Pure: no clock, no store, no rendering.
//
// docs/ROADMAP_PETRI_DISH.md. Stress is a weighted sum of three HONEST signals, each already normalized to 0..1:
//   activity  performer activity (input events in a frame window)
//   dish      dish pressure (neighbour count / attraction around pinned heads)
//   taste     taste pressure (rolls since the last keep; the keeps-vs-passes ratio joins with #1173)
// INSTRUMENT LOAD IS NOT AN INPUT (decision 2): load is the governor's job, and a slow machine must not make
// different art. Nothing here reads time: every "window" is counted in frames or in actions (KC-1 DS: no timers with
// opinions).
//
// Bands: RELAX < 0.28 <= NORMAL <= 0.72 < TIGHTEN, with light smoothing and hysteresis so the band does not chatter
// at an edge. The numbers below are the roadmap's starting values and its OPEN TUNABLES: telemetry sets them later.
//
// THE LOG IS THE AUTHORITY (decision 1). The tracker reports band changes and the quantized stress value only when
// it changes; those are what get recorded, and on replay the recorded band is applied, not recomputed.

export const STRESS_WEIGHTS = Object.freeze({ activity: 0.38, dish: 0.38, taste: 0.24 });
export const BAND_RELAX = 'relax';
export const BAND_NORMAL = 'normal';
export const BAND_TIGHTEN = 'tighten';
export const BANDS = Object.freeze([BAND_RELAX, BAND_NORMAL, BAND_TIGHTEN]);
/** Band edges on the smoothed stress value. */
export const RELAX_BELOW = 0.28;
export const TIGHTEN_ABOVE = 0.72;
/** Open tunables (roadmap): the hysteresis gap straddles each edge; smoothing is an EMA over about this many frames. */
export const HYSTERESIS_GAP = 0.04;
export const SMOOTH_FRAMES = 12;
/** Logged stress resolution. */
export const STRESS_STEPS = 100;

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** The weighted sum. Missing or junk signals count as 0 (degrade by reduction). */
export function stressValue({ activity = 0, dish = 0, taste = 0 } = {}) {
  return clamp01(
    STRESS_WEIGHTS.activity * clamp01(activity) + STRESS_WEIGHTS.dish * clamp01(dish) + STRESS_WEIGHTS.taste * clamp01(taste),
  );
}

/** Taste pressure from an ACTION count: rolls since the last keep, saturating. Never a clock. */
export function tastePressure(rollsSinceKeep, saturation = 24) {
  if (!Number.isFinite(rollsSinceKeep) || rollsSinceKeep <= 0 || !(saturation > 0)) return 0;
  return clamp01(rollsSinceKeep / saturation);
}

/** Performer activity from an EVENT count inside a frame window, saturating. */
export function activityPressure(eventsInWindow, saturation = 12) {
  if (!Number.isFinite(eventsInWindow) || eventsInWindow <= 0 || !(saturation > 0)) return 0;
  return clamp01(eventsInWindow / saturation);
}

/** The band a smoothed value falls in with no history (the plain thresholds). */
export function bandFor(value) {
  const v = clamp01(value);
  return v < RELAX_BELOW ? BAND_RELAX : v > TIGHTEN_ABOVE ? BAND_TIGHTEN : BAND_NORMAL;
}

export const quantizeStress = (v) => Math.round(clamp01(v) * STRESS_STEPS) / STRESS_STEPS;

/**
 * The per-frame tracker. `update(signals)` once per frame returns
 *   { stress, smoothed, band, events }
 * where `events` lists what changed THIS frame and is what the performance log records:
 *   { type: 'band', band }     the band changed
 *   { type: 'stress', value }  the quantized smoothed stress changed
 * Same signal sequence in, same sequence out: no hidden state but the smoothed value and the band.
 */
export function createStressTracker({ smoothFrames = SMOOTH_FRAMES, hysteresis = HYSTERESIS_GAP } = {}) {
  const alpha = 2 / (Math.max(1, smoothFrames) + 1);
  const half = Math.max(0, hysteresis) / 2;
  let smoothed = null; // null until the first frame: the first value is taken as-is, not eased up from zero
  let band = null;
  let lastLogged = null;
  return {
    get band() { return band; },
    get smoothed() { return smoothed; },
    update(signals) {
      const stress = stressValue(signals);
      smoothed = smoothed === null ? stress : smoothed + (stress - smoothed) * alpha;
      const events = [];
      let next = band;
      if (band === null) {
        next = bandFor(smoothed);
      } else if (band === BAND_NORMAL) {
        // leaving NORMAL needs to clear the edge by half the gap
        if (smoothed < RELAX_BELOW - half) next = BAND_RELAX;
        else if (smoothed > TIGHTEN_ABOVE + half) next = BAND_TIGHTEN;
      } else if (band === BAND_RELAX) {
        // coming back needs to clear it the other way (and a big jump can cross both edges at once)
        if (smoothed > TIGHTEN_ABOVE + half) next = BAND_TIGHTEN;
        else if (smoothed > RELAX_BELOW + half) next = BAND_NORMAL;
      } else if (smoothed < RELAX_BELOW - half) {
        next = BAND_RELAX;
      } else if (smoothed < TIGHTEN_ABOVE - half) {
        next = BAND_NORMAL;
      }
      if (next !== band) {
        band = next;
        events.push({ type: 'band', band });
      }
      const q = quantizeStress(smoothed);
      if (q !== lastLogged) {
        lastLogged = q;
        events.push({ type: 'stress', value: q });
      }
      return { stress, smoothed, band, events };
    },
  };
}
