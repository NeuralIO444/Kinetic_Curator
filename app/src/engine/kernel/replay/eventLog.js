// kernel/replay/eventLog.js — append-only input event log (#1313).
//
// Per docs/design/deterministic-replay.md: the live instrument appends one
// entry per input as the performer plays; the replayer consumes the log and
// reproduces the session bit-for-bit. Every entry is
//   { frame, type, payload }
// where `frame` is a frame INDEX, never wall-clock time. Nothing wall-clocked
// may enter the log, ever — the validators below are fail-closed about it.
//
// Event types (aligned with the worker protocol's STEP shapes, #1334):
//   seed               { seed }                        — re-seed + re-place
//   recipe-load        { recipe }                      — replace recipe + re-place
//   param-set          { params }                      — merge step params
//   pointer            { x, y, strength? }             — attractor, canvas px
//   audio-envelope     { energy }                      — quantized 0..1
//   dish-module-toggle { module, enabled }             — toggle a replay module
//
// The log is JSON-safe by construction: payloads are plain data only
// (finite numbers, strings, booleans, null, arrays, plain objects). The
// export/import UI (#1314) serializes this log verbatim.

/** Event types the replayer understands. Kebab-case, matching #1334. */
export const EVENT_TYPES = Object.freeze([
  'seed',
  'recipe-load',
  'param-set',
  'pointer',
  'audio-envelope',
  'dish-module-toggle',
]);

/** Log envelope version. Bump if the serialized shape changes. */
export const EVENT_LOG_VERSION = 1;

/** Payload keys that smell like wall-clock time — rejected on ingest. */
const WALL_CLOCK_KEYS = Object.freeze([
  'timestamp',
  'wallTime',
  'wallClock',
  'dateNow',
  'performanceNow',
  'hrtime',
  'elapsedMs',
]);

const MAX_PAYLOAD_DEPTH = 8;

export class EventLogError extends Error {
  constructor(message) {
    super(`[replay:eventLog] ${message}`);
    this.name = 'EventLogError';
  }
}

function isPlainObject(v) {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function assertJsonSafe(value, path, depth) {
  if (depth > MAX_PAYLOAD_DEPTH) {
    throw new EventLogError(`payload too deep (>${MAX_PAYLOAD_DEPTH}) at ${path}`);
  }
  if (value === null) return;
  const t = typeof value;
  if (t === 'number') {
    if (!Number.isFinite(value)) {
      throw new EventLogError(`payload number must be finite at ${path} (got ${String(value)})`);
    }
    return;
  }
  if (t === 'string' || t === 'boolean') return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) assertJsonSafe(value[i], `${path}[${i}]`, depth + 1);
    return;
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (WALL_CLOCK_KEYS.includes(key)) {
        throw new EventLogError(
          `payload key "${key}" looks wall-clocked at ${path} — frame indices only, never wall-clock`,
        );
      }
      assertJsonSafe(value[key], `${path}.${key}`, depth + 1);
    }
    return;
  }
  throw new EventLogError(
    `payload must be JSON-safe data at ${path} (got ${t === 'object' ? 'non-plain object' : t})`,
  );
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

/** Frame-quantize an audio energy reading: 3 decimals, like the worker bus. */
export function quantizeEnergy(energy) {
  return Math.round(clamp01(energy) * 1000) / 1000;
}

/**
 * Per-type payload validation + normalization. Returns the normalized
 * payload that is actually stored (audio envelopes are quantized here).
 */
