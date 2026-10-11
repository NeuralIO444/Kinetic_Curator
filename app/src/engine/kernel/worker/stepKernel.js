// kernel/worker/stepKernel.js — the deterministic per-frame kernel (#1311).
//
// ONE CODE PATH, TWO HOSTS: kernel.worker.js (worker thread) and the runInline
// fallback in kernelClient.js both execute dispatchKernelMessage below. Same
// seed + same events → bit-identical columns on either host; the parity
// selfcheck (kernelWorker.selfcheck.mjs) is the gate.
//
// What the step does in this slice: the worker owns one dish instance; per
// frame it integrates the live point-set cohort (seeded scatter at INIT,
// velocity integration per STEP, frame-indexed events) and writes the result
// into one of two double-buffered SoA frame sets. The full dish §4 module
// order (ground → features → samplers → fields → marks → weather) is the
// declared expansion point — this slice proves the boundary, the protocol,
// and the bit-identity machinery; later slices hang the real modules here.
//
// PRECISION RULE (kernel/soa/pointSet.js): f64 compute, f32 storage. Every
// arithmetic below runs in JS doubles; results land in the Float32Array
// columns. Identical op order on both hosts ⇒ identical bits.
//
// FRAME INDICES, NEVER WALL-CLOCK: STEP frames must arrive strictly in
// sequence (lastFrame+1). The main thread stays the clock owner; dt arrives
// quantized in the STEP message.

import { createDish } from '../dish.js';
import { createPointSet, POINT_COLUMN_NAMES } from '../soa/pointSet.js';
import { CH, hashU32 } from '../rng.js';
import { KERNEL_VERSION } from '../version.js';
import {
  MSG,
  EVENT,
  PROTOCOL_VERSION,
  ProtocolError,
  validateInitMessage,
  validateStepMessage,
  validateSetParamMessage,
  validateSnapshotMessage,
  validateReturnMessage,
  readyMessage,
  frameMessage,
  paramAckMessage,
  snapshotResultMessage,
  errorMessage,
} from './protocol.js';

/** Neutral defaults. The phase-2 baseline never touches this path, so these
 *  are free — but they are still pinned: changing a default moves the
 *  worker parity hashes, which the selfcheck treats as a behavior change. */
export const DEFAULT_STEP_PARAMS = Object.freeze({
  pointCount: 256,
  damping: 1.0, // per-second velocity retention (1.0 = no decay)
  speed: 1.0, // position integration scale
  audioGain: 0.25, // velocity scale per unit of quantized audio energy
  boundW: 1000, // INIT scatter bounds (px)
  boundH: 1000,
});

/** Identity family code for the seeded scatter cohort (writer's namespace). */
const FAMILY_SCATTER = 1;

/** Deterministic INIT fill: seeded scatter, no wall-clock, no Math.random. */
function fillSeeded(set, seed, params) {
  const n = set.capacity;
  for (let i = 0; i < n; i++) {
    const gx = hashU32(seed, CH.geo, i * 2) / 4294967296;
    const gy = hashU32(seed, CH.geo, i * 2 + 1) / 4294967296;
    const dx = hashU32(seed, CH.dyn, i * 2) / 4294967296;
    const dy = hashU32(seed, CH.dyn, i * 2 + 1) / 4294967296;
    set.x[i] = gx * params.boundW;
    set.y[i] = gy * params.boundH;
    set.vx[i] = (dx - 0.5) * 40;
    set.vy[i] = (dy - 0.5) * 40;
    set.energy[i] = 1;
    set.slot[i] = 0;
    set.id[i] = i + 1;
    set.family[i] = FAMILY_SCATTER;
    set.source[i] = 0;
  }
  set.count = n;
}

/**
 * Create the worker's session: one dish instance, one live point set, two
 * double-buffered frame sets. Called on INIT (re-INIT = deterministic restart).
 */
