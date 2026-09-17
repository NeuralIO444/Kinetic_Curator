// governorEventLog — the governor's flight recorder (backend hardening 5/6).
//
// Every shed and every restore the Showrunner governor applies is recorded:
// timestamp, what the FPS window looked like, which cut was applied (as its
// shed-order step), and when it cleared. A performer can review after a set:
// "it shed resolution twice during the dense section — that section needs a
// cheaper preset."
//
// Kept pure (no React, no store) and in-memory only:
// - a module-level ring buffer, bounded at MAX_EVENTS (never unbounded
//   growth), oldest entries dropped first.
// - never serialized into project JSON — the log describes a live session,
//   not the artwork.
//
// This module does NOT decide cuts — hooks/governorCuts.js owns the order
// and hooks/usePerformanceGovernor.js owns the timing. This module only
// records what they did. Shed behavior and order are untouched by it.

/** Schema id for the exported JSON, so dumps stay machine-readable. */
export const LOG_SCHEMA = 'kc-governor-event-log/1';

/** Ring buffer capacity. A set-long session is dozens of events, not
 *  thousands — 128 keeps the log honest without unbounded growth. */
export const MAX_EVENTS = 128;

/**
 * The shed ladder as ordered steps (the contract in governorCuts.js).
 * cutKind → step. Watchdog (step 7) is the hard stop.
 */
export const SHED_STEPS = {
  renderScale: 1,
  quality: 2,
  perfTier1: 3,
  assetThin: 4,
  countClamp: 5,
  slowRender: 6,
  watchdog: 7,
};

/** Cut kinds the log knows. Matches the kinds nextGovernorCut returns,
 *  plus perfTier1 (independent mechanism) and watchdog (the hard stop). */
export const CUT_KINDS = Object.keys(SHED_STEPS);

const events = [];

/** Ring-buffer append: drops the oldest entry when at capacity. */
function push(event) {
  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
  return event;
}

/**
 * Record one governor event.
 *
 * @param {object} e
 *   { type: 'shed'|'restore', cutKind, label?, fps?, detail? }
 *   - cutKind: one of CUT_KINDS.
 *   - label: human-readable cut name (e.g. "resolution → 75%").
 *   - fps: { at, threshold, sustainedMs } — what the FPS window looked like
 *     when the cut fired (the cause). Restore events carry the fps at clear.
 *   - detail: free-text cause, e.g. "FPS 24 < 32 sustained 1.6s".
 * @returns the recorded entry.
 */
export function recordGovernorEvent(e = {}) {
  const { type, cutKind } = e;
  if (type !== 'shed' && type !== 'restore') {
    throw new Error(`[governor-event-log] type must be 'shed' or 'restore' (got ${String(type)})`);
  }
  if (!CUT_KINDS.includes(cutKind)) {
    throw new Error(`[governor-event-log] unknown cutKind "${String(cutKind)}" — must be one of ${CUT_KINDS.join(', ')}`);
  }
  const fps = e.fps ?? null;
  if (fps !== null) {
    const { at, threshold, sustainedMs } = fps;
    for (const [k, v] of [['at', at], ['threshold', threshold], ['sustainedMs', sustainedMs]]) {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new Error(`[governor-event-log] fps.${k} must be a finite number (got ${String(v)})`);
      }
    }
  }
  return push({
    t: new Date().toISOString(),
    type,
    cutKind,
    step: SHED_STEPS[cutKind],
    label: String(e.label ?? ''),
    fps,
    detail: String(e.detail ?? ''),
  });
}

/** Snapshot of the buffered events, oldest → newest. A copy: safe to hold. */
export function getGovernorEvents() {
  return [...events];
}

/** Empty the buffer (used by selfchecks and dev tooling). */
export function clearGovernorEvents() {
  events.length = 0;
}

/** Current buffer occupancy, for health reads. */
export function governorEventLogSize() {
  return events.length;
}

/**
 * Dump the whole log as JSON — the post-set review artifact.
 * Shape: { schema, exportedAt, count, capacity, events }.
 */
export function exportGovernorLogJSON() {
  return JSON.stringify(
    {
      schema: LOG_SCHEMA,
      exportedAt: new Date().toISOString(),
      count: events.length,
      capacity: MAX_EVENTS,
      events: [...events],
    },
    null,
    2,
  );
}
