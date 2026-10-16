// motionMeterTap.js — the STIMULI MOTION readout's read-only view of the live frame (#1469).
//
// Mirrors audioMeterTap: composition/motionLive.js publishes the resolved frame's living-motion
// levels here once per frame; panels/stimulus/MotionMeter.jsx reads them straight from its own
// rAF. Keeping the levels out of the React store means the readout never re-renders the app
// 60x a second. null = nothing has published yet (the strip reads flat, never missing).
let tap = null;

/** @param {{drift: number, breath: number, wind: number, rhythmPhase: number, rhythmType: string|null, wobble: number, mothBeat: number|null}|null} next */
export function setMotionMeterTap(next) {
  tap = next;
}

/** The latest published motion levels, or null before the first resolved frame. */
export function getMotionMeterTap() {
  return tap;
}

/**
 * The frame's motion levels (0..1 each; mothBeat is null when no moths are on stage), or null
 * when nothing has published yet. Read-only by contract: callers must not write to the result.
 */
export function readMotionLevels() {
  return tap;
}