export function createKernelSession({ seed, recipe, params } = {}) {
  const p = { ...DEFAULT_STEP_PARAMS, ...(params || {}) };
  const count = Math.max(1, Math.floor(p.pointCount));
  const dish = createDish({ seed });
  const live = createPointSet(count);
  fillSeeded(live, seed, p);
  dish.points.live = live; // the dish is the ownership root
  const session = {
    seed,
    recipe: recipe === undefined ? null : recipe,
    params: p,
    dish,
    live,
    frames: [createPointSet(count), createPointSet(count)],
    count,
    lastFrame: -1,
    audioEnergy: 0,
    reallocs: 0, // debug stat: frame sets reallocated after detached buffers
  };
  return session;
}

/** Apply a validated param change. */
export function applyKernelParam(session, key, value) {
  session.params[key] = value;
}

/** True when the set's column buffers were transferred away (detached). */
function isDetached(set) {
  return set.x.buffer.byteLength === 0;
}

/** The writable frame set for this frame: frames[frame & 1], reallocating
 *  when its buffers were transferred away and never returned. */
function writableFrameSet(session, frame) {
  const slot = frame & 1;
  let set = session.frames[slot];
  if (isDetached(set)) {
    set = createPointSet(session.count);
    session.frames[slot] = set;
    session.reallocs += 1;
  }
  return set;
}

/** Full overwrite of [0, n): the acquire-contract's "fully overwritten"
 *  branch — a reader never sees a stale lane. */
function copyColumns(from, to, n) {
  for (const name of POINT_COLUMN_NAMES) {
    to[name].set(from[name].subarray(0, n));
  }
  to.count = n;
}

/**
 * Advance one frame. Fixed op order, documented here because the order IS
 * the bits:
 *   1. events apply in list order: impulses accumulate (ix, iy); the last
 *      audio-envelope wins and becomes the session's quantized energy;
 *      param-set applies immediately.
 *   2. audio scale as = 1 + energy * audioGain; damping damp = damping^dt.
 *   3. per lane: v = (v + impulse) * as * damp; x += v * speed * dt.
 *   4. the live set is copied whole into frames[frame & 1].
 */
export function stepKernelFrame(session, { frame, dt, events }) {
  if (frame !== session.lastFrame + 1) {
    throw new ProtocolError(
      `STEP frame ${frame} out of sequence (expected ${session.lastFrame + 1}) — ` +
        'frame indices are the clock; skipped frames are a protocol error',
    );
  }
  let ix = 0;
  let iy = 0;
  let energy = session.audioEnergy;
  for (const e of events) {
    if (e.type === EVENT.IMPULSE) {
      ix += e.dx;
      iy += e.dy;
    } else if (e.type === EVENT.AUDIO_ENVELOPE) {
      energy = e.energy;
    } else if (e.type === EVENT.PARAM_SET) {
      applyKernelParam(session, e.key, e.value);
    }
  }
  session.audioEnergy = energy;

  const { damping, speed, audioGain } = session.params;
  const as = 1 + energy * audioGain;
  const damp = Math.pow(damping, dt);
  const sdt = speed * dt;
  const live = session.live;
  const n = session.count;
  for (let i = 0; i < n; i++) {
    const vx = (live.vx[i] + ix) * as * damp;
    const vy = (live.vy[i] + iy) * as * damp;
    live.vx[i] = vx;
    live.vy[i] = vy;
    live.x[i] = live.x[i] + vx * sdt;
    live.y[i] = live.y[i] + vy * sdt;
  }
  session.lastFrame = frame;

  const set = writableFrameSet(session, frame);
  copyColumns(live, set, n);
  return { frame, columns: set, count: n };
}

/** Fresh-array snapshot of the current frame's columns (safe to transfer).
 * Copies from session.live, not frames[lastFrame & 1]: the frame set's
 * buffers were transferred to the client by the STEP that produced them and
 * are detached here, while live still holds the identical values (nothing
 * mutates live between STEP N and SNAPSHOT N — SET_PARAM only touches params).
 * Same source on both hosts ⇒ bit-identical snapshots worker vs inline. */
export function snapshotKernel(session, atFrame) {
  if (atFrame !== session.lastFrame) {
    throw new ProtocolError(
      `SNAPSHOT atFrame ${atFrame} is not the current frame ${session.lastFrame}`,
    );
  }
  const copy = createPointSet(session.count);
  copyColumns(session.live, copy, session.count);
  return { frame: atFrame, columns: copy, count: session.count };
}

