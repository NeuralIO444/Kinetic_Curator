// tapeBudget.js (#342) — the tape-fill % shared between the PLAY readout
// (TapeCounter.jsx) and the track/FX-slot arm gate (layersSlice.js), so
// both read the exact same number instead of two formulas drifting apart.
//
// This is a proxy, not the per-track cost prediction #342's design doc
// describes ("estimates its cost via the existing measured cost tiers
// against the chosen ceiling") — that per-track estimator doesn't exist
// yet (gl/costTiers.mjs declares cost per GPU *effect*, not per track).
// What does exist, already measured and already displayed, is the current
// frame's real cost against the 60fps budget. Refusing to arm a new track
// while that's already at or past 100% is an honest, defensible reading
// of "pre-flight the budget" with today's instruments — not the full
// per-track estimate. Flagged for Matt's call per the issue.

/** The frame budget the tape measures against: one smooth 60fps frame. */
export const FRAME_BUDGET_MS = 1000 / 60;

/** Tape is fully spent: arming another track risks a stutter, not a shed. */
export const TAPE_FULL_PCT = 100;

/**
 * Live-measured frame cost against the 60fps budget, as a percentage.
 * Mirrors TapeCounter's fillPct exactly: GPU frame time when the patrol
 * has reported one, else the rAF-implied frame time from fps. 0 with no
 * data yet (never a false full).
 */
export function tapeFillPct(state) {
  const gpuMs = Number(state?.stageTimings?.gpuFrame) || 0;
  const fps = Number(state?.fps) || 0;
  const frameMs = gpuMs > 0 ? gpuMs : (fps > 0 ? 1000 / fps : 0);
  return frameMs > 0 ? (frameMs / FRAME_BUDGET_MS) * 100 : 0;
}

/**
 * Whether the tape is full enough to refuse a new track/FX slot.
 *
 * Gates on genuine GPU measurement only — never tapeFillPct's fps-derived
 * fallback. At exactly 60fps that fallback is mathematically pinned to
 * ~100% regardless of actual cost (frameMs === FRAME_BUDGET_MS by
 * construction), which would read "full" the instant the app boots and
 * fps has settled but no real frame has reported gpuFrame yet — refusing
 * to arm the very first track on a tautology, not a measurement. A false
 * "not full" costs nothing new (the existing shed ladder still catches an
 * over-budget track the old way); a false "full" blocks a performer for no
 * real reason, so the gate only ever trusts a real number.
 */
export function isTapeFull(state) {
  const gpuMs = Number(state?.stageTimings?.gpuFrame) || 0;
  if (gpuMs <= 0) return false;
  return (gpuMs / FRAME_BUDGET_MS) * 100 >= TAPE_FULL_PCT;
}
