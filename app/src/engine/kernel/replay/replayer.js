// kernel/replay/replayer.js — headless deterministic replayer (#1313).
//
// Per docs/design/deterministic-replay.md: `replay(seed, eventLog, frameCount,
// { snapshotEvery })` runs the kernel with no renderer and no DOM and returns
// per-frame hashes plus optional snapshots. Same seed + same event log →
// byte-identical frame hashes, every run, every process.
//
// What the replayer steps (the v1 dish pipeline — fixed order, documented
// here because the order IS the bits):
//   0. events due at this frame apply in (frame, seq) order
//   1. module `audio`    — the session's quantized audioEnergy (scalar dish tone)
//   2. module `field`    — per-lane field gradient flow; writes the energy lane
//   3. module `attractor`— per-lane pull toward the pointer event position
//   4. advect (always)   — damped velocity integration into x/y
//
// The full dish §4 module order (ground → features → samplers → fields →
// marks → weather) is the declared expansion point — this slice proves the
// boundary, the event plumbing, and the bit-identity machinery; later slices
// hang the real modules here. `dish-module-toggle` events flip modules in
// REPLAY_MODULES; the registry's module list is the replay's module list.
//
// PRECISION RULE (kernel/soa/pointSet.js): f64 compute, f32 storage. Every
// arithmetic below runs in JS doubles; results land in the Float32Array
// columns. Identical op order ⇒ identical bits.
//
// FRAME INDICES, NEVER WALL-CLOCK: the event log carries frame indices only
// (enforced by eventLog.js); dt is a fixed recipe param, not a measured
// delta. There is no Date.now(), no Math.random(), no performance.now()
// anywhere in this file.
//
// Browser-safe: no node: imports (a pure-JS SHA-256 below), no DOM.

import { createDish } from '../dish.js';
import { createPointSet, POINT_COLUMN_NAMES } from '../soa/pointSet.js';
import { getSampler, getSamplerDecl } from '../sample/registry.js';
import { FIELDS } from '../field/registry.js';
import { hashU32 } from '../rng.js';
import { KERNEL_VERSION } from '../version.js';
import { EVENT_TYPES, parseEventLog, sortedEvents, quantizeEnergy } from './eventLog.js';

/** Replay modules, in fixed execution order. Toggled by dish-module-toggle. */
export const REPLAY_MODULES = Object.freeze(['audio', 'field', 'attractor']);

/** Recipe params a param-set event may change mid-run. */
export const SETTABLE_PARAMS = Object.freeze([
  'dt',
  'fieldStrength',
  'attractorStrength',
  'damping',
  'speed',
]);

/** Neutral defaults. Pinned by the replay goldens — moving a default moves
 *  golden hashes, which the selfcheck treats as a behavior change. */
export const DEFAULT_RECIPE = Object.freeze({
  sampler: 'grid',
  count: 512,
  canvasW: 1000,
  canvasH: 700,
  field: 'constant',
  fieldOpts: Object.freeze({ value: 1 }),
  params: Object.freeze({
    dt: 1 / 60, // fixed timestep — never a measured delta
    fieldStrength: 1.0,
    attractorStrength: 0.0,
    damping: 0.5, // per-second velocity retention (Math.pow(damping, dt) per frame)
    speed: 1.0,
  }),
  modules: Object.freeze({ audio: true, field: true, attractor: true }),
});

/** Dish §1b identity: family code for the replay-placed cohort (writer's namespace). */
const FAMILY_REPLAY = 2;

/** Max field-flow acceleration, px/s² at fieldStrength 1 and full drive. */
const FIELD_ACCEL = 600;
/** Max pointer-pull acceleration, px/s² at attractorStrength 1. */
const ATTRACTOR_ACCEL = 400;
/** Normalized-space epsilon for the field gradient central difference. */
const GRAD_EPS = 0.01;

export class ReplayError extends Error {
  constructor(message) {
    super(`[replay] ${message}`);
    this.name = 'ReplayError';
  }
}

