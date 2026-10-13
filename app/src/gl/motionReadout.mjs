// motionReadout.mjs — #1469: the engine's always-alive motion as seven 0..1 readings. Pure. It re-reads the same
// numbers the resolver's living-motion floor uses (patternAmounts) and the loop's own life breath; it adds no motion.
import { patternAmounts, rhythmTypeForPattern } from '../engine/kineme.js';

/** The life breath's span: |breathScale - 1| at this reads full (lifeDrift 1 swings about 0.012, the audio breath adds). */
export const LIFE_FULL = 0.06;
/** Wind reads full at this (the wind param's dial runs 0..3, 1 is the default). */
export const WIND_FULL = 3;
/** Palette breath reads full at this amount. */
export const PALETTE_FULL = 0.5;

const clamp01 = (v) => (Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0);

/**
 * @param a   { layoutParams, beatDrive, breathScale, reducedMotion, slowRender }
 * @param out an object to write into (so the loop allocates nothing per frame)
 * @returns out: { life, drift, breath, pulse, wind, rhythm, palette }
 */
export function motionReadout({ layoutParams, beatDrive = null, breathScale = 1, reducedMotion = false, slowRender = false }, out = {}) {
  const lp = layoutParams || {};
  if (slowRender) { // the governor froze motion (or the artist paused): honest zeros, not a ghost of the last frame
    out.life = 0; out.drift = 0; out.breath = 0; out.pulse = 0; out.wind = 0; out.rhythm = 0; out.palette = 0;
    return out;
  }
  const a = patternAmounts({ breath: lp.kinemeBreath, drift: lp.kinemeDrift, pulse: lp.kinemePulse }, lp.kinemePattern, beatDrive);
  out.life = clamp01(Math.abs((Number(breathScale) || 1) - 1) / LIFE_FULL);
  out.drift = clamp01(a.drift);
  out.breath = clamp01(a.breath);
  out.pulse = clamp01(a.pulse);
  out.wind = clamp01((Number(lp.wind) || 0) / WIND_FULL);
  out.rhythm = rhythmTypeForPattern(lp.kinemePattern) ? 1 : 0;
  out.palette = reducedMotion ? 0 : clamp01((Number(lp.kinemePaletteBreath) || 0) / PALETTE_FULL);
  return out;
}
