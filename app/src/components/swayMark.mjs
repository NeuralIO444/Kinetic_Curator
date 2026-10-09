// swayMark.mjs — the presence mark's sway magnitude (#1258).
//
// Pure: sway view ({ temperatureDelta }) → 0..1 magnitude. The view is what
// the Director's tick already computes (M2's warming, scaled by the room's
// allowance); this only normalizes it for the mark. No UI strings here, and
// none of the deniability-list identifiers — the sway mechanics' selfcheck
// scans UI source for them.
const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * M2's maximum temperatureDelta: (M2_CAP 0.55 − M2_FLOOR 0.40) × allowance 1.0.
 * Kept as a literal (not imported) so this file never references her module.
 */
export const SWAY_MAGNITUDE_MAX = 0.15;

/**
 * Proposed visibility threshold — Matt decides on review (#1258). 0.02 means
 * any real warming shows the mark (temperatureDelta > 0.003); float dust
 * from a neutral view stays silent.
 */
export const SWAY_VISIBLE_THRESHOLD = 0.02;

/** Normalize a sway view to 0..1. Garbage in → 0, never throws. */
export function swayMagnitude(swayView) {
  const t = swayView && Number.isFinite(swayView.temperatureDelta) ? swayView.temperatureDelta : 0;
  return clamp01(t / SWAY_MAGNITUDE_MAX);
}

/** True when the mark should be present. Threshold is injectable for tests. */
export function swayVisible(swayView, threshold = SWAY_VISIBLE_THRESHOLD) {
  return swayMagnitude(swayView) > threshold;
}
