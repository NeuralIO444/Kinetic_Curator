// watchdogLaw — the pure law of the watchdog hard stop's resume contract
// (#2481, Matt's rulings 2026-11-24). Kept pure (no React, no store) like
// hooks/governorCuts.js, so every clause is unit-testable:
// state/watchdogLaw.selfcheck.mjs pins this module, and
// state/watchdog.selfcheck.mjs pins the slice wiring that consumes it.
//
// The three rulings this module serves:
//   1. Grace period — a manual resume (RUN or Space) takes effect
//      instantly, and the watchdog cannot re-trip for a few seconds
//      while the loop settles. The slice arms the deadline
//      (watchdogGraceUntil) at the #264 manual-resume point; the
//      governor's trip paths consult inWatchdogGrace before tripping.
//   2. Space is a global resume while PERF PAUSED is up — from anywhere
//      in the app except a text field (shouldSpaceResume).
//   3. The pill and the log show the watchdog's OWN measurement — the
//      reading it acted on (the *WatchdogReading builders + formatters),
//      never a display fps that contradicts it.

/**
 * How long after a manual resume the watchdog may not re-trip, in ms.
 * One named constant, per the ruling: long enough for the loop to
 * settle (rebakes, first frames) and for the performer to see the
 * resume land; short enough that a genuinely drowning loop is stopped
 * again in seconds, not minutes. The governor's own sustain windows
 * (800 ms critical, 4 s crawl) still apply after the grace expires —
 * the earliest perf re-trip is grace + the path's own window.
 */
export const WATCHDOG_RESUME_GRACE_MS = 5000;

/** The grace deadline for a manual resume at `resumeAtMs`. */
export function watchdogGraceDeadline(resumeAtMs) {
  return Number.isFinite(resumeAtMs) ? resumeAtMs + WATCHDOG_RESUME_GRACE_MS : 0;
}

/**
 * Is `nowMs` inside the grace window ending at `graceUntilMs`?
 * A missing/expired deadline (null, 0, NaN, in the past) is never grace.
 */
export function inWatchdogGrace(nowMs, graceUntilMs) {
  return Number.isFinite(nowMs) && Number.isFinite(graceUntilMs) && graceUntilMs > 0 && nowMs < graceUntilMs;
}

/**
 * The form-control targets whose Space belongs to the control itself,
 * never to a global resume: text fields first (the ruling's carve-out),
 * plus textarea/select — the same exclusion set the hotkey manager
 * (hooks/useHotkeys.js) already applies to every global key. A focused
 * BUTTON is deliberately NOT in this set: buttons are the case the
 * ruling exists for (Space died on a focused panel button).
 */
export function isTextEntryTarget(target) {
  if (!target || typeof target !== 'object') return false;
  if (target.isContentEditable) return true;
  const tag = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Ruling 2 as a decision: should this keydown be claimed as the global
 * watchdog resume? True only when the watchdog hard stop is up
 * (PERF PAUSED), the key is an unmodified, non-repeat Space, and focus
 * is not in a text-entry control. Anything else leaves the event to
 * the app's normal Space toggle and the focused control.
 */
export function shouldSpaceResume({
  key,
  repeat = false,
  metaKey = false,
  ctrlKey = false,
  altKey = false,
  watchdogStopped = false,
  target = null,
} = {}) {
  if (repeat || metaKey || ctrlKey || altKey) return false;
  if (key !== ' ') return false;
  if (!watchdogStopped) return false;
  if (isTextEntryTarget(target)) return false;
  return true;
}

// ── The watchdog's own measurement (ruling 3) ──────────────────────────
// A reading is the measurement a trip actually acted on, in that trip's
// own terms: the fps-critical path acted on the effective rate against
// its floor; the crawl acted on the rate loop time advances (a ratio,
// NOT an fps); the stall acted on silence (a duration, NOT an fps);
// the correctness trips (accum-nan, render-error) acted on a fault, so
// their reading is the fault's own label. Formatters below are the one
// place these become text — the pill, its tooltip, and the log all
// speak from here, so they can never disagree with each other.

/** fps-critical: the effective rate and the floor it fell below. */
export function fpsWatchdogReading(at, floor) {
  return { kind: 'fps', at: Number(at) || 0, floor: Number(floor) || 0 };
}

/** fps-crawl: loop time advancing at `ratio` of wall across the window. */
export function crawlWatchdogReading(ratio, wallMs, frames) {
  return {
    kind: 'crawl',
    ratioPct: Math.round((Number(ratio) || 0) * 100),
    wallMs: Number(wallMs) || 0,
    frames: Number(frames) || 0,
  };
}

/** fps-stalled: no completed frame for `silentMs`. */
export function stalledWatchdogReading(silentMs) {
  return { kind: 'stalled', silentMs: Number(silentMs) || 0 };
}

/** Correctness trips (accum-nan / render-error): the fault label itself. */
export function faultWatchdogReading(reason) {
  return { kind: 'fault', label: String(reason ?? '') };
}

/** Compact form for the pill's face — the measurement in a few glyphs. */
export function watchdogReadingShort(reading) {
  if (!reading || typeof reading !== 'object') return '';
  switch (reading.kind) {
    case 'fps':
      return `${Math.round(reading.at)}fps`;
    case 'crawl':
      return `loop ${reading.ratioPct}%`;
    case 'stalled':
      return 'frame stalled';
    case 'fault':
      return reading.label || '';
    default:
      return '';
  }
}

/** Full clause for the pill's tooltip and the log — the measurement in
 *  its own terms, with its threshold where the trip has one. */
export function watchdogReadingLong(reading) {
  if (!reading || typeof reading !== 'object') return '';
  switch (reading.kind) {
    case 'fps':
      return `effective rate ${Math.round(reading.at * 10) / 10}fps, below the ${reading.floor}fps floor`;
    case 'crawl':
      return `loop time advancing at ${reading.ratioPct}% of wall across ${(reading.wallMs / 1000).toFixed(1)}s (${reading.frames} frames)`;
    case 'stalled':
      return `no completed frame for ${(reading.silentMs / 1000).toFixed(1)}s`;
    case 'fault':
      return reading.label || '';
    default:
      return '';
  }
}