/** The backing ArrayBuffers of a column set, in canonical column order. */
export function columnTransferList(columns) {
  return POINT_COLUMN_NAMES.map((name) => columns[name].buffer);
}

/**
 * Reattach buffers returned by the client to frames[frame & 1]. Only when
 * that set is currently detached (its buffers were transferred away) and the
 * returned lanes match the session's capacity — otherwise the return is
 * stale and is dropped (the next write reallocates).
 */
export function reattachReturned(session, frame, columns) {
  const slot = frame & 1;
  const set = session.frames[slot];
  if (!isDetached(set)) return false;
  const ctors = {
    x: Float32Array,
    y: Float32Array,
    vx: Float32Array,
    vy: Float32Array,
    slot: Uint16Array,
    energy: Float32Array,
    id: Uint32Array,
    family: Uint8Array,
    source: Uint16Array,
  };
  for (const name of POINT_COLUMN_NAMES) {
    const col = columns[name];
    if (!(col instanceof ctors[name]) || col.length !== session.count) return false;
  }
  session.frames[slot] = {
    x: columns.x,
    y: columns.y,
    vx: columns.vx,
    vy: columns.vy,
    slot: columns.slot,
    energy: columns.energy,
    id: columns.id,
    family: columns.family,
    source: columns.source,
    count: set.count,
    capacity: session.count,
  };
  return true;
}

/**
 * The one code path: dispatch a protocol message against a session.
 * Returns { session, reply, transfers }. Throws ProtocolError on contract
 * violations — the caller (worker entry or inline host) converts to an
 * ERROR reply / rejection.
 */
export function dispatchKernelMessage(session, msg) {
  if (!msg || typeof msg.type !== 'string') {
    throw new ProtocolError('message must carry a string type');
  }
  switch (msg.type) {
    case MSG.INIT: {
      const init = validateInitMessage(msg);
      const next = createKernelSession(init);
      return {
        session: next,
        reply: readyMessage({ seed: next.seed, params: next.params, kernelVersion: KERNEL_VERSION }),
        transfers: [],
      };
    }
    case MSG.STEP: {
      if (!session) throw new ProtocolError('STEP before INIT');
      const step = validateStepMessage(msg);
      const { frame, columns, count } = stepKernelFrame(session, step);
      const reply = frameMessage({ frame, columns, count });
      return { session, reply, transfers: columnTransferList(columns) };
    }
    case MSG.SET_PARAM: {
      if (!session) throw new ProtocolError('SET_PARAM before INIT');
      const sp = validateSetParamMessage(msg);
      applyKernelParam(session, sp.key, sp.value);
      return { session, reply: paramAckMessage(sp), transfers: [] };
    }
    case MSG.SNAPSHOT: {
      if (!session) throw new ProtocolError('SNAPSHOT before INIT');
      const sn = validateSnapshotMessage(msg);
      const snap = snapshotKernel(session, sn.atFrame);
      const reply = snapshotResultMessage(snap);
      return { session, reply, transfers: columnTransferList(snap.columns) };
    }
    case MSG.RETURN: {
      if (!session) throw new ProtocolError('RETURN before INIT');
      const ret = validateReturnMessage(msg);
      reattachReturned(session, ret.frame, ret.columns);
      return { session, reply: null, transfers: [] };
    }
    default:
      throw new ProtocolError(`unknown message type "${msg.type}"`);
  }
}

/** Wrap a dispatch for the wire: ProtocolErrors become ERROR replies. */
export function dispatchToReply(session, msg) {
  try {
    return dispatchKernelMessage(session, msg);
  } catch (err) {
    const message = err instanceof ProtocolError ? err.message : String((err && err.message) || err);
    return {
      session,
      reply: errorMessage({
        message,
        // SNAPSHOT carries atFrame, not frame; forType keeps a SET_PARAM error
        // at frame N from being mistaken for the pending STEP N.
        forFrame: msg && (msg.frame !== undefined ? msg.frame : msg.atFrame),
        forType: msg && msg.type,
      }),
      transfers: [],
    };
  }
}

export { PROTOCOL_VERSION, MSG, EVENT, ProtocolError };
