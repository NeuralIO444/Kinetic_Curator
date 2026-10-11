// sessionLog.js — #1314 (B): the session log. What the artist DID, as a small file.
//
// HONEST NAME, HONEST FILE. This records INPUTS: the starting seed and layout, every seed change, every layout-
// parameter change, and the quantized audio level, each stamped with a frame INDEX (never wall-clock). It does NOT
// reproduce the picture: the live instrument does not run on the replay engine yet (docs/design/deterministic-
// replay.md), so replaying this file through the headless replayer would not give back what was on screen. The file
// says so itself (`replayable: false`). It is a debugging / training / future-replay artifact, not a performance.
//
// "Frame" = a presented animation frame while the instrument is running. Nothing here reads Date or a timer.
// Audio is recorded at 1/100 resolution (the same quantization the replay log uses) and only when it changes;
// `null` from the meter (audio off = known silence, not unknown) is recorded as OFF (-1), never as 0.
import { KERNEL_VERSION } from '../engine/kernel/version.js';

export const SESSION_LOG_FORMAT = 'kc-session-log';
export const SESSION_LOG_VERSION = 1;
export const AUDIO_OFF = -1;
/** Past this many recorded changes the log stops growing and says so (`truncated`). */
export const MAX_EVENTS = 20000;

const clone = (v) => JSON.parse(JSON.stringify(v));
const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const audioStep = (e) => (e == null || !Number.isFinite(e) ? AUDIO_OFF : Math.round(Math.min(1, Math.max(0, e)) * 100));

/** The recorder. Pure data in, plain object out. */
export function createSessionLog({ seed = 0, layoutParams = {}, paletteId = null } = {}) {
  const start = { seed: seed >>> 0, layoutParams: clone(layoutParams || {}), paletteId };
  let frame = 0;
  let count = 0;
  let truncated = false;
  let lastAudio = null;
  const seeds = []; // [frame, seed]
  const params = []; // [frame, key, value]
  const audio = []; // [frameDelta, step]  (step 0..100, or AUDIO_OFF)
  let lastAudioFrame = 0;
  const room = () => {
    if (count >= MAX_EVENTS) { truncated = true; return false; }
    count += 1;
    return true;
  };
  return {
    get frame() { return frame; },
    get truncated() { return truncated; },
    tick() { frame += 1; },
    /** Raw meter energy 0..1, or null when audio is off. Logged only when the quantized value changes. */
    audio(energy) {
      const q = audioStep(energy);
      if (q === lastAudio) return q;
      if (!room()) return q;
      audio.push([frame - lastAudioFrame, q]);
      lastAudioFrame = frame;
      lastAudio = q;
      return q;
    },
    seed(next) {
      if (!Number.isFinite(next)) return;
      if (room()) seeds.push([frame, next >>> 0]);
    },
    param(key, value) {
      if (typeof key !== 'string' || !key) return;
      if (room()) params.push([frame, key, clone(value)]);
    },
    finish() {
      return {
        format: SESSION_LOG_FORMAT,
        version: SESSION_LOG_VERSION,
        kernelVersion: KERNEL_VERSION,
        replayable: false,
        note: 'Inputs only. This file does not reproduce the picture: the live instrument does not run on the replay '
          + 'engine yet (#1314). Frames are presented animation frames while the instrument was running.',
        start,
        frames: frame,
        truncated,
        audio,
        seeds,
        params,
      };
    },
  };
}

/** Diff two layoutParams snapshots into [key, value] changes (shallow keys, deep value compare). */
export function layoutChanges(prev, next) {
  const out = [];
  const a = prev || {};
  const b = next || {};
  if (a === b) return out;
  for (const key of Object.keys(b)) if (!same(a[key], b[key])) out.push([key, b[key]]);
  return out;
}

// ── the live wiring: one module singleton, fed by the store and the animation clock ──────────────────────────────
let live = null;

/**
 * Start recording. `subscribe` is the store's subscribe ((next, prev) => void); `getState` reads the store;
 * `getAudio` returns the meter energy (0..1 or null); `raf`/`caf` default to the window's. Returns a stop function.
 * Injected so this module stays framework-free and testable.
 */
export function initSessionLog({ subscribe, getState, getAudio, raf, caf } = {}) {
  const req = raf || (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
  const cancel = caf || (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null);
  const s0 = getState();
  const log = createSessionLog({ seed: s0.seed, layoutParams: s0.layoutParams, paletteId: s0.paletteId ?? null });
  live = log;
  const unsub = subscribe((next, prev) => {
    try {
      if (!next || !prev) return;
      if (next.seed !== prev.seed) log.seed(next.seed);
      for (const [key, value] of layoutChanges(prev.layoutParams, next.layoutParams)) log.param(key, value);
    } catch {
      /* a log that cannot read a change just misses it: never break the instrument */
    }
  });
  let handle = 0;
  const loop = () => {
    handle = req(loop);
    try {
      if (getState().running) {
        log.audio(getAudio());
        log.tick();
      }
    } catch {
      /* same rule */
    }
  };
  if (req) handle = req(loop);
  return () => {
    if (typeof unsub === 'function') unsub();
    if (cancel && handle) cancel(handle);
    if (live === log) live = null;
  };
}

/** The session so far as a plain object, or null before initSessionLog. */
export function snapshotSessionLog() {
  return live ? live.finish() : null;
}

/** Suggested file name: seed (hex) and frame count; never a timestamp. */
export function sessionLogFilename(log) {
  const seed = (log && log.start && Number.isFinite(log.start.seed) ? log.start.seed : 0).toString(16);
  return `kc-session-${seed}-${(log && log.frames) | 0}f.json`;
}
