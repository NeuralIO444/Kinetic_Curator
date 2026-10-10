// node src/engine/kernel/tracks/feedColumns.selfcheck.mjs
// #1308 (kernel SoA 4/5): feed delay slots as double-buffered SoA column
// pairs — the SoA successor to #1244's object double-buffering.
//
// Pins the byte-identical law: feedColumns.golden.json was captured on the
// PRE-CHANGE base (lumaToFlow-allocating flow cache); this replays the exact
// same deterministic sequence (feedColumns.driver.mjs) against the new
// column-pair code and asserts every u/v column hash and applyTo output
// matches bit-identically. Then proves the delay path — INCLUDING recompute
// frames — allocates zero Float32Arrays (measured, not asserted by shape),
// and that the back-pair swap keeps previously returned fields intact.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createFeedDelay } from './feedDelay.js';
import { createFeedLive } from './feedLive.js';
import { applyFeed, normalizePatch, MAX_TRACKS } from './trackGraph.js';
import { lumaToFlow } from './trackGraph.js';
import { runFeedGolden, makeLuma } from './feedColumns.driver.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const hashF32 = (a) => sha(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
const here = dirname(fileURLToPath(import.meta.url));

// --- 1. golden replay: same sequence, new columns, identical bytes ---------
const golden = JSON.parse(readFileSync(join(here, 'feedColumns.golden.json'), 'utf8'));
assert.ok(
  golden.gitRev && golden.gitRev !== 'unknown',
  'golden fixture records the base rev it was captured at',
);
const records = runFeedGolden({
  createFeedDelay,
  createFeedLive,
  applyFeed,
  normalizePatch,
  MAX_TRACKS,
  columnHashes: (field) => ({
    u: hashF32(field.u),
    v: hashF32(field.v),
    w: field.w,
    h: field.h,
    op: field.op,
  }),
});
assert.strictEqual(records.length, golden.records.length, 'same number of golden records');
for (let k = 0; k < records.length; k++) {
  assert.deepStrictEqual(
    records[k],
    golden.records[k],
    `golden record ${golden.records[k].label}: column pairs bit-identical to pre-change base`,
  );
}
console.log('feedColumns.selfcheck: golden replay OK', {
  records: records.length,
  baseRev: golden.gitRev,
});

// --- 2. zero Float32Array allocation on the delay path, recompute included --
{
  const live = createFeedLive(160, 112);
  const dst = [{ x: 0.25, y: 0.5 }];
  const patch = { mode: 'feed', from: 0, to: 1, strength: 0.9 };
  const pts = Array.from({ length: 12 }, (_, i) => ({ x: 0.1 + i * 0.05, y: 0.5 }));
  const luma = makeLuma(live.w, live.h, 999);
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
    for (let f = 0; f < 40; f++) {
      // every frame does a fresh pushSource (rasterize into stage) AND a
      // delay.push (copy into front slot) so BOTH dirty paths recompute —
      // the old code allocated one Float32Array(w*h*2) per recompute here.
      live.pushSource(0, pts);
      live.pushSource(3, pts);
      live.delay.push(1, luma);
      live.commit();
      live.delay.field(0);
      live.delay.field(1);
      live.delay.field(3);
      live.applyTo(dst, patch);
    }
    assert.strictEqual(allocs, 0, '40 frames of pushSource+push+commit+field+applyTo: zero Float32Array allocations');
  } finally {
    globalThis.Float32Array = RealF32;
  }
  console.log('feedColumns.selfcheck: zero-alloc delay path OK');
}

// --- 3. double-buffer invariants --------------------------------------------
{
  const delay = createFeedDelay(8, 8);
  const lumaA = makeLuma(8, 8, 1231);
  const lumaB = makeLuma(8, 8, 4242);
  delay.push(0, lumaA);
  const f1 = delay.field(0);
  const f1u = Array.from(f1.u);
  const f1v = Array.from(f1.v);
  // columns are byte-identical to a fresh lumaToFlow() encode (deinterleaved)
  const fresh = lumaToFlow(lumaA, 8, 8);
  const eu = new Float32Array(64);
  const ev = new Float32Array(64);
  for (let i = 0; i < 64; i++) {
    eu[i] = fresh.flow[i * 2];
    ev[i] = fresh.flow[i * 2 + 1];
  }
  assert.deepStrictEqual(Array.from(f1.u), Array.from(eu), 'u column byte-identical to lumaToFlow');
  assert.deepStrictEqual(Array.from(f1.v), Array.from(ev), 'v column byte-identical to lumaToFlow');
  assert.strictEqual(f1.op, 'curl', 'default op unchanged');
  // same wrapper between pushes
  assert.strictEqual(delay.field(0), f1, 'no recompute between pushes — same reference');
  // recompute writes the BACK pair: new wrapper, old one untouched
  delay.push(0, lumaB);
  const f2 = delay.field(0);
  assert.notStrictEqual(f2, f1, 'recompute returns a new field object');
  assert.deepStrictEqual(Array.from(f1.u), f1u, 'previously returned field keeps its u values');
  assert.deepStrictEqual(Array.from(f1.v), f1v, 'previously returned field keeps its v values');
  assert.notDeepStrictEqual(Array.from(f2.u), f1u, 'new luma actually changes the columns');
  // the two pairs cycle: a third recompute reuses the first pair's buffers
  delay.push(0, lumaA);
  const f3 = delay.field(0);
  assert.deepStrictEqual(Array.from(f3.u), f1u, 'pair reuse reproduces the first encode exactly');
  assert.deepStrictEqual(Array.from(f3.v), f1v, 'pair reuse reproduces the first encode exactly');
  console.log('feedColumns.selfcheck: double-buffer invariants OK');
}

console.log('ok — feed delay SoA column pairs (#1308)');
