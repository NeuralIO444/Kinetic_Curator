// beatClock.mjs — BEAT master clock (#950).
//
// The top-bar BEAT button exposes the engine's transition clock as a real
// control. BPM is the master: morph durations are 2 beats, so 120 BPM gives
// 1s morphs, 60 BPM gives slow 2s luxury, 180 BPM gives frenetic 0.67s.
//
// The glitch ceiling, on purpose: the engine degrades sub-~0.75s transitions
// into hard cuts. Past ~160 BPM you fall through that ceiling deliberately —
// the frenetic glitch vibe is a dial setting, not a bug.
//
// All wall-clock-free and pure: the component owns tap timestamps, the store
// owns the BPM, the engine reads seconds.

/** Default tempo. 120 BPM → 1s morphs, today's feel. */
export const BEAT_DEFAULT_BPM = 120;
/** Widest exact-entry range. 30 BPM → 4s morphs; 300 BPM → hard-cut territory. */
export const BEAT_MIN_BPM = 30;
export const BEAT_MAX_BPM = 300;
/** Preset buttons in the dropdown. */
export const BEAT_PRESETS = Object.freeze([60, 90, 120, 150, 180, 210]);
/**
 * Glitch ceiling: transitions shorter than this degrade into hard cuts.
 * 160 BPM → exactly 0.75s, so anything past ~160 falls through deliberately.
 */
export const BEAT_GLITCH_CEILING_S = 0.75;
/** Taps older than this (ms) don't count — a pause restarts the feel. */
export const BEAT_TAP_WINDOW_MS = 2000;
/** How many recent taps set the tempo (the "tap 4×" in the issue). */
export const BEAT_TAP_COUNT = 4;

/** Clamp a BPM to the finite [30, 300] the clock accepts. Never trust the caller. */
export function sanitizeBeatBpm(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return BEAT_DEFAULT_BPM;
  return Math.min(BEAT_MAX_BPM, Math.max(BEAT_MIN_BPM, n));
}

/**
 * Morph duration for a BPM: 2 beats in seconds. 120 → 1.0, 60 → 2.0,
 * 180 → 0.667. Always finite and positive for a sanitized BPM.
 */
export function beatSeconds(bpm) {
  const clean = sanitizeBeatBpm(bpm);
  return 120 / clean;
}

/**
 * True when a transition duration falls through the glitch ceiling and the
 * engine should hard-cut instead of morphing. 160 BPM lands exactly on the
 * ceiling (0.75s) and still morphs; past it cuts.
 */
export function beatIsHardCut(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s)) return false;
  return s < BEAT_GLITCH_CEILING_S;
}

/**
 * BPM from tap timestamps (ms, ascending). Averages the intervals of the
 * last BEAT_TAP_COUNT taps; fewer taps still work (1 interval minimum).
 * Stale taps (gap > BEAT_TAP_WINDOW_MS) restart the count — a pause means
 * a new feel, not a 3 BPM dirge. Returns null when no tempo can be read.
 * Pure: the component passes Date.now() in.
 */
export function tapBpm(tapTimes) {
  if (!Array.isArray(tapTimes) || tapTimes.length < 2) return null;
  // Drop taps separated by a pause — only the latest unbroken run counts.
  let start = 0;
  for (let i = 1; i < tapTimes.length; i++) {
    if (tapTimes[i] - tapTimes[i - 1] > BEAT_TAP_WINDOW_MS) start = i;
  }
  const run = tapTimes.slice(start).slice(-BEAT_TAP_COUNT);
  if (run.length < 2) return null;
  let total = 0;
  for (let i = 1; i < run.length; i++) total += run[i] - run[i - 1];
  const avgIntervalMs = total / (run.length - 1);
  if (!(avgIntervalMs > 0)) return null;
  return sanitizeBeatBpm(60000 / avgIntervalMs);
}
