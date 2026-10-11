// performanceFile.mjs — #1353 step 3: the performance file and the replayer that proves it.
//
// A performance is the live resolver's input sequence (kernel/replay/inputLog.js), plus checkpoints: every frame's
// OUTPUT is folded into a running hash chain, and the chain is stored every CHECKPOINT_EVERY frames (the take ends on
// its last checkpoint), so every single frame is covered. Replaying the inputs through a fresh
// resolver must land on every checkpoint. That is "replay matches the live run", checked, not assumed.
//
// DETAIL IS PER MACHINE (Matt, 2026-10-11). The file is the artist's intent. The keys in MACHINE_KEYS describe the
// machine that recorded it (how much detail its governor shed, its canvas, its OS motion preference). They are in
// the file as a NOTE: verification replays them as recorded, because that is the only way to prove the replay is
// exact; any future playback must take them from the machine doing the playing. Known limit, written down here so
// it is not discovered later: `slowRender` mixes the governor's slow-render state with the artist's PAUSE (liveLoop
// passes `slowRender || !running`), so a future playback has to record `running` separately before it can split them.
//
// The stored form is gzip of JSON text, through the Web Streams API (the same code in the browser and in Node).
import { createLiveResolver } from './liveResolve.mjs';
import { createInputLog, replayInputs, INPUT_LOG_VERSION } from '../engine/kernel/replay/inputLog.js';
import { KERNEL_VERSION } from '../engine/kernel/version.js';

export const PERFORMANCE_FORMAT = 'kc-performance';
export const PERFORMANCE_VERSION = 2;
export const CHECKPOINT_EVERY = 60;
/** Recording stops here (and says so): 20 minutes at 60 fps. A longer take is a new file. */
export const MAX_FRAMES = 60 * 60 * 20;
/** Inputs that describe the recording MACHINE, not the performance. A note, never an instruction (see header). */
export const MACHINE_KEYS = Object.freeze([
  'quality', 'perfTier1', 'assetThin', 'perfClampOverride', 'slowRender', 'reducedMotion', 'canvasW', 'canvasH',
]);

export class PerformanceFileError extends Error {
  constructor(message) {
    super(`[performance] ${message}`);
    this.name = 'PerformanceFileError';
  }
}

// ── the frame hash: a walk of the resolver's output, folded into two 32-bit lanes ─────────────────────────────────
// Built to run EVERY frame while recording, so it is cheap: numbers are folded as their raw IEEE-754 bits (exact,
// so -0 differs from 0 and one ulp is a different hash; no number-to-text conversion), and object keys are visited
// in their own order (no sort). That makes the hash depend on key order, which is fine for its one job: the live
// run and its replay go through the same resolver code and build their objects the same way. It is not
// cryptographic (it guards against drift, not forgery) and it is identical in the browser and in Node.
const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);
let ha = 0;
let hb = 0;
function word(w) {
  ha = Math.imul(ha ^ w, 0x01000193);
  hb = (Math.imul(hb ^ w, 0x85ebca6b) ^ (hb >>> 13)) | 0;
}
function str(s) {
  for (let i = 0; i < s.length; i++) word(s.charCodeAt(i));
  word(0x1f000000 | s.length);
}
function walk(v, depth) {
  if (v === null || v === undefined) { word(0xa0000000); return; }
  const t = typeof v;
  if (t === 'number') { F64[0] = v; word(U32[0]); word(U32[1]); return; }
  if (t === 'string') { word(0xa0000002); str(v); return; }
  if (t === 'boolean') { word(v ? 0xa0000003 : 0xa0000004); return; }
  if (t === 'function') { word(0xa0000005); return; }
  if (depth > 12) { word(0xa0000006); return; }
  if (Array.isArray(v) || ArrayBuffer.isView(v)) {
    word(0xa0000007);
    for (let i = 0; i < v.length; i++) walk(v[i], depth + 1);
    word(0xa0000008 ^ v.length);
    return;
  }
  word(0xa0000009);
  for (const k in v) { if (Object.prototype.hasOwnProperty.call(v, k)) { str(k); walk(v[k], depth + 1); } }
  word(0xa000000a);
}
const hex8 = (n) => (n >>> 0).toString(16).padStart(8, '0');

/** Hash of one resolver output (16 hex chars). */
export function frameHash(output) {
  ha = 0x811c9dc5;
  hb = 0x9e3779b9;
  walk(output, 0);
  return hex8(ha) + hex8(hb);
}

/**
 * A running chain over EVERY frame: chain' = mix(chain, frame). A checkpoint stores the chain, so one differing
 * frame anywhere before it changes it. Sampling a hash only every N frames would miss a one-frame difference.
 */
export function createHashChain() {
  let ca = 0x2545f491;
  let cb = 0x6c62272e;
  return {
    /** Fold one resolver output into the chain. */
    push(output) {
      ha = ca ^ 0x811c9dc5;
      hb = cb ^ 0x9e3779b9;
      walk(output, 0);
      ca = ha;
      cb = hb;
    },
    value: () => hex8(ca) + hex8(cb),
  };
}

/**
 * Recorder. Feed it every frame's input, then that frame's output, in order (the two taps in resolveTap.mjs do
 * exactly that). `finish()` returns the performance object.
 */
