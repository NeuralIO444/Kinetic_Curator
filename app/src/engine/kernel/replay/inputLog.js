// kernel/replay/inputLog.js — #1353 step 2: record the live resolver's input sequence, exactly.
//
// A performance is the sequence of `input` objects liveLoop hands to resolveLayers (the resolver is a pure function
// of that sequence). This module records it as per-frame CHANGES and plays it back as the same sequence of objects.
//
// EXACT, not approximate: every number round-trips bit for bit (JSON's shortest-round-trip doubles, with NaN,
// ±Infinity and -0 escaped), `undefined` is distinguished from `null` and from "absent", and typed arrays keep their
// type. Nothing is quantized: quantizing would change what replays.
//
// IDENTITY IS PART OF THE INPUT. The store is immutable, so "this object is the same object as last frame" is a
// real signal the resolver can see (identity-keyed caches). The log therefore records, per top-level key, whether
// the identity changed, even when the value did not, and playback reproduces that pattern: an unchanged key keeps
// its object, a changed key gets a new one.
//
// Frame = one resolver call. liveLoop taps EVERY call, including frames it later rejects, because the resolver's
// state advanced on them.

export const INPUT_LOG_VERSION = 1;

const TYPED = {
  Float32Array, Float64Array, Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array,
};

function isPlain(v) {
  if (v === null || typeof v !== 'object') return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

/** Encode any input value to JSON-safe data, exactly. */
export function encode(v) {
  if (v === undefined) return { $u: 1 };
  if (v === null) return null;
  const t = typeof v;
  if (t === 'number') {
    if (Number.isNaN(v)) return { $n: 'NaN' };
    if (v === Infinity) return { $n: 'Infinity' };
    if (v === -Infinity) return { $n: '-Infinity' };
    if (Object.is(v, -0)) return { $n: '-0' };
    return v;
  }
  if (t === 'string' || t === 'boolean') return v;
  if (t === 'function' || t === 'symbol' || t === 'bigint') {
    throw new TypeError(`[inputLog] a ${t} cannot be part of a recorded input`);
  }
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
    return { $t: v.constructor.name, v: Array.from(v, encode) };
  }
  if (Array.isArray(v)) return v.map(encode);
  if (isPlain(v)) {
    const out = {};
    for (const k of Object.keys(v)) {
      // a real key that starts with "$" would collide with the escapes: escape it
      out[k.startsWith('$') ? `$${k}` : k] = encode(v[k]);
    }
    return out;
  }
  throw new TypeError(`[inputLog] cannot record a ${Object.prototype.toString.call(v)} as an input`);
}

/** Decode what encode() produced. Always returns fresh objects. */
export function decode(e) {
  if (e === null || typeof e !== 'object') return e;
  if (Array.isArray(e)) return e.map(decode);
  if (e.$u === 1 && Object.keys(e).length === 1) return undefined;
  if (typeof e.$n === 'string' && Object.keys(e).length === 1) {
    return e.$n === 'NaN' ? NaN : e.$n === 'Infinity' ? Infinity : e.$n === '-Infinity' ? -Infinity : -0;
  }
  if (typeof e.$t === 'string' && Array.isArray(e.v)) {
    const C = TYPED[e.$t];
    if (!C) throw new TypeError(`[inputLog] unknown typed array "${e.$t}"`);
    return C.from(e.v.map(decode));
  }
  const out = {};
  for (const k of Object.keys(e)) out[k.startsWith('$$') ? k.slice(1) : k] = decode(e[k]);
  return out;
}

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * #1367 — fold the ENCODED state through steps[0..upto]: the full encoded input as of that frame.
 * Mirrors replayInputs' step application, but stays in encoded space (nothing is decoded), so a log
 * can be cut at a frame boundary: the folded state becomes a single full-state step, and every later
 * step applies to it exactly as it applied to the state the fold reproduces.
 */
function foldEnc(steps, upto) {
  let enc = {};
  for (let i = 0; i <= upto; i++) {
    const step = steps[i];
    const nextEnc = { ...enc };
    if (step.x) for (const key of step.x) delete nextEnc[key];
    if (step.k) {
      for (const key of Object.keys(step.k)) {
        const e = step.k[key];
        if (e !== null && typeof e === 'object' && !Array.isArray(e) && e.$s === 1 && Object.keys(e).length === 1) {
          nextEnc[key] = enc[key]; // same value, new identity: the encoding is unchanged
        } else if (e !== null && typeof e === 'object' && !Array.isArray(e) && e.$p && Array.isArray(e.$d) && Object.keys(e).length === 2) {
          const full = { ...enc[key], ...e.$p };
          for (const sub of e.$d) delete full[sub];
          nextEnc[key] = full;
        } else {
          nextEnc[key] = e;
        }
      }
    }
    enc = nextEnc;
  }
  return enc;
}

/** Steps for a log that starts at `fromFrame`: the folded full state as step 0, later steps verbatim. */
function rebaseSteps(steps, fromFrame) {
  const enc = foldEnc(steps, fromFrame);
  const k = {};
  for (const key of Object.keys(enc)) k[key] = enc[key];
  const first = Object.keys(k).length ? { k } : {};
  return [first, ...steps.slice(fromFrame + 1)];
}

/**
 * #1367 — a finished log cut at a frame boundary: frame `fromFrame` becomes frame 0 (as a full-state
 * step), and the frames after it follow unchanged. Replaying the result yields exactly the original
 * replay's inputs from `fromFrame` on. This is what lets a take begin mid-session: its input log starts
 * at the snapshot boundary instead of at launch.
 */
