// kernel/worker/protocol.js — versioned worker message contract (#1311).
//
// Per docs/design/worker-thread-kernel.md: INIT {seed, recipe, params} → READY,
// STEP {frame, dt, events[]} → FRAME {buffers, transfers}, SET_PARAM {key, value,
// frame}, SNAPSHOT {atFrame} → SNAPSHOT_RESULT. RETURN hands buffers back to the
// worker for ping-pong reuse; ERROR carries worker-side failures to the client.
//
// THE LAW OF THIS FILE: every input event carries a FRAME INDEX, never
// wall-clock time. Anything without a frame number is rejected — cross-thread
// timing is quantized or determinism dies (design doc, "Risks").
//
// This module is the contract authority: message builders, validators, and the
// transfer-list assertion all live here so the worker entry (kernel.worker.js)
// and the inline fallback (kernelClient.js) enforce the same rules.

import { POINT_COLUMN_NAMES } from '../soa/pointSet.js';

/** Wire protocol version. Bump on any message-shape change; READY/INIT mismatch is fatal. */
export const PROTOCOL_VERSION = 1;

/** Message types on the wire. */
export const MSG = Object.freeze({
  INIT: 'init',
  READY: 'ready',
  STEP: 'step',
  FRAME: 'frame',
  SET_PARAM: 'set-param',
  PARAM_ACK: 'param-ack',
  SNAPSHOT: 'snapshot',
  SNAPSHOT_RESULT: 'snapshot-result',
  RETURN: 'return',
  ERROR: 'error',
});

/** Step-event types. Every event carries `frame` — the STEP frame it applies to. */
export const EVENT = Object.freeze({
  IMPULSE: 'impulse', // { dx, dy } — velocity gust applied to every lane
  AUDIO_ENVELOPE: 'audio-envelope', // { energy } — quantized main-thread audio; worker never reads live audio
  PARAM_SET: 'param-set', // { key, value } — inline param change at this frame
});

/** Params the protocol allows INIT to carry. Must stay in sync with
 *  DEFAULT_STEP_PARAMS in stepKernel.js (asserted by kernelWorker.selfcheck). */
export const KNOWN_INIT_PARAMS = Object.freeze([
  'pointCount',
  'damping',
  'speed',
  'audioGain',
  'boundW',
  'boundH',
]);

/** Params SET_PARAM / param-set events may change mid-run. */
export const SETTABLE_PARAMS = Object.freeze(['damping', 'speed', 'audioGain']);

/** Thrown when a message violates the contract. Fail-closed, names the offender. */
export class ProtocolError extends Error {
  constructor(message) {
    super(`[kernel-worker protocol] ${message}`);
    this.name = 'ProtocolError';
  }
}

function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Every protocol event carries a frame index — never wall-clock. Rejects
 * missing, non-integer, or negative frames.
 */
export function assertFrameIndex(frame, what) {
  if (!Number.isInteger(frame) || frame < 0) {
    throw new ProtocolError(`${what}: frame must be a non-negative integer (got ${String(frame)})`);
  }
  return frame;
}

function assertProtocolField(msg, what) {
  if (!isObject(msg)) throw new ProtocolError(`${what}: message must be an object`);
  if (msg.protocol !== PROTOCOL_VERSION) {
    throw new ProtocolError(
      `${what}: protocol mismatch (got ${String(msg.protocol)}, want ${PROTOCOL_VERSION})`,
    );
  }
}

