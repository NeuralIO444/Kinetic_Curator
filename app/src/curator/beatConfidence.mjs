// beatConfidence — detector confidence from attack peaks.
//
// A beat "attack" is an onset: beatPulse rises through the onset floor,
// peaks, then decays. Confidence is the spec's bar: the last two recorded
// attack peaks both ≥ 0.62. This module detects nothing on its own — the
// beat path feeds it pulses; it judges them.
//
// Neutral by design: no persona identifiers, no surfaces. queenLean.mjs
// (M3/M4) and MeterHero's amber both read it.
export const ATTACK_FLOOR = 0.3;
export const CONFIDENCE_BAR = 0.62;
export const PEAK_WINDOW = 4;
/**
 * #2091 (Matt's ruling): confidence lapses this many BARS after the last strong hit (about 4 s at 120 BPM). The tracker
 * has no bar clock of its own, so the caller passes loop time and the BPM with each push.
 */
export const CONFIDENCE_LAPSE_BARS = 2;
const DEFAULT_BPM = 120;

/** Two bars (CONFIDENCE_LAPSE_BARS) of 4 beats at this BPM, in ms. A bad BPM falls back to 120. */
export function lapseMsFor(bpm) {
  const b = Number(bpm);
  return (CONFIDENCE_LAPSE_BARS * 4 * 60000) / (Number.isFinite(b) && b > 0 ? b : DEFAULT_BPM);
}

/**
 * A beat-attack tracker. push(pulse) every frame with the 0..1 beatPulse;
 * read .confident for the two-attack bar. Deterministic and allocation-
 * light; safe to drive from a rAF loop.
 *
 * #2091: push(pulse, nowMs, bpm) also carries LOOP time (not the wall clock) and the BPM. Peaks never aged, so two
 * strong hits left `confident` true in a silent room for good. With nowMs given, the recorded peaks are dropped once
 * CONFIDENCE_LAPSE_BARS bars pass since the last attack, or when loop time runs backwards (a restarted loop), so
 * confidence needs two FRESH attacks to return. push(pulse) alone never lapses (the old call shape).
 */
export function createBeatTracker() {
  let peaks = [];
  let prev = 0;
  let rising = false;
  let peak = 0;
  let peakAt = 0; // loop time of the attack now rising
  let lastPeakAt = null; // loop time of the last recorded attack's peak
  const expire = (nowMs, bpm) => {
    const t = Number(nowMs);
    if (nowMs == null || !Number.isFinite(t) || lastPeakAt === null || !peaks.length) return;
    const elapsed = t - lastPeakAt;
    if (elapsed < 0 || elapsed > lapseMsFor(bpm)) {
      peaks = [];
      lastPeakAt = null;
    }
  };
  return {
    /** Drop stale peaks without a new sample (a reader that only has the clock: the Director's tick). */
    expire,
    push(pulse, nowMs, bpm) {
      const t = Number(nowMs);
      const timed = nowMs != null && Number.isFinite(t);
      expire(nowMs, bpm);
      const p = Number(pulse);
      const v = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
      if (!rising && v > prev && v >= ATTACK_FLOOR) {
        rising = true;
        peak = v;
        peakAt = timed ? t : 0;
      } else if (rising) {
        if (v > peak) {
          peak = v;
          peakAt = timed ? t : peakAt;
        }
        if (v < ATTACK_FLOOR || v < peak * 0.5) {
          peaks.push(peak);
          if (timed) lastPeakAt = peakAt;
          if (peaks.length > PEAK_WINDOW) peaks.shift();
          rising = false;
          peak = 0;
        }
      }
      prev = v;
    },
    get peaks() {
      return [...peaks];
    },
    get confident() {
      if (peaks.length < 2) return false;
      const [a, b] = peaks.slice(-2);
      return a >= CONFIDENCE_BAR && b >= CONFIDENCE_BAR;
    },
    reset() {
      lastPeakAt = null;
      peakAt = 0;
      peaks = [];
      prev = 0;
      rising = false;
      peak = 0;
    },
  };
}

/** Pure two-attack bar over recorded peaks (for tests and one-shot use). */
export function confidentFromPeaks(peaks) {
  if (!Array.isArray(peaks) || peaks.length < 2) return false;
  const [a, b] = peaks.slice(-2);
  return a >= CONFIDENCE_BAR && b >= CONFIDENCE_BAR;
}
