/**
 * #819 leftover. Clamp only — not the trail recipe.
 * The 2D destination-in fade (rgba keep, then source-over) is gone.
 * Live and studio stills both run accum.mjs (light *= keep). Nothing
 * imports this module except its selfcheck.
 */
export const DEFAULT_ACCUM_FADE = 0.88;

export function clampFade(fade) {
  const n = Number(fade);
  if (!Number.isFinite(n)) return DEFAULT_ACCUM_FADE;
  return Math.max(0, Math.min(0.99, n));
}