function validateParamValue(key, value, what) {
  if (!SETTABLE_PARAMS.includes(key)) {
    throw new ProtocolError(`${what}: unknown param "${String(key)}" (settable: ${SETTABLE_PARAMS.join(', ')})`);
  }
  if (!isFiniteNumber(value) || value < 0) {
    throw new ProtocolError(`${what}: param "${key}" must be a finite number >= 0 (got ${String(value)})`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Builders (main thread → worker)
// ---------------------------------------------------------------------------

export function initMessage({ seed, recipe, params } = {}) {
  return { type: MSG.INIT, protocol: PROTOCOL_VERSION, seed, recipe, params };
}

export function stepMessage({ frame, dt, events } = {}) {
  return { type: MSG.STEP, protocol: PROTOCOL_VERSION, frame, dt, events: events || [] };
}

export function setParamMessage({ key, value, frame }) {
  return { type: MSG.SET_PARAM, protocol: PROTOCOL_VERSION, key, value, frame };
}

export function snapshotMessage({ atFrame }) {
  return { type: MSG.SNAPSHOT, protocol: PROTOCOL_VERSION, atFrame };
}

/** Return frame buffers to the worker for ping-pong reuse (transferred back). */
export function returnMessage({ frame, columns }) {
  return { type: MSG.RETURN, protocol: PROTOCOL_VERSION, frame, columns };
}

// ---------------------------------------------------------------------------
// Validators (worker side — and the inline path, same rules)
// ---------------------------------------------------------------------------

export function validateInitMessage(msg) {
  assertProtocolField(msg, 'INIT');
  if (msg.type !== MSG.INIT) throw new ProtocolError(`INIT: wrong type "${String(msg.type)}"`);
  if (!isFiniteNumber(msg.seed)) {
    throw new ProtocolError(`INIT: seed must be a finite number (got ${String(msg.seed)})`);
  }
  if (msg.recipe !== undefined && !isObject(msg.recipe)) {
    throw new ProtocolError('INIT: recipe must be an object when present');
  }
  const params = msg.params === undefined ? {} : msg.params;
  if (!isObject(params)) throw new ProtocolError('INIT: params must be an object when present');
  for (const key of Object.keys(params)) {
    if (!KNOWN_INIT_PARAMS.includes(key)) {
      throw new ProtocolError(`INIT: unknown param "${key}" (known: ${KNOWN_INIT_PARAMS.join(', ')})`);
    }
    if (!isFiniteNumber(params[key]) || params[key] < 0) {
      throw new ProtocolError(`INIT: param "${key}" must be a finite number >= 0`);
    }
  }
  if (params.pointCount !== undefined && !Number.isInteger(params.pointCount)) {
    throw new ProtocolError('INIT: pointCount must be an integer');
  }
  return { seed: msg.seed >>> 0, recipe: msg.recipe, params };
}

function validateStepEvent(e, stepFrame, index) {
  const what = `STEP event[${index}]`;
  if (!isObject(e)) throw new ProtocolError(`${what}: event must be an object`);
  assertFrameIndex(e.frame, what);
  if (e.frame !== stepFrame) {
    throw new ProtocolError(
      `${what}: event frame ${e.frame} does not match STEP frame ${stepFrame} — ` +
        'events apply exactly once, at their own frame',
    );
  }
  if (typeof e.type !== 'string' || !e.type) {
    throw new ProtocolError(`${what}: event type must be a non-empty string`);
  }
  switch (e.type) {
    case EVENT.IMPULSE:
      if (!isFiniteNumber(e.dx) || !isFiniteNumber(e.dy)) {
        throw new ProtocolError(`${what}: impulse needs finite dx/dy`);
      }
      break;
    case EVENT.AUDIO_ENVELOPE:
      if (!isFiniteNumber(e.energy) || e.energy < 0) {
        throw new ProtocolError(`${what}: audio-envelope needs energy >= 0`);
      }
      break;
    case EVENT.PARAM_SET:
      validateParamValue(e.key, e.value, what);
      break;
    default:
      throw new ProtocolError(`${what}: unknown event type "${e.type}"`);
  }
  return e;
}

export function validateStepMessage(msg) {
  assertProtocolField(msg, 'STEP');
  if (msg.type !== MSG.STEP) throw new ProtocolError(`STEP: wrong type "${String(msg.type)}"`);
  const frame = assertFrameIndex(msg.frame, 'STEP');
  if (!isFiniteNumber(msg.dt) || msg.dt < 0) {
    throw new ProtocolError(`STEP: dt must be a finite number >= 0 (got ${String(msg.dt)})`);
  }
  const events = msg.events === undefined ? [] : msg.events;
  if (!Array.isArray(events)) throw new ProtocolError('STEP: events must be an array');
  events.forEach((e, i) => validateStepEvent(e, frame, i));
  return { frame, dt: msg.dt, events };
}

export function validateSetParamMessage(msg) {
  assertProtocolField(msg, 'SET_PARAM');
  if (msg.type !== MSG.SET_PARAM) throw new ProtocolError(`SET_PARAM: wrong type "${String(msg.type)}"`);
  const frame = assertFrameIndex(msg.frame, 'SET_PARAM');
  validateParamValue(msg.key, msg.value, 'SET_PARAM');
  return { key: msg.key, value: msg.value, frame };
}

export function validateSnapshotMessage(msg) {
  assertProtocolField(msg, 'SNAPSHOT');
  if (msg.type !== MSG.SNAPSHOT) throw new ProtocolError(`SNAPSHOT: wrong type "${String(msg.type)}"`);
  return { atFrame: assertFrameIndex(msg.atFrame, 'SNAPSHOT') };
}

export function validateReturnMessage(msg) {
  assertProtocolField(msg, 'RETURN');
  if (msg.type !== MSG.RETURN) throw new ProtocolError(`RETURN: wrong type "${String(msg.type)}"`);
  const frame = assertFrameIndex(msg.frame, 'RETURN');
  const columns = msg.columns;
  if (!isObject(columns)) throw new ProtocolError('RETURN: columns must be an object');
  for (const name of POINT_COLUMN_NAMES) {
    const col = columns[name];
    // Columns arrive as transferred typed arrays (the client's FRAME payload,
    // handed back). DataView is rejected — the worker re-wraps known lanes.
    if (!ArrayBuffer.isView(col) || col instanceof DataView || col.buffer.byteLength === 0) {
      throw new ProtocolError(`RETURN: columns.${name} must be a live typed array`);
    }
  }
  return { frame, columns };
}

// ---------------------------------------------------------------------------
// Builders (worker → main thread)
// ---------------------------------------------------------------------------

export function readyMessage({ seed, params, kernelVersion }) {
  return { type: MSG.READY, protocol: PROTOCOL_VERSION, seed, params, kernelVersion };
}

export function frameMessage({ frame, columns, count }) {
  return { type: MSG.FRAME, protocol: PROTOCOL_VERSION, frame, columns, count };
}

export function paramAckMessage({ key, value, frame }) {
  return { type: MSG.PARAM_ACK, protocol: PROTOCOL_VERSION, key, value, frame };
}

export function snapshotResultMessage({ frame, columns, count }) {
  return { type: MSG.SNAPSHOT_RESULT, protocol: PROTOCOL_VERSION, frame, columns, count };
}

export function errorMessage({ message, forFrame }) {
  return { type: MSG.ERROR, protocol: PROTOCOL_VERSION, message: String(message), forFrame };
}

// ---------------------------------------------------------------------------
// Transfer-list assertion
// ---------------------------------------------------------------------------

/** The ArrayBuffers backing a FRAME / SNAPSHOT_RESULT column payload. */
export function payloadBuffers(reply) {
  const columns = reply && reply.columns;
  if (!isObject(columns)) return [];
  const out = [];
  for (const name of POINT_COLUMN_NAMES) {
    const col = columns[name];
    if (col && col.buffer instanceof ArrayBuffer) out.push(col.buffer);
  }
  return out;
}

/**
 * Assert every FRAME payload buffer is in the transfer list — the zero-copy
 * contract. A missing buffer means the payload would cross by structured
 * clone instead of transfer: in debug builds that throws (design doc: "a
 * clone fallback throws in debug builds"); in prod it returns the missing
 * list so the caller can fall back knowingly.
 */
export function assertTransferCoverage(reply, transfers, { debug = true } = {}) {
  const listed = new Set(Array.isArray(transfers) ? transfers : []);
  const missing = payloadBuffers(reply).filter((b) => !listed.has(b));
  if (missing.length > 0 && debug) {
    throw new ProtocolError(
      `FRAME: ${missing.length} payload buffer(s) missing from the transfer list — ` +
        'clone fallback is forbidden in debug builds',
    );
  }
  return missing;
}