export function rebaseInputLog(log, fromFrame) {
  if (!log || log.version !== INPUT_LOG_VERSION || !Array.isArray(log.steps)) {
    throw new TypeError(`[inputLog] unsupported log (want version ${INPUT_LOG_VERSION})`);
  }
  if (!Number.isInteger(fromFrame) || fromFrame < 0 || fromFrame >= log.steps.length) {
    throw new RangeError(`[inputLog] cannot rebase at frame ${String(fromFrame)} of ${log.steps.length}`);
  }
  if (fromFrame === 0) return { version: INPUT_LOG_VERSION, frames: log.steps.length, steps: log.steps.slice() };
  const steps = rebaseSteps(log.steps, fromFrame);
  return { version: INPUT_LOG_VERSION, frames: steps.length, steps };
}

/**
 * Recorder. `record(input)` once per resolver call. `finish()` returns the log:
 *   { version, frames: N, keys: [...], steps: [ { k: { key: enc | {$s:1} | {$p:{...}, $d:[...]} }, x: [removedKeys] } ] }
 * A step lists only the keys whose identity or value changed since the previous frame:
 *   enc      — the new value (encoded)
 *   {$s:1}   — a NEW object with the SAME value (identity changed, content did not)
 *   {$p,$d}  — a plain object, shallow patch: set these keys ($p), delete those ($d)
 */
export function createInputLog() {
  const steps = [];
  let prevRaw = null; // the previous frame's actual objects (identity)
  let prevEnc = null; // their encodings (value)
  return {
    get frames() { return steps.length; },
    record(input) {
      if (!isPlain(input)) throw new TypeError('[inputLog] input must be a plain object');
      const k = {};
      const x = [];
      const enc = {};
      const keys = Object.keys(input);
      for (const key of keys) {
        const cur = input[key];
        const had = prevRaw !== null && Object.prototype.hasOwnProperty.call(prevRaw, key);
        if (had && Object.is(prevRaw[key], cur)) {
          enc[key] = prevEnc[key]; // same identity: for primitives that is the same value, for objects the same object
          continue;
        }
        const e = encode(cur);
        enc[key] = e;
        if (!had) { k[key] = e; continue; }
        const pe = prevEnc[key];
        if (sameValue(pe, e)) {
          // a primitive that is Object.is-different always differs in value, so this is an object: new identity only
          k[key] = { $s: 1 };
        } else if (isPlain(cur) && isPlain(prevRaw[key])) {
          const $p = {};
          const $d = [];
          for (const sub of Object.keys(e)) if (!(sub in pe) || !sameValue(pe[sub], e[sub])) $p[sub] = e[sub];
          for (const sub of Object.keys(pe)) if (!(sub in e)) $d.push(sub);
          k[key] = { $p, $d };
        } else {
          k[key] = e;
        }
      }
      if (prevRaw !== null) for (const key of Object.keys(prevRaw)) if (!Object.prototype.hasOwnProperty.call(input, key)) x.push(key);
      const step = {};
      if (Object.keys(k).length) step.k = k;
      if (x.length) step.x = x;
      steps.push(step);
      prevRaw = { ...input };
      prevEnc = enc;
    },
    /**
     * #1367 — drop the history before `fromFrame` IN PLACE (the ring's bound): the log restarts at that
     * frame as a full-state step and keeps recording. The recorder's prev-frame state describes the
     * LATEST frame, which a history rewrite does not touch, so the next record() diffs exactly as it
     * would have without the drop.
     */
    dropBefore(fromFrame) {
      if (!Number.isInteger(fromFrame) || fromFrame <= 0) return;
      const at = Math.min(fromFrame, steps.length - 1);
      if (at <= 0) return;
      const rebased = rebaseSteps(steps, at);
      steps.length = 0;
      steps.push(...rebased);
    },
    finish() {
      return { version: INPUT_LOG_VERSION, frames: steps.length, steps };
    },
  };
}

/**
 * Play a log back as the sequence of input objects. Yields one input per frame. Unchanged keys keep the SAME object
 * across frames; changed keys get a new one, reproducing the identity pattern the live run had.
 */
export function* replayInputs(log) {
  if (!log || log.version !== INPUT_LOG_VERSION || !Array.isArray(log.steps)) {
    throw new TypeError(`[inputLog] unsupported log (want version ${INPUT_LOG_VERSION})`);
  }
  let cur = {}; // key -> decoded value (identity carried across frames)
  let enc = {}; // key -> encoded value (for patches and "same value, new object")
  for (const step of log.steps) {
    const next = { ...cur };
    const nextEnc = { ...enc };
    if (step.x) for (const key of step.x) { delete next[key]; delete nextEnc[key]; }
    if (step.k) {
      for (const key of Object.keys(step.k)) {
        const e = step.k[key];
        let full;
        if (e !== null && typeof e === 'object' && !Array.isArray(e) && e.$s === 1 && Object.keys(e).length === 1) {
          full = enc[key];
        } else if (e !== null && typeof e === 'object' && !Array.isArray(e) && e.$p && Array.isArray(e.$d) && Object.keys(e).length === 2) {
          full = { ...enc[key], ...e.$p };
          for (const sub of e.$d) delete full[sub];
        } else {
          full = e;
        }
        nextEnc[key] = full;
        next[key] = decode(full); // always a fresh object: the identity changed
      }
    }
    cur = next;
    enc = nextEnc;
    yield { ...cur };
  }
}
