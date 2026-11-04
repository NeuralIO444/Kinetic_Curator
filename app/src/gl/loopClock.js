// loopClock.js — #808: the loop clock, readable outside React.
//
// liveLoop owns the counter (loopTimeMs, advanced per presented frame).
// App.jsx mirrors it here once per frame; slices and hooks read the mirror
// so interval math never touches Date.now(). The mirror starts at 0
// ("not observed yet") — readers must treat 0 as unknown, not as a stamp.

export const loopClock = {
  /** Loop ms at the last observed presented frame. 0 = not observed yet. */
  ms: 0,
  /**
   * #1935 — presented wall ms: real time between presented frames,
   * accumulated by liveLoop beside loopTimeMs (per-frame credit capped at
   * PRESENTED_FRAME_MAX_MS; rejected frames roll it back; it freezes while
   * the engine is HELD or the tab hidden because tick() does not run).
   * Unlike `ms`, 0 is a true zero (no frames presented yet), not "unknown":
   * readers use differences, and a difference against a not-yet-started
   * loop is honestly small. The gap `presentedMs − ms` growth is the
   * DRAGGING measure — simulation time falling behind the audience's clock.
   */
  presentedMs: 0,
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
 * - #1741: a normal fire carries the anchor by exactly one interval, so the
 *   frame's lateness is not kept and a tempo-locked clock (PHRASE METRO /
 *   EUCLID) holds the BEAT rate instead of rounding every period up a frame.
 *   Only a gap of two intervals or more counts as a thaw and re-anchors.
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
  const elapsed = loopMs - lastFire;
  if (elapsed >= 2 * intervalMs) {
    return { fire: true, lastFire: loopMs }; // thaw / big jump: fire once, re-anchor to now
  }
  if (elapsed >= intervalMs) {
    return { fire: true, lastFire: lastFire + intervalMs }; // #1741: carry, don't drift
  }
  return { fire: false, lastFire };
}
