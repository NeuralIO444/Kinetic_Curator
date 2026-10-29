// statsLive.mjs — #1807: the buffer statistics' one wire (the ageLive
// pattern, #1805). The live loop publishes a snapshot per frame while
// its recipe requests stats — { stats, frame }: the latest stamped
// reading and the loop's own step count, which is the only honest clock
// a consumer can judge the reading's staleness against. Consumers (the
// show block's trail sampler, the ?debug=stats readout, the pressure
// governor) read the snapshot from here; none of them touches the GL
// object. No session, no snapshot: ACCUM off means the statistics are
// ABSENT, not zero (the silence-is-default law).
//
// The governor hook: App registers one pressure governor; every NEW
// stamped reading (the throttle beat, never per frame) is offered to it
// as an observation. Registration carries no actuation — the governor's
// own flag decides what its reports mean (v1 ships data-only).

export const DEBUG_STATS =
  typeof window !== 'undefined' &&
  !!window.location &&
  new URLSearchParams(window.location.search || '').get('debug') === 'stats';

let snapshot = null; // { stats: {frame, energy, channels, saturation}, frame } | null
let consumerWanted = false;
let governor = null;
let lastGovernorFrame = -1;

/** A standing consumer (the show block's sampler exists for the app's
 *  lifetime) declares its interest once; the live loop reads the flag
 *  per frame when it builds the recipe. */
export function requestStats() {
  consumerWanted = true;
}

/** Whether any consumer wants the statistics this frame: a registered
 *  consumer, or the backstage readout's URL flag. */
export function statsWanted() {
  return consumerWanted || DEBUG_STATS;
}

/** Register (or clear, with null) the pressure governor that observes
 *  each new stamped reading. A throwing governor is dropped — an
 *  observer must never fault the wire it only watches. */
export function setStatsGovernor(g) {
  governor = g || null;
  lastGovernorFrame = -1;
}

/** The live loop's per-frame publish: the accum object's latest reading
 *  plus its current step count. Cheap closure reads; called only while
 *  the recipe requests stats. */
export function publishStatsSnapshot(accumObj) {
  if (!accumObj) return;
  const stats = accumObj.readStats();
  snapshot = { stats, frame: accumObj.statsFrame() };
  if (governor && stats && stats.frame !== lastGovernorFrame) {
    lastGovernorFrame = stats.frame;
    try {
      governor.observe(stats, snapshot.frame);
    } catch {
      governor = null;
    }
  }
}

/** The latest snapshot, or null when no stats-requesting session is
 *  live. `stats` inside it may itself be null (session running, first
 *  throttle beat not yet reached) — absence all the way down. */
export function getStatsSnapshot() {
  return snapshot;
}

/** The registered governor's latest report (data-only in v1), or null. */
export function getStatsGovernorReport() {
  try {
    return governor ? governor.report() : null;
  } catch {
    return null;
  }
}

/** The session ended (ACCUM off): the wire carries nothing again. */
export function clearStatsSnapshot() {
  snapshot = null;
  lastGovernorFrame = -1;
}