export function createPerformanceRecorder({ checkpointEvery = CHECKPOINT_EVERY, maxFrames = MAX_FRAMES } = {}) {
  const log = createInputLog();
  const checkpoints = [];
  const chain = createHashChain();
  let truncated = false;
  let pending = false; // an input was recorded and its output has not arrived yet
  return {
    get frames() { return log.frames; },
    get truncated() { return truncated; },
    onInput(input) {
      if (log.frames >= maxFrames) { truncated = true; pending = false; return; }
      log.record(input);
      pending = true;
    },
    onOutput(output) {
      if (!pending) return;
      pending = false;
      const frame = log.frames - 1;
      // Fold EVERY frame into the chain, now: the resolver may reuse these objects next frame, so an output cannot
      // be kept for later. A checkpoint is the chain's value, so it covers every frame up to and including itself.
      chain.push(output);
      if (frame % checkpointEvery === 0) checkpoints.push({ frame, hash: chain.value() });
    },
    /**
     * The performance object. The take ENDS ON ITS LAST CHECKPOINT: frames after it could not be verified (their
     * output was never hashed), so they are not in the file. That costs less than `checkpointEvery` frames of tail.
     */
    finish() {
      if (checkpoints.length === 0) throw new PerformanceFileError('nothing recorded: no frame has been resolved yet');
      const frames = checkpoints[checkpoints.length - 1].frame + 1;
      const inputs = log.finish();
      return {
        format: PERFORMANCE_FORMAT,
        version: PERFORMANCE_VERSION,
        kernelVersion: KERNEL_VERSION,
        frames,
        truncated,
        machineKeys: [...MACHINE_KEYS],
        checkpointEvery,
        checkpoints: checkpoints.slice(),
        inputs: { ...inputs, frames, steps: inputs.steps.slice(0, frames) },
      };
    },
  };
}

/** Validate a parsed performance object. Fail-closed. Returns it. */
export function checkPerformance(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new PerformanceFileError('not a performance object');
  if (p.format !== PERFORMANCE_FORMAT) throw new PerformanceFileError(`unknown format ${String(p.format)}`);
  if (p.version !== PERFORMANCE_VERSION) throw new PerformanceFileError(`unsupported version ${String(p.version)} (want ${PERFORMANCE_VERSION})`);
  if (!Number.isInteger(p.frames) || p.frames < 1) throw new PerformanceFileError('frames must be a positive integer');
  if (!p.inputs || p.inputs.version !== INPUT_LOG_VERSION || !Array.isArray(p.inputs.steps)) throw new PerformanceFileError('inputs must be an input log');
  if (p.inputs.steps.length !== p.frames) throw new PerformanceFileError(`inputs hold ${p.inputs.steps.length} frames, header says ${p.frames}`);
  if (!Array.isArray(p.checkpoints) || p.checkpoints.length === 0) throw new PerformanceFileError('no checkpoints: a file that cannot be verified is not a performance');
  for (const c of p.checkpoints) {
    if (!c || !Number.isInteger(c.frame) || c.frame < 0 || c.frame >= p.frames || typeof c.hash !== 'string') {
      throw new PerformanceFileError('checkpoints must be [{ frame, hash }] inside the take');
    }
  }
  if (typeof p.kernelVersion !== 'string') throw new PerformanceFileError('kernelVersion must be a string');
  return p;
}

/**
 * Replay a performance through a FRESH resolver and compare every checkpoint.
 * `firstMismatchFrame` is the first CHECKPOINT whose chain differs: the differing frame is at or before it, after
 * the previous checkpoint.
 * @returns {{ ok, frames, checked, firstMismatchFrame, kernelMismatch }}
 */
export function verifyPerformance(perf, { resolverFactory = createLiveResolver } = {}) {
  const p = checkPerformance(perf);
  const want = new Map(p.checkpoints.map((c) => [c.frame, c.hash]));
  const resolver = resolverFactory();
  const chain = createHashChain();
  let f = 0;
  let checked = 0;
  let firstMismatchFrame = null;
  try {
    for (const input of replayInputs(p.inputs)) {
      chain.push(resolver.resolveLayers(input));
      if (want.has(f)) {
        checked += 1;
        if (firstMismatchFrame === null && chain.value() !== want.get(f)) firstMismatchFrame = f;
      }
      f += 1;
    }
  } finally {
    if (typeof resolver.dispose === 'function') resolver.dispose();
  }
  return {
    ok: firstMismatchFrame === null && checked === want.size,
    frames: f,
    checked,
    firstMismatchFrame,
    kernelMismatch: p.kernelVersion !== KERNEL_VERSION,
  };
}

// ── the stored form: gzip(JSON), via Web Streams (browser + Node) ───────────────────────────────────────────────
async function pump(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Performance object → gzipped bytes (what goes in a .kcperf file). */
export async function packPerformance(perf) {
  const text = JSON.stringify(checkPerformance(perf));
  return pump(new TextEncoder().encode(text), new CompressionStream('gzip'));
}

/** Gzipped bytes → validated performance object. */
export async function unpackPerformance(bytes) {
  let text;
  try {
    text = new TextDecoder().decode(await pump(bytes, new DecompressionStream('gzip')));
  } catch (e) {
    throw new PerformanceFileError(`not a readable performance file: ${e && e.message ? e.message : e}`);
  }
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    throw new PerformanceFileError(`not valid JSON inside: ${e.message}`);
  }
  return checkPerformance(obj);
}
