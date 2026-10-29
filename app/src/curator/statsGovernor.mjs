// statsGovernor.mjs — #1807: the pressure governor, the buffer statistics' second consumer.
// Saturation pressure (the fraction of the buffer above the #1801 knee) is a shed input the
// governor may one day act on: rising pressure pulls optics down BEFORE the ratchet bites —
// telemetry over prediction, measured not modelled. V1 SHIPS DATA-ONLY: the module observes
// every stamped reading, computes the optics scale it WOULD apply, and reports its sheds —
// but it is constructed disabled, and a disabled governor's scale is always exactly 1 (it
// cannot actuate anything). Actuation (applying the scale to the live recipe) turns on only
// when Matt has seen a session's worth of numbers and flips the flag — the #1635 evidence
// pattern. The scale law itself is complete and selfchecked here, so enabling it later is a
// flag flip, not a build.
//
// The law (deterministic, no clock, no memory beyond the last sample): at or below
// PRESSURE_WARN the scale is 1; it then falls linearly to SCALE_FLOOR at PRESSURE_DEEP —
// so on a rising blowout the pull-down BEGINS at 0.30 and is fully in before pressure
// crosses 0.50. Recovery is the same law read backwards: pressure falls, scale rises.
//
// Staleness (the issue's rule): a reading consumed older than STALE_MAX_FRAMES against the
// loop's step count is logged, never silently treated as current.
import { STALE_MAX_FRAMES } from './trailStats.js';

export const PRESSURE_WARN = 0.3;
export const PRESSURE_DEEP = 0.5;
export const SCALE_FLOOR = 0.25;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The optics scale the law assigns to a saturation pressure (enabled governors only). */
export function pressureScale(saturation) {
  const p = clamp01(Number.isFinite(saturation) ? saturation : 0);
  if (p <= PRESSURE_WARN) return 1;
  if (p >= PRESSURE_DEEP) return SCALE_FLOOR;
  return 1 - (1 - SCALE_FLOOR) * ((p - PRESSURE_WARN) / (PRESSURE_DEEP - PRESSURE_WARN));
}

/**
 * @param opts.enabled — the actuation flag. DEFAULT FALSE (data-only): observations and
 *   reports flow, the scale in every report is 1, and nothing anywhere is actuated.
 */
export function createPressureGovernor({ enabled = false } = {}) {
  let scale = 1;
  let lastFrame = -1;
  let lastSaturation = null;
  let observations = 0;
  const sheds = []; // { frame, saturation, scale } — downward scale moves an enabled governor made
  const stale = []; // { at, stamp, age } — consumptions of too-old readings
  /** { enabled, scale, saturation, observations, sheds, stale } — the show block / readout face. */
  const report = () => ({
    enabled,
    scale,
    saturation: lastSaturation,
    observations,
    sheds: sheds.slice(),
    stale: stale.slice(),
  });
  return {
    /**
     * Consume one stamped reading. `nowFrame` is the consumer-side step count (the loop's),
     * the only honest measure of the reading's age. Returns the current report.
     */
    observe(stats, nowFrame) {
      if (!stats || !Number.isFinite(stats.saturation) || !Number.isFinite(stats.frame)) return report();
      if (Number.isFinite(nowFrame) && nowFrame - stats.frame > STALE_MAX_FRAMES) {
        stale.push({ at: nowFrame, stamp: stats.frame, age: nowFrame - stats.frame });
        if (stale.length > 50) stale.shift();
      }
      if (stats.frame === lastFrame) return report(); // the same sample: no new decision
      lastFrame = stats.frame;
      lastSaturation = stats.saturation;
      observations += 1;
      const target = enabled ? pressureScale(stats.saturation) : 1;
      if (enabled && target < scale) {
        sheds.unshift({ frame: stats.frame, saturation: stats.saturation, scale: target });
        if (sheds.length > 20) sheds.pop();
      }
      scale = target;
      return report();
    },
    report,
  };
}
