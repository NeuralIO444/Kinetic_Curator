// kernel/replay/performance.js — shareable performance files (#1314).
//
// A performance is `{ format, version, kernelVersion, seed, recipe,
// frameCount, checkpoints, eventLog }`: everything replay() needs to
// reproduce a session bit-for-bit, in kilobytes. No frames, no pixels.
//
// RECORDING. The live instrument calls the recorder once per frame it steps:
// `tick()` after each stepped frame, and the input methods before it, so an
// input lands on the frame that consumes it (the replayer applies a frame's
// events, then steps). Audio is recorded as the quantized envelope
// (quantizeEnergy, the #1252 null-audio discipline) — a replay without it is
// deterministic-looking but wrong. Pointer and audio persist in the
// replayer, so a repeat of the current value is not logged (replay-exact,
// and it is what keeps minutes-long sessions small).
//
// HONEST SIGNALS. `checkpoints` carry a frame hash every CHECKPOINT_EVERY
// frames and at the last frame; verifyPerformance() replays the file and
// reports the first checkpoint that differs. A file recorded under another
// KERNEL_VERSION is flagged `kernelMismatch` — it may replay differently,
// and that is said, not hidden.

import {
  EVENT_TYPES,
  createEventLog,
  appendEvent,
  serializeEventLog,
  parseEventLog,
  quantizeEnergy,
} from './eventLog.js';
import { replay, normalizeRecipe, ReplayError } from './replayer.js';
import { KERNEL_VERSION } from '../version.js';

export const PERFORMANCE_FORMAT = 'kc-performance';
export const PERFORMANCE_VERSION = 1;
export const CHECKPOINT_EVERY = 60;

/** Recorded audio resolution (1/100). The live loop consumes the value
 *  rec.audio() returns, so what it plays is exactly what is logged. */
const AUDIO_STEPS = 100;
const T_AUDIO = EVENT_TYPES.indexOf('audio-envelope');
const T_POINTER = EVENT_TYPES.indexOf('pointer');

export class PerformanceError extends Error {
  constructor(message) {
    super(`[replay:performance] ${message}`);
    this.name = 'PerformanceError';
  }
}

/**
 * Live-side recorder. `seed` and `recipe` are the session's starting state.
 * Frame numbering matches replay(): the first stepped frame is 0.
 */
export function createRecorder({ seed, recipe } = {}) {
  if (typeof seed !== 'number' || !Number.isFinite(seed)) {
    throw new PerformanceError(`seed must be a finite number (got ${String(seed)})`);
  }
  const log = createEventLog();
  let frame = 0;
  let audio = null; // last logged quantized energy (replayer default is 0)
  let pointer = null; // last logged "x,y,strength"
  return {
    get frame() {
      return frame;
    },
    /** Merge step params at the current frame (param-set payload shape). */
    params(params) {
      appendEvent(log, frame, 'param-set', { params });
    },
    pointer(x, y, strength) {
      const key = `${x},${y},${strength}`;
      if (key === pointer) return;
      pointer = key;
      appendEvent(log, frame, 'pointer', strength === undefined ? { x, y } : { x, y, strength });
    },
    /**
     * Raw 0..1 analyser energy → the quantized value the live loop must use
     * this frame (returned). Deduped against the last logged value.
     */
    audio(energy) {
      const q = quantizeEnergy(Math.round(Math.min(1, Math.max(0, energy)) * AUDIO_STEPS) / AUDIO_STEPS);
      if (q !== audio) {
        audio = q;
        appendEvent(log, frame, 'audio-envelope', { energy: q });
      }
      return q;
    },
    /** Re-seed (the replayer resets audio + pointer to defaults on this). */
    seed(s) {
      appendEvent(log, frame, 'seed', { seed: s });
      audio = 0;
      pointer = null;
    },
    /** Load a recipe (same reset as seed). */
    recipe(r) {
      appendEvent(log, frame, 'recipe-load', { recipe: r });
      audio = 0;
      pointer = null;
    },
    toggle(module, enabled) {
      appendEvent(log, frame, 'dish-module-toggle', { module, enabled: !!enabled });
    },
    /** Call once after each stepped frame. */
    tick() {
      frame += 1;
    },
    /** Snapshot the session as a performance file object. */
    finish({ checkpoints = [] } = {}) {
      if (frame < 1) throw new PerformanceError('nothing recorded: step at least one frame');
      return {
        format: PERFORMANCE_FORMAT,
        version: PERFORMANCE_VERSION,
        kernelVersion: KERNEL_VERSION,
        seed: seed >>> 0,
        recipe: recipe === undefined ? null : recipe,
        frameCount: frame,
        checkpoints,
        eventLog: serializeEventLog(log),
      };
    },
  };
}

/**
 * Attach checkpoints by replaying the file's own log. Cheap enough to run
 * at export time; the live loop never has to hash.
 */
export function withCheckpoints(perf) {
  const run = runReplay(perf);
  return { ...perf, checkpoints: pickCheckpoints(run.frameHashes) };
}

function pickCheckpoints(frameHashes) {
  const out = [];
  const last = frameHashes.length - 1;
  for (let f = 0; f <= last; f++) {
    if (f % CHECKPOINT_EVERY === 0 || f === last) out.push({ frame: f, hash: frameHashes[f] });
  }
  return out;
}

function runReplay(perf) {
  return replay(perf.seed, perf.eventLog, perf.frameCount, {
    recipe: perf.recipe === null ? undefined : perf.recipe,
  });
}

