// stressLive.js — #1354: the stress tracker, fed by the live instrument's honest signals. A module singleton.
//
// CONSUMED, as of Phase 2 S5: the creature's posture reads the band + smoothed value (liveLoop stamps
// them on the resolver input; engine/creaturePose.js poses from them). Davis, LOIS and the Queen still
// do not read it (Phase 4). Matt watches it on the ?debug=stress readout, and the thresholds are tuned
// from real sessions (#1635's occupancy evidence).
//
// Signals, per presented frame while the instrument is running:
//   activity  real artist actions (loisActivity.beat() calls) inside the last ACTIVITY_WINDOW_FRAMES frames
//   taste     the artist's own rolls since the last keep (loisActivity passRun; EVOLVE fires do not count)
//   dish      how crowded the dish is around the canvas pins (curator/dishPressure.js). 0 with no pins, and 0 when
//             no reader is given: said, not faked.
// Everything is a COUNT over frames or actions. No clock (KC-1 DS: no timers with opinions).
import { createStressTracker, activityPressure, tasteWithVerdicts } from './stress.js';

export const ACTIVITY_WINDOW_FRAMES = 120;
// #1635 — the session's telemetry rides the state: `occupancy` counts the frames presented in each band and
// `crossings` the band changes between them, so a session can be read backstage (the ?debug=stress readout)
// and the 0.28 / 0.72 edges tuned from evidence instead of feel. Zero here; a live session's counters are
// its own objects, built in initStress — this frozen shape is only the never-started / stopped state.
export const NEUTRAL_STRESS = Object.freeze({
  stress: 0, smoothed: 0, band: null, activity: 0, dish: 0, taste: 0, frames: 0,
  occupancy: Object.freeze({ relax: 0, normal: 0, tighten: 0 }), crossings: 0,
});

let live = NEUTRAL_STRESS;
let tap = null;

/**
 * Observe every tracker update: fn({ activity, dish, taste, band }). One listener (or null). The performance
 * recorder uses it so a take carries its stress signals and band changes. A throwing listener is dropped.
 */
export function setStressTap(fn) {
  tap = typeof fn === 'function' ? fn : null;
}

/** The latest reading: { stress, smoothed, band, activity, dish, taste, frames, occupancy, crossings } —
 *  the session's #1635 telemetry (frames per band, band changes). band is null before the first frame. */
export function getStressState() {
  return live;
}

/**
 * Start tracking. `getCounts()` returns { activityCount, passRun } (loisActivity.pressureCounts); `isRunning()` says
 * whether the instrument is presenting frames; `getDish()` returns dish pressure 0..1 (optional); `raf`/`caf`
 * default to the window's. Returns a stop function.
 * Injected so the module stays framework-free and testable.
 */
export function initStress({ getCounts, isRunning, getDish, raf, caf } = {}) {
  const req = raf || (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
  const cancel = caf || (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null);
  const tracker = createStressTracker();
  const ring = new Uint16Array(ACTIVITY_WINDOW_FRAMES); // actions per frame, over the window
  let head = 0;
  let windowSum = 0;
  let lastCount = null;
  let frames = 0;
  let handle = 0;
  // #1635 session telemetry: frames presented in each band, and the crossings between bands. Counted here,
  // where every presented frame passes, from the tracker's own band — never re-derived from the raw value.
  const occupancy = { relax: 0, normal: 0, tighten: 0 };
  let crossings = 0;
  let prevBand = null;
  const step = () => {
    let counts;
    try {
      counts = getCounts();
    } catch {
      return; // a feed that cannot be read is no reading: the last one stands
    }
    const count = Number.isFinite(counts && counts.activityCount) ? counts.activityCount : 0;
    const fresh = lastCount === null ? 0 : Math.max(0, Math.min(65535, count - lastCount));
    lastCount = count;
    windowSum += fresh - ring[head];
    ring[head] = fresh;
    head = (head + 1) % ACTIVITY_WINDOW_FRAMES;
    const activity = activityPressure(windowSum);
    const taste = tasteWithVerdicts(counts && counts.passRun, counts && counts.verdicts); // #1753
    let dish = 0;
    if (getDish) {
      try { const d = getDish(); if (d > 0) dish = Math.min(1, d); } catch { dish = 0; } // unreadable = no pressure
    }
    const r = tracker.update({ activity, dish, taste });
    frames += 1;
    if (r.band !== null) {
      occupancy[r.band] += 1;
      if (prevBand !== null && r.band !== prevBand) crossings += 1;
      prevBand = r.band;
    }
    live = { stress: r.stress, smoothed: r.smoothed, band: r.band, activity, dish, taste, frames, occupancy, crossings };
    if (tap !== null) {
      try { tap({ activity, dish, taste, band: r.band }); } catch { tap = null; }
    }
  };
  const loop = () => {
    handle = req(loop);
    let running;
    try { running = isRunning ? !!isRunning() : true; } catch { running = false; }
    if (running) step();
  };
  if (req) handle = req(loop);
  return () => {
    if (cancel && handle) cancel(handle);
    live = NEUTRAL_STRESS;
  };
}

/** True when the page was opened with ?debug=stress (the readout mounts only then). */
export const DEBUG_STRESS =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'stress';