// ---------------------------------------------------------------------------
// Pure-JS SHA-256 (browser-safe; kernel modules never import node:crypto).
// ---------------------------------------------------------------------------

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function sha256Hex(chunks) {
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  // Gather all bytes first: simpler padding, still O(total).
  let total = 0;
  for (const c of chunks) total += c.length;
  const msg = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { msg.set(c, off); off += c.length; }
  const bitLenHi = Math.floor(total / 0x20000000);
  const bitLenLo = (total << 3) >>> 0;
  const paddedLen = (((total + 9 + 63) / 64) | 0) * 64;
  const p = new Uint8Array(paddedLen);
  p.set(msg);
  p[total] = 0x80;
  const dv = new DataView(p.buffer);
  dv.setUint32(paddedLen - 8, bitLenHi);
  dv.setUint32(paddedLen - 4, bitLenLo);
  const w = new Int32Array(64);
  for (let b = 0; b < paddedLen; b += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getInt32(b + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = ((w[t - 15] >>> 7) | (w[t - 15] << 25)) ^ ((w[t - 15] >>> 18) | (w[t - 15] << 14)) ^ (w[t - 15] >>> 3);
      const s1 = ((w[t - 2] >>> 17) | (w[t - 2] << 15)) ^ ((w[t - 2] >>> 19) | (w[t - 2] << 13)) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let a = h0, bb = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA256_K[t] + w[t]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const mj = (a & bb) ^ (a & c) ^ (bb & c);
      const t2 = (S0 + mj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + bb) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => (v >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Recipe
// ---------------------------------------------------------------------------

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function isPlainObject(v) {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Validate + normalize a recipe. Fail-closed: unknown sampler/field ids,
 * bad params, and bad module maps throw — a golden must name real things.
 */
export function normalizeRecipe(raw) {
  if (!isPlainObject(raw)) throw new ReplayError('recipe must be a plain object');
  const d = DEFAULT_RECIPE;
  const sampler = raw.sampler === undefined ? d.sampler : raw.sampler;
  if (typeof sampler !== 'string' || !getSamplerDecl(sampler)) {
    throw new ReplayError(`unknown sampler "${String(sampler)}"`);
  }
  const count = raw.count === undefined ? d.count : raw.count;
  if (!Number.isInteger(count) || count < 1 || count > 1 << 20) {
    throw new ReplayError(`recipe.count must be an integer in [1, 2^20] (got ${String(count)})`);
  }
  const canvasW = raw.canvasW === undefined ? d.canvasW : raw.canvasW;
  const canvasH = raw.canvasH === undefined ? d.canvasH : raw.canvasH;
  if (!isFiniteNumber(canvasW) || canvasW <= 0 || !isFiniteNumber(canvasH) || canvasH <= 0) {
    throw new ReplayError('recipe.canvasW/canvasH must be finite numbers > 0');
  }
  const field = raw.field === undefined ? d.field : raw.field;
  if (typeof field !== 'string' || !FIELDS.get(field)) {
    throw new ReplayError(`unknown field "${String(field)}"`);
  }
  const fieldOpts = raw.fieldOpts === undefined ? {} : raw.fieldOpts;
  if (!isPlainObject(fieldOpts)) throw new ReplayError('recipe.fieldOpts must be a plain object');
  const params = { ...d.params, ...(isPlainObject(raw.params) ? raw.params : {}) };
  for (const key of Object.keys(params)) {
    if (!SETTABLE_PARAMS.includes(key)) {
      throw new ReplayError(`unknown recipe param "${key}" (settable: ${SETTABLE_PARAMS.join(', ')})`);
    }
    const v = params[key];
    if (!isFiniteNumber(v) || v < 0) {
      throw new ReplayError(`recipe param "${key}" must be a finite number >= 0`);
    }
  }
  if (!(params.dt > 0)) throw new ReplayError('recipe param "dt" must be > 0');
  if (!(params.damping > 0 && params.damping <= 1)) {
    throw new ReplayError('recipe param "damping" must be in (0, 1]');
  }
  const modules = { ...d.modules, ...(isPlainObject(raw.modules) ? raw.modules : {}) };
  for (const key of Object.keys(modules)) {
    if (!REPLAY_MODULES.includes(key)) {
      throw new ReplayError(`unknown replay module "${key}" (known: ${REPLAY_MODULES.join(', ')})`);
    }
    if (typeof modules[key] !== 'boolean') {
      throw new ReplayError(`replay module "${key}" must be a boolean`);
    }
  }
  return { sampler, count, canvasW, canvasH, field, fieldOpts, params, modules };
}

// ---------------------------------------------------------------------------
// Session: one dish, one SoA point set, frame-indexed events.
// ---------------------------------------------------------------------------

/** Seeded rng stream for the sampler ctx (mirrors the kernel rng discipline). */
function samplerRng(seed, samplerId) {
  let i = 0;
  return () => hashU32(seed, samplerId, i++) / 4294967296;
}

/**
 * Placement: run the recipe's sampler once per lane, writing straight into
 * the SoA columns (the #1309 column protocol). Velocities start at rest;
 * identity columns carry the dish §1b identity.
 */
function placePoints(set, recipe, seed) {
  const { count, canvasW: w, canvasH: h } = recipe;
  const fn = getSampler(recipe.sampler);
  const rng = samplerRng(seed, recipe.sampler);
  const sx = new Float64Array(count);
  const sy = new Float64Array(count);
  const out = { x: sx, y: sy, t: null, rot01: null };
  for (let i = 0; i < count; i++) {
    const ctx = { i, count, w, h, rng, jitter: 4, seed, caGrid: null, out, row: i };
    const ret = fn(ctx);
    // Column mode returns undefined and writes sx[i]/sy[i]; legacy samplers
    // return { x, y } (third-party path — zero breakage).
    const x = ret === undefined ? sx[i] : ret.x;
    const y = ret === undefined ? sy[i] : ret.y;
    set.x[i] = Number.isFinite(x) ? x : w / 2;
    set.y[i] = Number.isFinite(y) ? y : h / 2;
    set.vx[i] = 0;
    set.vy[i] = 0;
    set.slot[i] = 0;
    set.energy[i] = 0;
    set.id[i] = i + 1;
    set.family[i] = FAMILY_REPLAY;
    set.source[i] = 0;
  }
  set.count = count;
}

function createSession(seed, recipe) {
  const r = normalizeRecipe(recipe);
  const dish = createDish({ seed: seed >>> 0 });
  const set = createPointSet(r.count);
  placePoints(set, r, seed >>> 0);
  dish.points.replay = set; // the dish is the ownership root
  const fieldDecl = FIELDS.get(r.field);
  const session = {
    seed: seed >>> 0,
    recipe: r,
    dish,
    set,
    field: fieldDecl.create(seed >>> 0, r.fieldOpts),
    audioEnergy: 0,
    pointer: { x: r.canvasW / 2, y: r.canvasH / 2, strength: 0 },
    frame: -1,
  };
  return session;
}

/** Re-run placement (seed / recipe-load events): same seed ⇒ same columns. */
function replace(session, { seed, recipe } = {}) {
  if (seed !== undefined) session.seed = seed >>> 0;
  if (recipe !== undefined) {
    session.recipe = normalizeRecipe(recipe);
    const fieldDecl = FIELDS.get(session.recipe.field);
    session.field = fieldDecl.create(session.seed, session.recipe.fieldOpts);
  }
  const { count } = session.recipe;
  if (session.set.capacity < count) {
    session.set = createPointSet(count);
    session.dish.points.replay = session.set;
  }
  placePoints(session.set, session.recipe, session.seed);
  session.audioEnergy = 0;
  session.pointer = {
    x: session.recipe.canvasW / 2,
    y: session.recipe.canvasH / 2,
    strength: 0,
  };
}

function applyParamSet(session, params) {
  for (const key of Object.keys(params)) {
    if (!SETTABLE_PARAMS.includes(key)) {
      throw new ReplayError(
        `param-set: unknown param "${key}" (settable: ${SETTABLE_PARAMS.join(', ')})`,
      );
    }
    const v = params[key];
    if (!isFiniteNumber(v) || v < 0) {
      throw new ReplayError(`param-set: param "${key}" must be a finite number >= 0`);
    }
    if (key === 'dt' && !(v > 0)) throw new ReplayError('param-set: "dt" must be > 0');
    if (key === 'damping' && !(v > 0 && v <= 1)) {
      throw new ReplayError('param-set: "damping" must be in (0, 1]');
    }
    session.recipe.params[key] = v;
  }
}

function applyEvent(session, event) {
  const p = event.payload;
  switch (event.type) {
    case 'seed':
      replace(session, { seed: p.seed });
      break;
    case 'recipe-load':
      replace(session, { recipe: p.recipe });
      break;
    case 'param-set':
      applyParamSet(session, p.params);
      break;
    case 'pointer':
      session.pointer = { x: p.x, y: p.y, strength: p.strength };
      break;
    case 'audio-envelope':
      session.audioEnergy = quantizeEnergy(p.energy);
      break;
    case 'dish-module-toggle':
      if (!REPLAY_MODULES.includes(p.module)) {
        throw new ReplayError(
          `dish-module-toggle: unknown module "${p.module}" (known: ${REPLAY_MODULES.join(', ')})`,
        );
      }
      session.recipe.modules[p.module] = p.enabled;
      break;
    default:
      throw new ReplayError(`unknown event type "${event.type}"`);
  }
}

/**
 * Advance one frame. Fixed op order — the order IS the bits:
 *   1. field module: sample the field at each lane (normalized coords),
 *      write the energy lane, flow along the normalized gradient scaled by
 *      fieldStrength × audio drive × FIELD_ACCEL × dt.
 *   2. attractor module: pull toward the pointer position scaled by
 *      attractorStrength × strength × ATTRACTOR_ACCEL × dt.
 *   3. advect: per-second damping (damping^dt), then x += v × speed × dt.
 *
 * The audio drive mirrors the growth discipline (sample/growth.js
 * cellsPerTick): 0.15 + 0.85 × energy when the audio module is on, 1 when
 * it is off — so a null envelope is a quiet drift, never a freeze
 * (KC-1 design law: subtle motion always, never static).
 */
function stepFrame(session) {
  const { set, recipe, field } = session;
  const p = recipe.params;
  const n = set.count;
  const dt = p.dt;
  const damp = Math.pow(p.damping, dt);
  const drive = recipe.modules.audio ? 0.15 + 0.85 * session.audioEnergy : 1;
  const fieldOn = recipe.modules.field;
  const attractOn = recipe.modules.attractor && session.pointer.strength > 0;
  const W = recipe.canvasW;
  const H = recipe.canvasH;
  const fAccel = p.fieldStrength * drive * FIELD_ACCEL * dt;
  const aAccel = session.pointer.strength * p.attractorStrength * ATTRACTOR_ACCEL * dt;
  const speedDt = p.speed * dt;

  for (let i = 0; i < n; i++) {
    const px = set.x[i];
    const py = set.y[i];
    let vx = set.vx[i];
    let vy = set.vy[i];
    if (fieldOn) {
      const nx = px / W;
      const ny = py / H;
      const s = field.sample(nx, ny);
      set.energy[i] = s;
      const gx = (field.sample(nx + GRAD_EPS, ny) - field.sample(nx - GRAD_EPS, ny)) / (2 * GRAD_EPS);
      const gy = (field.sample(nx, ny + GRAD_EPS) - field.sample(nx, ny - GRAD_EPS)) / (2 * GRAD_EPS);
      const gm = Math.sqrt(gx * gx + gy * gy);
      if (gm > 1e-9 && fAccel !== 0) {
        vx += (gx / gm) * fAccel;
        vy += (gy / gm) * fAccel;
      }
    }
    if (attractOn && aAccel !== 0) {
      const dx = session.pointer.x - px;
      const dy = session.pointer.y - py;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1e-6) {
        vx += (dx / d) * aAccel;
        vy += (dy / d) * aAccel;
      }
    }
    vx *= damp;
    vy *= damp;
    set.x[i] = px + vx * speedDt;
    set.y[i] = py + vy * speedDt;
    set.vx[i] = vx;
    set.vy[i] = vy;
  }
  session.frame += 1;
}

/** SHA-256 over the raw column bytes in canonical order — the frame hash. */
function hashFrameColumns(set) {
  const chunks = [];
  for (const name of POINT_COLUMN_NAMES) {
    const col = set[name];
    const bytes = new Uint8Array(col.buffer, col.byteOffset, set.count * col.BYTES_PER_ELEMENT);
    chunks.push(bytes);
  }
  return sha256Hex(chunks);
}

/** Raw SoA column dump (the design doc's "cheap snapshot"). */
function dumpSnapshot(session, frame) {
  const { set } = session;
  const columns = {};
  for (const name of POINT_COLUMN_NAMES) {
    columns[name] = Array.from(set[name].slice(0, set.count));
  }
  return { frame, count: set.count, columns };
}

// ---------------------------------------------------------------------------
// replay(seed, eventLog, frameCount, { snapshotEvery })
// ---------------------------------------------------------------------------

/**
 * Run the kernel headless over `frameCount` frames.
 *
 * @param {number} seed            run seed (a `seed` event re-seeds mid-run)
 * @param {object} eventLog        from createEventLog()/parseEventLog(), or
 *                                 its serialized form
 * @param {number} frameCount      frames to step (positive integer)
 * @param {object} [opts]
 * @param {number} [opts.snapshotEvery=0]  snapshot columns every N frames (0 = none)
 * @param {object} [opts.recipe]  initial recipe (a frame-0 recipe-load event
 *                                 overrides it — the log is authoritative)
 * @returns {{ seed, kernelVersion, frameCount, eventCount, frameHashes,
 *             snapshots, recipe }}
 */
export function replay(seed, eventLog, frameCount, { snapshotEvery = 0, recipe } = {}) {
  if (!isFiniteNumber(seed)) {
    throw new ReplayError(`seed must be a finite number (got ${String(seed)})`);
  }
  if (!Number.isInteger(frameCount) || frameCount < 1) {
    throw new ReplayError(`frameCount must be a positive integer (got ${String(frameCount)})`);
  }
  if (!Number.isInteger(snapshotEvery) || snapshotEvery < 0) {
    throw new ReplayError(`snapshotEvery must be a non-negative integer (got ${String(snapshotEvery)})`);
  }
  const log = parseEventLog(
    eventLog && Array.isArray(eventLog.events) && eventLog.version === undefined
      ? { version: 1, events: eventLog.events.map((e) => ({ frame: e.frame, type: e.type, payload: e.payload })) }
      : eventLog,
  );
  const events = sortedEvents(log);
  const session = createSession(seed, recipe === undefined ? DEFAULT_RECIPE : recipe);

  const frameHashes = [];
  const snapshots = [];
  let ei = 0;
  for (let f = 0; f < frameCount; f++) {
    while (ei < events.length && events[ei].frame === f) {
      applyEvent(session, events[ei]);
      ei += 1;
    }
    stepFrame(session);
    frameHashes.push(hashFrameColumns(session.set));
    if (snapshotEvery > 0 && f % snapshotEvery === 0) {
      snapshots.push(dumpSnapshot(session, f));
    }
  }
  if (ei < events.length) {
    throw new ReplayError(
      `${events.length - ei} event(s) target frames >= frameCount (${frameCount}) — ` +
      'extend frameCount or trim the log; events are never silently dropped',
    );
  }
  return {
    seed: seed >>> 0,
    kernelVersion: KERNEL_VERSION,
    frameCount,
    eventCount: events.length,
    frameHashes,
    snapshots,
    recipe: session.recipe,
  };
}

export { EVENT_TYPES, KERNEL_VERSION };
