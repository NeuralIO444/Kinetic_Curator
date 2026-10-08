// directorSense.mjs — the Director's eyes: session intensity 0..1 (#1145).
//
// L4D pattern: one hidden scalar, max-pooled across signals, decaying only
// when disengaged. Four inputs (Matt's call, 2026-10-08): audio/MIDI energy,
// keep/pass velocity, beat confidence, time-in-phase.
//
// Pure where possible: intensityFromSignals() is a pure function of the four
// normalized inputs. createIntensityTracker() holds the decaying state;
// module-level state lives in director.js's singleton, never here.

/** Intensity at/above this is a peak — the Director forces relax. */
export const INTENSITY_PEAK = 0.85;
/** Quiet decay: intensity falls toward 0 over this many seconds of disengagement. */
export const INTENSITY_DECAY_SECONDS = 60;
/** audio/MIDI above this counts as engaged — decay freezes while engaged. */
export const ENGAGE_FLOOR = 0.05;

const clamp01 = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
};

/**
 * The intensity scalar: max-pool across the four normalized inputs 0..1.
 * Max, not mean — the hottest signal sets the room (L4D watches the most-
 * stressed survivor, not the average).
 */
export function intensityFromSignals({ audio = 0, keepPass = 0, beat = 0, phaseTime = 0 } = {}) {
  return Math.max(clamp01(audio), clamp01(keepPass), clamp01(beat), clamp01(phaseTime));
}

/** Keeps-per-minute → 0..1. Two keeps a minute is hot; the scale saturates there. */
export function normalizeKeepPassVelocity(keepsPerMinute) {
  return clamp01(keepsPerMinute / 2);
}

/** Seconds since the last cool-down → 0..1, saturating at five minutes. */
export function normalizePhaseTime(seconds) {
  return clamp01(seconds / 300);
}

/**
 * The decaying intensity state. update() takes the raw signals and a
 * timestamp; intensity rises instantly to a hotter reading, falls linearly
 * toward 0 over INTENSITY_DECAY_SECONDS of quiet, and NEVER falls while
 * audio/MIDI is actively engaged (L4D: intensity never decays mid-combat).
 */
export function createIntensityTracker({ now = () => Date.now() } = {}) {
  let value = 0;
  let lastTs = now();
  return {
    update(signals = {}, nowTs = now()) {
      const target = intensityFromSignals(signals);
      const engaged = clamp01(signals.audio) > ENGAGE_FLOOR;
      const dt = Math.max(0, (nowTs - lastTs) / 1000);
      if (target >= value) {
        value = target;
      } else if (!engaged && dt > 0) {
        value = Math.max(0, value - dt / INTENSITY_DECAY_SECONDS);
      }
      // engaged && target < value → hold: frozen while the room is live.
      lastTs = nowTs;
      return value;
    },
    get value() {
      return value;
    },
    reset() {
      value = 0;
      lastTs = now();
    },
  };
}
