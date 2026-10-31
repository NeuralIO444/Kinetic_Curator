/** #1830 — the exposure model: the resolve read as one lighting system.
 *
 *  Matt's direction (2026-10-28): "Photoreal light. Graphic picture." — a
 *  cinematic photoreal exposure/lighting model at the resolve, while the
 *  picture stays graphic. This module names, owns and parameterises the
 *  stage order the resolve already runs; it bolts on no new filter and no
 *  new pass (governor Δ = 0: exposure is a uniform on the existing,
 *  never-shed resolve pass — see the renderer's pass registry).
 *
 *  THE COMPOSITION LAW (settled, #532 / #1801):
 *  the HDR buffer is shaped IN THE LOOP by the shipped light behaviours —
 *    #1800 spectral fade   — film-like colour aging, per-channel keep;
 *    #1801 highlight shoulder — the loop's invertible Reinhard shoulder
 *                            (knee 1.0, ceiling 2.5), there because ACES in
 *                            the loop was rejected: ACES is non-invertible
 *                            and compounds;
 *    #1803 palette halation — lens bleed tinted from the look's palette.
 *  The resolve is that buffer's ONLY exit, and inside it the order is:
 *    exposure (stops, this module) → filmic curve (ACES) → dither LAST.
 *  No filmic curve ever moves upstream of the resolve. ACES stays the
 *  curve family (#532's settled choice); a family change re-opens every
 *  golden and is a separate ruling, not part of this model.
 *
 *  EXPOSURE IS COUNTABLE: the performer's quantity is stops (EV), held on
 *  the authored detent table below — half stops from −2 to +2 — never a
 *  bare linear multiplier. The shader still receives a linear gain
 *  (u_exposure, applied pre-curve in resolveFs.mjs); stopsToGain is the
 *  one translation, and gain 1 at stops 0 is EXACT, so at rest every
 *  existing golden stays byte-identical.
 */

/** The detent table: half-stop steps, −2…+2 EV. Authored data, DS-style —
 *  fine enough to play, coarse enough to count. (Matt-overruleable.) */
export const EXPOSURE_STOPS = Object.freeze([-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2]);

export const EXPOSURE_STOPS_MIN = EXPOSURE_STOPS[0];
export const EXPOSURE_STOPS_MAX = EXPOSURE_STOPS[EXPOSURE_STOPS.length - 1];

/** Stops → linear gain. 2^stops; exactly 1 at stops 0. */
export function stopsToGain(stops) {
  return Math.pow(2, stops);
}

/** Linear gain → stops. Non-positive or non-finite gain has no stop value;
 *  it reads as 0 (the resting exposure) rather than poisoning the readout. */
export function gainToStops(gain) {
  return Number.isFinite(gain) && gain > 0 ? Math.log2(gain) : 0;
}

/** Clamp + snap a candidate value onto the detent table. Ties land on the
 *  LOWER detent (the modeStops precedent). Non-finite input rests at 0. */
export function snapExposureStops(value) {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.min(EXPOSURE_STOPS_MAX, Math.max(EXPOSURE_STOPS_MIN, value));
  let best = EXPOSURE_STOPS[0];
  for (const stop of EXPOSURE_STOPS) {
    if (Math.abs(stop - clamped) < Math.abs(best - clamped)) best = stop;
  }
  return best;
}

/** The TE readout: the stop value itself, signed, in EV. */
export function formatExposureStops(stops) {
  const s = snapExposureStops(stops);
  if (s === 0) return '0 EV';
  return s > 0 ? `+${s.toFixed(1)} EV` : `−${Math.abs(s).toFixed(1)} EV`;
}

/** Narkowicz ACES constants — copied from resolveFs.mjs (the shader is the
 *  source of truth; exposureModel.selfcheck pins this mirror to its text). */
export const ACES_NARKOWICZ = Object.freeze({ a: 2.51, b: 0.03, c: 2.43, d: 0.59, e: 0.14 });

/** JS mirror of the shader's acesNarkowicz for one channel (CPU probes and
 *  selfchecks — the #1801 pattern of GPU pass and JS mirror sharing one
 *  source of truth). Input is the EXPOSED value (gain already applied). */
export function acesNarkowiczMirror(x) {
  const { a, b, c, d, e } = ACES_NARKOWICZ;
  const v = (x * (a * x + b)) / (x * (c * x + d) + e);
  return Math.min(1, Math.max(0, v));
}

/** One pixel through the model's curve stage: exposure in stops, then
 *  ACES — the resolve's order (dither is presentation grain, not part of
 *  the lighting model, and stays out of the mirror). */
export function resolveCurveMirror(rgb, stops) {
  const gain = stopsToGain(snapExposureStops(stops));
  return [acesNarkowiczMirror(rgb[0] * gain), acesNarkowiczMirror(rgb[1] * gain), acesNarkowiczMirror(rgb[2] * gain)];
}
