// lightAudio.mjs — apply the #790 light.intensity route output to the contract sun.
//
// The route output is in "sun units" (0..1, the same natural units as the
// existing render.sun engine id); it rides on top of the contract light's
// base intensity as a multiplier around it: 0 leaves today's intensity
// exactly as built, and the full 1.0 output pushes the sun to 2.5x its base
// ("louder/brighter bands push the light hotter"). The final intensity is
// clamped to [0, 2.5x base] — never negative, never non-finite. A null or
// absent contract light (the sun is OFF) stays off: audio never conjures a
// sun, and a zero base intensity stays zero.
//
// 0 (no route in the table / default table) leaves the contract untouched, so
// today's render is bit-identical. The GL shader multiplies u_sunLight.a
// straight into the lighting term (and the fragment output is min-capped),
// so a >1 intensity just saturates toward the mark's own alpha — it cannot
// blow the frame out.

/** The hottest the route may push the sun, as a multiple of base intensity. */
export const LIGHT_AUDIO_MAX_MUL = 2.5;

/** Clamp a route sun output to finite sun units. Never trust the caller. */
export function sanitizeLightAudio(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * Scale the contract sun's intensity by the audio route output.
 * Mutates contract.light.intensity in place (like applyHueAudio); a missing
 * or non-numeric base intensity, or an absent light, is left alone.
 * Returns the applied output (0 = untouched).
 */
export function applyLightAudio(contract, sunAudio) {
  const out = sanitizeLightAudio(sunAudio);
  if (out === 0) return 0;
  const light = contract && contract.light;
  if (!light) return 0;
  const base = Number(light.intensity);
  if (!Number.isFinite(base) || base < 0) return 0;
  const hot = base * (1 + (LIGHT_AUDIO_MAX_MUL - 1) * out);
  light.intensity = Math.min(LIGHT_AUDIO_MAX_MUL * base, Math.max(0, hot));
  return out;
}
