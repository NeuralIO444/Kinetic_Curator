// loopClock.js — #808: the loop clock, readable outside React.
//
// liveLoop owns the counter (loopTimeMs, advanced per presented frame).
// App.jsx mirrors it here once per frame; slices and hooks read the mirror
// so interval math never touches Date.now(). The mirror starts at 0
// ("not observed yet") — readers must treat 0 as unknown, not as a stamp.

/** Loop ms at the last observed presented frame. 0 = not observed yet. */
export const loopClock = {
  ms: 0,
};

/**
 * Pure loop-time interval accumulator (#808).
 *
 * `lastFire` is the loop-ms of the last fire (< 0 = not yet armed).
 * Returns `{ fire, lastFire }`.
 *
 * - A held clock (freeze, pause, rejected frame) never fires: wall time is
 *   not an input, so a freeze gap credits nothing.
 * - A huge loop-time jump (thaw) fires AT MOST once: the accumulator
 *   re-anchors to now instead of crediting the gap as catch-up bursts.
 * - A rolled-back clock re-arms instead of stalling on a stale anchor.
 */
export function loopIntervalTick(lastFire, loopMs, intervalMs) {
  // No usable clock (not observed yet, or the mirror's 0): hold the anchor.
  if (!Number.isFinite(loopMs) || loopMs <= 0 || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    return { fire: false, lastFire };
  }
  if (!Number.isFinite(lastFire) || lastFire < 0) {
    return { fire: false, lastFire: loopMs }; // arm on first observed frame
  }
  if (loopMs < lastFire) {
    return { fire: false, lastFire: loopMs }; // clock rolled back — re-arm
  }
  if (loopMs - lastFire >= intervalMs) {
    return { fire: true, lastFire: loopMs };
  }
  return { fire: false, lastFire };
}