function normalizePayload(type, payload) {
  if (!isPlainObject(payload)) {
    throw new EventLogError(`"${type}": payload must be a plain object`);
  }
  assertJsonSafe(payload, 'payload', 0);
  switch (type) {
    case 'seed': {
      if (!isFiniteNumber(payload.seed)) {
        throw new EventLogError('"seed": payload.seed must be a finite number');
      }
      return { seed: payload.seed >>> 0 };
    }
    case 'recipe-load': {
      if (!isPlainObject(payload.recipe)) {
        throw new EventLogError('"recipe-load": payload.recipe must be a plain object');
      }
      return { recipe: payload.recipe };
    }
    case 'param-set': {
      // Canonical form is { params }; the worker protocol's { key, value }
      // single-pair form is accepted and normalized.
      if (isPlainObject(payload.params)) return { params: payload.params };
      if (typeof payload.key === 'string' && payload.value !== undefined) {
        return { params: { [payload.key]: payload.value } };
      }
      throw new EventLogError('"param-set": payload must carry { params } or { key, value }');
    }
    case 'pointer': {
      if (!isFiniteNumber(payload.x) || !isFiniteNumber(payload.y)) {
        throw new EventLogError('"pointer": payload.x and payload.y must be finite numbers');
      }
      const strength = payload.strength === undefined ? 0 : payload.strength;
      if (!isFiniteNumber(strength) || strength < 0) {
        throw new EventLogError('"pointer": payload.strength must be a finite number >= 0');
      }
      return { x: payload.x, y: payload.y, strength };
    }
    case 'audio-envelope': {
      if (!isFiniteNumber(payload.energy)) {
        throw new EventLogError('"audio-envelope": payload.energy must be a finite number');
      }
      // Quantized on ingest: the log never carries raw bus floats.
      return { energy: quantizeEnergy(payload.energy) };
    }
    case 'dish-module-toggle': {
      if (typeof payload.module !== 'string' || !payload.module) {
        throw new EventLogError('"dish-module-toggle": payload.module must be a non-empty string');
      }
      if (typeof payload.enabled !== 'boolean') {
        throw new EventLogError('"dish-module-toggle": payload.enabled must be a boolean');
      }
      return { module: payload.module, enabled: payload.enabled };
    }
    default:
      // Unreachable: type is checked before this is called.
      throw new EventLogError(`unknown event type "${type}"`);
  }
}

/** A new, empty, append-only log. */
export function createEventLog() {
  return { version: EVENT_LOG_VERSION, events: [], _seq: 0 };
}

/**
 * Append one validated entry. Returns the stored (frozen) event.
 * Throws EventLogError on any contract violation — fail-closed.
 */
export function appendEvent(log, frame, type, payload) {
  if (!log || !Array.isArray(log.events)) {
    throw new EventLogError('log must be created by createEventLog()/parseEventLog()');
  }
  if (!Number.isInteger(frame) || frame < 0) {
    throw new EventLogError(`frame must be a non-negative integer (got ${String(frame)})`);
  }
  if (!EVENT_TYPES.includes(type)) {
    throw new EventLogError(`unknown event type "${String(type)}" (known: ${EVENT_TYPES.join(', ')})`);
  }
  const stored = Object.freeze({
    seq: log._seq++,
    frame,
    type,
    payload: Object.freeze(normalizePayload(type, payload)),
  });
  log.events.push(stored);
  return stored;
}

/** Number of entries in the log. */
export function eventCount(log) {
  return log && Array.isArray(log.events) ? log.events.length : 0;
}

/** Entries sorted by (frame, seq) — the order the replayer applies them. */
export function sortedEvents(log) {
  if (!log || !Array.isArray(log.events)) {
    throw new EventLogError('log must be created by createEventLog()/parseEventLog()');
  }
  return [...log.events].sort((a, b) => (a.frame - b.frame) || (a.seq - b.seq));
}

/** Entries for one frame, in application order. */
export function eventsAt(log, frame) {
  return sortedEvents(log).filter((e) => e.frame === frame);
}

/** Highest frame index carrying an event, or -1 for an empty log. */
export function maxEventFrame(log) {
  let max = -1;
  for (const e of log.events) {
    if (e.frame > max) max = e.frame;
  }
  return max;
}

/** JSON-safe serialization (what #1314's export writes to disk). */
export function serializeEventLog(log) {
  if (!log || !Array.isArray(log.events)) {
    throw new EventLogError('log must be created by createEventLog()/parseEventLog()');
  }
  return {
    version: EVENT_LOG_VERSION,
    events: log.events.map((e) => ({ frame: e.frame, type: e.type, payload: e.payload })),
  };
}

/**
 * Parse + re-validate a serialized log (golden fixtures, #1314 import path).
 * Accepts the serialized shape; extra fields (like `seq`) are ignored.
 */
export function parseEventLog(data) {
  if (!isPlainObject(data) || !Array.isArray(data.events)) {
    throw new EventLogError('serialized log must be { version, events: [...] }');
  }
  if (data.version !== EVENT_LOG_VERSION) {
    throw new EventLogError(
      `unsupported event log version ${String(data.version)} (want ${EVENT_LOG_VERSION})`,
    );
  }
  const log = createEventLog();
  for (const e of data.events) {
    if (!isPlainObject(e)) throw new EventLogError('log entry must be an object');
    appendEvent(log, e.frame, e.type, e.payload);
  }
  return log;
}
