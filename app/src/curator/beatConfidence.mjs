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
 * A beat-attack tracker. push(pulse) every frame with the 0..1 beatPulse;
 * read .confident for the two-attack bar. Deterministic and allocation-
 * light; safe to drive from a rAF loop.
 */
export function createBeatTracker() {
  let peaks = [];
  let prev = 0;
  let rising = false;
  let peak = 0;
  return {
    push(pulse) {
      const p = Number(pulse);
      const v = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
      if (!rising && v > prev && v >= ATTACK_FLOOR) {
        rising = true;
        peak = v;
      } else if (rising) {
        if (v > peak) peak = v;
        if (v < ATTACK_FLOOR || v < peak * 0.5) {
          peaks.push(peak);
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
