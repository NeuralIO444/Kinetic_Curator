/*
 * Kernel worker PROBE entry — issue #1312 (kernel worker 3/3).
 *
 * This is NOT the production kernel worker (worker 2/3 is still open).
 * It implements the versioned protocol SHAPE from
 * docs/design/worker-thread-kernel.md — INIT -> READY, STEP -> FRAME,
 * SET_PARAM -> PARAM_ACK — over double-buffered Float32Array SoA columns,
 * so the probe validates the transport contract the real entry will speak:
 *   - new Worker() construction (file URL + Blob URL)
 *   - postMessage with transferable ArrayBuffers, both directions
 *   - zero-copy round-trip of Float32Array column buffers
 *   - frame-indexed events (the design doc's determinism guard)
 *
 * Purity note (worker 1/3): no imports, no DOM, no timers, no wall clock —
 * message in, buffers out. The column fill is an integer hash, exactly
 * reproducible on the main thread (no libm dependence), so the probe page
 * can verify every transferred float bit-for-bit.
 */
'use strict';

const PROTOCOL_VERSION = 1;
const COLUMN_NAMES = ['x', 'y', 'vx', 'vy'];
const COLUMN_COUNT = 1024; // SoA column length (dish tile scale)
const BUFFER_SETS = 2; // double-buffered frame sets

// Integer hash — exactly reproducible in every JS engine.
function hash32(a) {
  a |= 0;
  a = (a ^ 61) ^ (a >>> 16);
  a = (a + (a << 3)) | 0;
  a = (a ^ (a >>> 4)) | 0;
  a = Math.imul(a, 0x27d4eb2d);
  a = (a ^ (a >>> 15)) | 0;
  return a >>> 0;
}

// Deterministic unit float in [0, 1) from (seed, frame, column, index).
// Integer ops only — identical in every JS engine, so the main thread can
// recompute the expected column contents exactly. MUST stay identical to
// the copy in kernel-worker-probe.html.
function columnValue(seed, frame, col, i) {
  const h =
    (seed | 0) ^
    Math.imul(frame | 0, 0x9e3779b1) ^
    Math.imul(col | 0, 0x85ebca6b) ^
    Math.imul(i | 0, 0xc2b2ae35);
  return hash32(h) / 4294967296;
}

function freshSet() {
  const set = {};
  for (const name of COLUMN_NAMES) set[name] = new Float32Array(COLUMN_COUNT);
  return set;
}

// state = { seed, params, sets, frames }
let state = null;

function handleInit(msg) {
  if (typeof msg.seed !== 'number' || !Number.isFinite(msg.seed)) {
    postMessage({ type: 'ERROR', error: 'INIT requires a finite numeric seed' });
    return;
  }
  state = {
    seed: msg.seed | 0,
    params: Object.assign({}, msg.params),
    sets: [freshSet(), freshSet()],
    frames: 0,
  };
  postMessage({
    type: 'READY',
    protocol: PROTOCOL_VERSION,
    columns: { names: COLUMN_NAMES.slice(), count: COLUMN_COUNT },
    bufferSets: BUFFER_SETS,
  });
}

function handleStep(msg) {
  if (!state) {
    postMessage({ type: 'ERROR', error: 'STEP before INIT' });
    return;
  }
  if (!Number.isInteger(msg.frame) || msg.frame < 0) {
    postMessage({ type: 'ERROR', error: 'STEP requires a non-negative integer frame' });
    return;
  }
  // Determinism guard from the design doc: every event carries a frame
  // index, never wall-clock time. Reject anything that violates it.
  const events = msg.events || [];
  for (const ev of events) {
    if (!ev || ev.frame !== msg.frame) {
      postMessage({ type: 'ERROR', error: 'event without matching frame index rejected' });
      return;
    }
  }
  const setIndex = msg.frame % BUFFER_SETS;
  const set = state.sets[setIndex];
  const transfers = [];
  const out = {};
  for (let c = 0; c < COLUMN_NAMES.length; c++) {
    const name = COLUMN_NAMES[c];
    const col = set[name];
    for (let i = 0; i < COLUMN_COUNT; i++) {
      col[i] = columnValue(state.seed, msg.frame, c, i);
    }
    out[name] = col;
    transfers.push(col.buffer);
  }
  state.frames += 1;
  postMessage(
    {
      type: 'FRAME',
      frame: msg.frame,
      set: setIndex,
      columns: out,
      eventsSeen: events.length,
    },
    transfers
  );
  // Transfer audit: detachment is synchronous inside postMessage, so reading
  // byteLength right after proves zero-copy transfer (not structured clone).
  const audit = {};
  for (const name of COLUMN_NAMES) {
    audit[name] = out[name].buffer.byteLength === 0;
  }
  postMessage({ type: 'TRANSFER_AUDIT', frame: msg.frame, detached: audit });
  // Rotate: the transferred set is detached now — re-allocate so the next
  // STEP on this set writes into live buffers (no aliasing a dead buffer).
  state.sets[setIndex] = freshSet();
}

function handleSetParam(msg) {
  if (!state) {
    postMessage({ type: 'ERROR', error: 'SET_PARAM before INIT' });
    return;
  }
  state.params[msg.key] = msg.value;
  postMessage({ type: 'PARAM_ACK', key: msg.key, value: msg.value, frame: msg.frame | 0 });
}

// Minimal incoming-transfer receipt: the main thread proves main->worker
// transfer by observing its own buffer detach; the worker just confirms the
// payload arrived intact (exact head samples, no arithmetic).
function handleEcho(msg) {
  const buf = msg.buf;
  if (!(buf instanceof Float32Array)) {
    postMessage({ type: 'ERROR', error: 'ECHO expects a Float32Array buf' });
    return;
  }
  const n = buf.length;
  postMessage({
    type: 'ECHO_ACK',
    id: msg.id,
    length: n,
    head: [buf[0], buf[(n / 2) | 0], buf[n - 1]],
  });
}

self.onmessage = (e) => {
  const msg = e.data || {};
  switch (msg.type) {
    case 'INIT':
      handleInit(msg);
      break;
    case 'STEP':
      handleStep(msg);
      break;
    case 'SET_PARAM':
      handleSetParam(msg);
      break;
    case 'ECHO':
      handleEcho(msg);
      break;
    default:
      postMessage({ type: 'ERROR', error: 'unknown message type: ' + msg.type });
  }
};
