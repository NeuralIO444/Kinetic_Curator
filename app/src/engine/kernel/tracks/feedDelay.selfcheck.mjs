// node src/engine/kernel/tracks/feedDelay.selfcheck.mjs
// #1231: FEED optical-flow cache. Pins lumaToFlow() output (kernel idea #18),
// then proves delay.field() returns value-identical results while doing zero
// Float32Array allocation on steady-state frames. Same seed → same output.
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

const W = 8;
const H = 8;
const delay = createFeedDelay(W, H);
const lumaA = makeLuma(W, H, 1231);
const lumaB = makeLuma(W, H, 4242);

// --- 1. cached flow is byte-identical to a fresh lumaToFlow() call ----------
delay.push(0, lumaA);
const fresh = lumaToFlow(lumaA, W, H);
const f1 = delay.field(0);
const f2 = delay.field(0);
assert.deepStrictEqual(f1, fresh, 'cached field byte-identical to fresh lumaToFlow()');
assert.deepStrictEqual(f2, fresh, 'second read still byte-identical');
assert.strictEqual(f1, f2, 'no recompute between pushes — same reference');
assert.strictEqual(f1.op, 'curl', 'default op unchanged');
assert.strictEqual(f1.w, W, 'width rides along');
assert.strictEqual(f1.h, H, 'height rides along');

// --- 2. no Float32Array allocation on steady-state field() calls ------------
const RealF32 = globalThis.Float32Array;
let allocs = 0;
class CountingF32 extends RealF32 {
  constructor(...args) {
    allocs++;
    super(...args);
  }
}
globalThis.Float32Array = CountingF32;
try {
  for (let i = 0; i < 10; i++) delay.field(0);
  assert.strictEqual(allocs, 0, 'ten field() calls, zero Float32Array allocations');
  const notReady = delay.field(1);
  assert.strictEqual(allocs, 0, 'not-ready slot allocates nothing (shared zero field)');
  assert.deepStrictEqual(
    Array.from(notReady.flow),
    Array.from(lumaToFlow(new RealF32(W * H), W, H).flow),
    'not-ready field still the zero field',
  );
} finally {
  globalThis.Float32Array = RealF32;
}

// --- 3. push() marks the slot dirty; next field() recomputes once ----------
delay.push(0, lumaB);
const afterPush = delay.field(0);
assert.deepStrictEqual(
  afterPush,
  lumaToFlow(lumaB, W, H),
  'after push, field() reflects the new luma, byte-identical',
);
assert.notStrictEqual(afterPush, f1, 'recompute produces a new object, old one untouched');
assert.deepStrictEqual(
  Array.from(f1.flow),
  Array.from(fresh.flow),
  'previously returned field keeps its old values',
);
assert.notDeepStrictEqual(
  Array.from(afterPush.flow),
  Array.from(f1.flow),
  'new luma actually changes the flow',
);

// --- 4. reset() drops cache and history --------------------------------------
delay.reset();
const afterReset = delay.field(0);
assert.deepStrictEqual(
  Array.from(afterReset.flow),
  Array.from(lumaToFlow(new Float32Array(W * H), W, H).flow),
  'after reset, slot 0 is the zero field again',
);
assert.strictEqual(delay.hasHistory(0), false, 'reset clears history');

// --- 5. out-of-range track ids never throw, never dirty anything -------------
delay.field(-1);
delay.field(99);
delay.push(-1, lumaA);
delay.push(99, lumaA);
assert.strictEqual(delay.hasHistory(0), false, 'invalid pushes leave slot 0 alone');

console.log('ok — feedDelay flow cache (#1231)');
