/**
 * Fade law shared by live useAccumulationBuffer and studio.py --accum.
 * destination-in with rgba(0,0,0,keep), then source-over the new frame.
 */
export const DEFAULT_ACCUM_FADE = 0.88;

export function clampFade(fade) {
  const n = Number(fade);
  if (!Number.isFinite(n)) return DEFAULT_ACCUM_FADE;
  return Math.max(0, Math.min(0.99, n));
}