// Row encoding of the event log (kilobytes for minutes of audio):
//   [frameDelta, typeIndex, ...args]
//   audio-envelope: [df, T, energy*100]     pointer: [df, T, x, y, strength|null]
//   anything else:  [df, T, payloadObject]
// Rows keep append order exactly (order within a frame is part of the bits),
// frameDelta is signed so a log appended out of frame order still round-trips.
function packEvents(serialized) {
  let prev = 0;
  const rows = serialized.events.map((e) => {
    const df = e.frame - prev;
    prev = e.frame;
    const t = EVENT_TYPES.indexOf(e.type);
    if (t === T_AUDIO) return [df, t, Math.round(e.payload.energy * AUDIO_STEPS * 10)];
    if (t === T_POINTER && Object.keys(e.payload).every((k) => k === 'x' || k === 'y' || k === 'strength')) {
      return [df, t, e.payload.x, e.payload.y, e.payload.strength === undefined ? null : e.payload.strength];
    }
    return [df, t, e.payload];
  });
  return { version: serialized.version, rows };
}

function unpackEvents(packed) {
  if (!packed || !Array.isArray(packed.rows)) throw new PerformanceError('eventLog.rows must be an array');
  let frame = 0;
  const events = packed.rows.map((r, i) => {
    if (!Array.isArray(r) || r.length < 3 || !Number.isInteger(r[0]) || !Number.isInteger(r[1])) {
      throw new PerformanceError(`eventLog.rows[${i}] is malformed`);
    }
    frame += r[0];
    const type = EVENT_TYPES[r[1]];
    if (type === undefined) throw new PerformanceError(`eventLog.rows[${i}]: unknown event type index ${r[1]}`);
    if (r[1] === T_AUDIO) return { frame, type, payload: { energy: r[2] / (AUDIO_STEPS * 10) } };
    if (r[1] === T_POINTER && typeof r[2] === 'number') {
      const payload = { x: r[2], y: r[3] };
      if (r[4] !== null && r[4] !== undefined) payload.strength = r[4];
      return { frame, type, payload };
    }
    return { frame, type, payload: r[2] };
  });
  return { version: packed.version, events };
}

/** Serialize to the shareable text (kilobytes). */
export function exportPerformance(perf) {
  const p = parsePerformance(perf);
  return JSON.stringify({ ...p, eventLog: packEvents(p.eventLog) });
}

/**
 * Validate an object or JSON text and return a normalized performance.
 * Fail-closed: anything unrecognised throws PerformanceError.
 */
export function parsePerformance(input) {
  let d = input;
  if (typeof input === 'string') {
    try {
      d = JSON.parse(input);
    } catch (e) {
      throw new PerformanceError(`not valid JSON: ${e.message}`);
    }
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new PerformanceError('performance must be an object');
  if (d.format !== PERFORMANCE_FORMAT) throw new PerformanceError(`unknown format ${String(d.format)}`);
  if (d.version !== PERFORMANCE_VERSION) {
    throw new PerformanceError(`unsupported version ${String(d.version)} (want ${PERFORMANCE_VERSION})`);
  }
  if (typeof d.seed !== 'number' || !Number.isFinite(d.seed)) throw new PerformanceError('seed must be a finite number');
  if (!Number.isInteger(d.frameCount) || d.frameCount < 1) throw new PerformanceError('frameCount must be a positive integer');
  if (typeof d.kernelVersion !== 'string') throw new PerformanceError('kernelVersion must be a string');
  if (d.recipe !== null) {
    try {
      normalizeRecipe(d.recipe);
    } catch (e) {
      if (e instanceof ReplayError) throw new PerformanceError(`recipe: ${e.message}`);
      throw e;
    }
  }
  const cps = Array.isArray(d.checkpoints) ? d.checkpoints : [];
  for (const c of cps) {
    if (!c || !Number.isInteger(c.frame) || c.frame < 0 || c.frame >= d.frameCount || typeof c.hash !== 'string') {
      throw new PerformanceError('checkpoints must be [{frame, hash}] within frameCount');
    }
  }
  // packed rows (exported files) or the plain serialized log (in-memory)
  const rawLog = d.eventLog && Array.isArray(d.eventLog.rows) ? unpackEvents(d.eventLog) : d.eventLog;
  const log = parseEventLog(rawLog); // re-validates every event
  return {
    format: PERFORMANCE_FORMAT,
    version: PERFORMANCE_VERSION,
    kernelVersion: d.kernelVersion,
    seed: d.seed >>> 0,
    recipe: d.recipe,
    frameCount: d.frameCount,
    checkpoints: cps.map((c) => ({ frame: c.frame, hash: c.hash })),
    eventLog: serializeEventLog(log),
  };
}

/** Import: parse + validate, and say plainly if the kernel differs. */
export function importPerformance(input) {
  const perf = parsePerformance(input);
  return { perf, kernelMismatch: perf.kernelVersion !== KERNEL_VERSION };
}

/** Replay a performance headless; returns replay()'s result. */
export function replayPerformance(perf) {
  return runReplay(parsePerformance(perf));
}

/**
 * Replay and compare against the file's checkpoints.
 * @returns {{ ok: boolean, checked: number, firstMismatchFrame: number|null,
 *             kernelMismatch: boolean }}
 */
export function verifyPerformance(input) {
  const { perf, kernelMismatch } = importPerformance(input);
  const run = runReplay(perf);
  let firstMismatchFrame = null;
  for (const c of perf.checkpoints) {
    if (run.frameHashes[c.frame] !== c.hash) {
      firstMismatchFrame = c.frame;
      break;
    }
  }
  return {
    ok: perf.checkpoints.length > 0 && firstMismatchFrame === null,
    checked: perf.checkpoints.length,
    firstMismatchFrame,
    kernelMismatch,
  };
}
