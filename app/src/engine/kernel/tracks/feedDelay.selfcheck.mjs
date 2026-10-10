// node src/engine/kernel/tracks/feedDelay.selfcheck.mjs
// #1231: FEED optical-flow cache. Pins lumaToFlow() output (kernel idea #18),
// then proves delay.field() returns value-identical results while doing zero
// Float32Array allocation on steady-state frames. Same seed → same output.
// #1308: the field is SoA now — { u, v } column pairs instead of the old
// interleaved { flow } array. Every pin below compares the columns against
// the deinterleaved lumaToFlow() encode: same bytes, same guarantees.
import assert from 'node:assert';
import { createFeedDelay } from './feedDelay.js';
import { lumaToFlow } from './trackGraph.js';

// Deterministic luma pattern — no RNG import, same bytes every run.
function makeLuma(w, h, seed) {
  const out = new Float32Array(w * h);
  let s = seed >>> 0;
  for (let i = 0; i < out.length; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    out[i] = ((s >>> 16) & 0xff) / 255;
  }
  return out;
}

// Deinterleave a legacy { flow } field into { u, v } column arrays so the
// SoA columns pin bit-identically against the lumaToFlow() reference.
function columnsOf(field) {
  const n = field.w * field.h;
  const u = new Array(n);
  const v = new Array(n);
  for (let i = 0; i < n; i++) {
    u[i] = field.flow[i * 2];
    v[i] = field.flow[i * 2 + 1];
  }
  return { u, v };
}

const W = 8;
const H = 8;
const delay = createFeedDelay(W, H);
const lumaA = makeLuma(W, H, 1231);
const lumaB = makeLuma(W, H, 4242);

// --- 1. cached flow columns are byte-identical to a fresh lumaToFlow() -----
delay.push(0, lumaA);
const fresh = columnsOf(lumaToFlow(lumaA, W, H));
const f1 = delay.field(0);
const f2 = delay.field(0);
assert.deepStrictEqual(Array.from(f1.u), fresh.u, 'cached u column byte-identical to fresh lumaToFlow()');
assert.deepStrictEqual(Array.from(f1.v), fresh.v, 'cached v column byte-identical to fresh lumaToFlow()');
assert.deepStrictEqual(Array.from(f2.u), fresh.u, 'second read still byte-identical');
assert.strictEqual(f1, f2, 'no recompute between pushes — same reference');
assert.strictEqual(f1.op, 'curl', 'default op unchanged');
assert.strictEqual(f1.w, W, 'width rides along');
assert.strictEqual(f1.h, H, 'height rides along');

// --- 2. no Float32Array allocation on the delay path, recompute included ---
// #1308: the old code allocated one Float32Array(w*h*2) per recompute. The
// column pairs kill that too — push + field (dirty) + field (clean) must
// allocate nothing. (Reference encodes are computed BEFORE the counting
// class is installed — the old lumaToFlow allocates, and must not be
// counted against the new path.)
const zeroRef = columnsOf(lumaToFlow(new Float32Array(W * H), W, H));
const freshB = columnsOf(lumaToFlow(lumaB, W, H));
const RealF32 = globalThis.Float32Array;
let allocs = 0;
class CountingF32 extends RealF32 {
  constructor(...args) {
    allocs++;
    super(...args);
  }
}
globalThis.Float32Array = CountingF32;
let recomputed;
try {
  for (let i = 0; i < 10; i++) delay.field(0);
  assert.strictEqual(allocs, 0, 'ten field() calls, zero Float32Array allocations');
  const notReady = delay.field(1);
  assert.strictEqual(allocs, 0, 'not-ready slot allocates nothing (shared zero field)');
  assert.deepStrictEqual(Array.from(notReady.u), zeroRef.u, 'not-ready u is the zero field');
  assert.deepStrictEqual(Array.from(notReady.v), zeroRef.v, 'not-ready v is the zero field (incl. -0 lanes)');
  delay.push(0, lumaB);
  recomputed = delay.field(0);
  assert.strictEqual(allocs, 0, 'push + dirty field() recompute: zero Float32Array allocations');
  assert.deepStrictEqual(Array.from(recomputed.u), freshB.u, 'recomputed u byte-identical');
  assert.deepStrictEqual(Array.from(recomputed.v), freshB.v, 'recomputed v byte-identical');
} finally {
  globalThis.Float32Array = RealF32;
}

// --- 3. push() marks the slot dirty; next field() recomputes once ----------
// (state continues from §2: slot 0 now holds lumaB)
const afterPush = delay.field(0);
assert.deepStrictEqual(Array.from(afterPush.u), freshB.u, 'after push, u reflects the new luma, byte-identical');
assert.deepStrictEqual(Array.from(afterPush.v), freshB.v, 'after push, v reflects the new luma, byte-identical');
assert.notStrictEqual(afterPush, f1, 'recompute produces a new object, old one untouched');
assert.deepStrictEqual(Array.from(f1.u), fresh.u, 'previously returned field keeps its old u values');
assert.deepStrictEqual(Array.from(f1.v), fresh.v, 'previously returned field keeps its old v values');
assert.notDeepStrictEqual(
  Array.from(afterPush.u),
  Array.from(f1.u),
  'new luma actually changes the flow',
);

// --- 4. reset() drops cache and history --------------------------------------
delay.reset();
const afterReset = delay.field(0);
assert.deepStrictEqual(Array.from(afterReset.u), zeroRef.u, 'after reset, slot 0 is the zero field again');
assert.deepStrictEqual(Array.from(afterReset.v), zeroRef.v, 'after reset, v zero field again');
assert.strictEqual(delay.hasHistory(0), false, 'reset clears history');

// --- 5. out-of-range track ids never throw, never dirty anything -------------
delay.field(-1);
delay.field(99);
delay.push(-1, lumaA);
delay.push(99, lumaA);
assert.strictEqual(delay.hasHistory(0), false, 'invalid pushes leave slot 0 alone');

console.log('ok — feedDelay flow cache (#1231), SoA column pairs (#1308)');
