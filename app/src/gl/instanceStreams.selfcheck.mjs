// node src/gl/instanceStreams.selfcheck.mjs
// #2183 WS4 — the split-stream instance upload moves bytes, never values.
//   A  the two float spans partition the 51-float instance exactly once
//   B  a mock GPU fed only the planned uploads always reassembles to the packed array, bit for bit
//      (-0, NaN payloads, shrinking/growing batches, a slot that sees a different batch, invalidate)
//   C  dirty ranges: nothing dirty uploads nothing; one dirty item uploads that item; nearby ranges merge;
//      above FULL_UPLOAD_SHARE the whole stream goes in one call; bytes never exceed the legacy upload
//   D  the two committed takes (replayGate, creatureRepipe) replayed through the real resolver and contract:
//      every frame reassembles to packInstanceData's output, and the upload shrinks as measured
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  INSTANCE_STRIDE_EXPECTED,
  DYN_FLOATS,
  STATIC_FLOATS,
  DYN_SPANS,
  STATIC_SPANS,
  FULL_UPLOAD_SHARE,
  createStreamSlot,
  invalidateSlot,
  planStreams,
  reassemble,
} from './instanceStreams.mjs';
import { INSTANCE_STRIDE, packInstanceData } from './renderer.mjs';
import { unpackPerformance } from './performanceFile.mjs';
import { createLiveResolver } from './liveResolve.mjs';
import { replayInputs } from '../engine/kernel/replay/inputLog.js';
import { buildSceneContract } from './sceneContract.js';

let n = 0;
const ok = (name, fn) => {
  const r = fn();
  if (r && typeof r.then === 'function') return r.then(() => done(name));
  done(name);
};
const done = (name) => {
  n++;
  console.log(`  [ok] ${name}`);
};

// A mock of the two GPU buffers a slot owns, fed only what planStreams says to upload.
function mockGpu() {
  return { dyn: new Float32Array(0), stat: new Float32Array(0), uploads: 0 };
}
function applyPlan(gpu, plan) {
  if (gpu.dyn.length < plan.dynamic.length) gpu.dyn = new Float32Array(plan.dynamic.length);
  gpu.dyn.set(plan.dynamic);
  if (gpu.stat.length < plan.statics.length) {
    const g = new Float32Array(plan.statics.length);
    g.set(gpu.stat);
    gpu.stat = g;
  }
  for (const [a, b] of plan.ranges) {
    gpu.stat.set(plan.statics.subarray(a * STATIC_FLOATS, b * STATIC_FLOATS), a * STATIC_FLOATS);
    gpu.uploads++;
  }
}
const sameBits = (a, b) => {
  if (a.length !== b.length) return false;
  const x = new Uint32Array(a.buffer, a.byteOffset, a.length);
  const y = new Uint32Array(b.buffer, b.byteOffset, b.length);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
};

function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function randomPacked(count, rnd) {
  const a = new Float32Array(count * INSTANCE_STRIDE_EXPECTED);
  for (let i = 0; i < a.length; i++) a[i] = (rnd() - 0.5) * 100;
  return a;
}

ok('A: spans partition the 51-float instance exactly once', () => {
  assert.equal(INSTANCE_STRIDE, INSTANCE_STRIDE_EXPECTED, 'renderer stride changed: re-derive the spans');
  const seen = new Array(INSTANCE_STRIDE_EXPECTED).fill(0);
  for (const [a, b] of [...DYN_SPANS, ...STATIC_SPANS]) for (let k = a; k < b; k++) seen[k]++;
  assert.ok(
    seen.every((c) => c === 1),
    'every float is in exactly one stream',
  );
  const count = (spans) => spans.reduce((s, [a, b]) => s + (b - a), 0);
  assert.equal(count(DYN_SPANS), DYN_FLOATS);
  assert.equal(count(STATIC_SPANS), STATIC_FLOATS);
  assert.equal(DYN_FLOATS + STATIC_FLOATS, INSTANCE_STRIDE_EXPECTED);
});

ok('B: a mock GPU fed only the planned uploads reassembles bit-exactly', () => {
  const rnd = lcg(7);
  const slot = createStreamSlot();
  const gpu = mockGpu();
  let packed = randomPacked(40, rnd);
  for (let frame = 0; frame < 200; frame++) {
    // mutate a few floats of a few items; sometimes change the batch size; sometimes plant -0 / NaN
    const items = packed.length / INSTANCE_STRIDE_EXPECTED;
    for (let m = 0; m < 3; m++)
      packed[Math.floor(rnd() * items) * INSTANCE_STRIDE_EXPECTED + Math.floor(rnd() * 51)] = rnd();
    if (frame % 13 === 5) packed[Math.floor(rnd() * items) * INSTANCE_STRIDE_EXPECTED + 30] = -0;
    if (frame % 17 === 3) packed[Math.floor(rnd() * items) * INSTANCE_STRIDE_EXPECTED + 40] = NaN;
    if (frame % 29 === 11) packed = randomPacked(10 + Math.floor(rnd() * 60), rnd); // a different batch in the same slot
    if (frame % 61 === 60) invalidateSlot(slot);
    const plan = planStreams(packed, slot);
    applyPlan(gpu, plan);
    const got = reassemble(gpu.dyn, gpu.stat, plan.n);
    assert.ok(sameBits(got, packed), `frame ${frame}: reassembled instances differ from the packed array`);
  }
});

ok('C: dirty ranges, merging, the full-upload threshold, and the never-worse bound', () => {
  const rnd = lcg(11);
  const slot = createStreamSlot();
  const packed = randomPacked(100, rnd);
  let plan = planStreams(packed, slot);
  assert.deepEqual(plan.ranges, [[0, 100]], 'first sight uploads everything');
  plan = planStreams(packed, slot);
  assert.deepEqual(plan.ranges, [], 'nothing changed → no static bytes');
  assert.equal(plan.staticBytes, 0);
  assert.equal(plan.dynBytes, 100 * DYN_FLOATS * 4);
  // a dynamic-only change (x,y of every item) never dirties the static stream
  for (let i = 0; i < 100; i++) packed[i * 51] += 1;
  plan = planStreams(packed, slot);
  assert.deepEqual(plan.ranges, [], 'moving every item is a dynamic change only');
  // one static change → exactly that item
  packed[42 * 51 + 30] += 1;
  plan = planStreams(packed, slot);
  assert.deepEqual(plan.ranges, [[42, 43]]);
  // two nearby items merge across a one-item gap; a far one stays separate
  packed[10 * 51 + 12] += 1;
  packed[12 * 51 + 12] += 1;
  packed[80 * 51 + 12] += 1;
  plan = planStreams(packed, slot);
  assert.deepEqual(plan.ranges, [
    [10, 13],
    [80, 81],
  ]);
  // above the threshold, one whole upload
  for (let i = 0; i < 100; i += 1) if (i % 2 === 0 || i < 60) packed[i * 51 + 25] += 1;
  plan = planStreams(packed, slot);
  assert.ok(FULL_UPLOAD_SHARE < 0.8);
  assert.deepEqual(plan.ranges, [[0, 100]]);
  // never worse than the legacy whole-array upload
  assert.ok(plan.dynBytes + plan.staticBytes <= 100 * INSTANCE_STRIDE_EXPECTED * 4);
  // an empty draw plans nothing
  plan = planStreams(new Float32Array(0), slot);
  assert.equal(plan.n, 0);
  assert.deepEqual(plan.ranges, []);
});

// ── D: the committed takes, through the real resolver and contract ──────────────────────────────────────────────
const here = path.dirname(fileURLToPath(import.meta.url));
const cell = { u0: 0, v0: 0, u1: 1, v1: 1, w: 8, h: 8 };
const cells = new Proxy({}, { get: () => cell, has: () => true });

async function replayTake(file) {
  const perf = await unpackPerformance(new Uint8Array(fs.readFileSync(path.join(here, 'fixtures', file))));
  const resolver = createLiveResolver();
  const slot = createStreamSlot();
  const gpu = mockGpu();
  let frames = 0;
  let legacyBytes = 0;
  let streamBytes = 0;
  for (const input of replayInputs(perf.inputs)) {
    const out = resolver.resolveLayers(input);
    const sc = buildSceneContract({
      doc: { seed: input.seed ?? 1, kinemeTime: (frames + 1) / 60, palette: input.palette },
      resolvedLayers: Object.values(out),
    });
    const packed = packInstanceData(sc.instances || [], cells, 1, null);
    const plan = planStreams(packed, slot);
    applyPlan(gpu, plan);
    assert.ok(sameBits(reassemble(gpu.dyn, gpu.stat, plan.n), packed), `${file} frame ${frames}: reassembly differs`);
    legacyBytes += packed.byteLength;
    streamBytes += plan.dynBytes + plan.staticBytes;
    frames++;
  }
  if (typeof resolver.dispose === 'function') resolver.dispose();
  return { frames, ratio: streamBytes / legacyBytes };
}

await ok('D1: replayGate take (60 s) — every frame reassembles; uploads shrink', async () => {
  const r = await replayTake('replayGate.kcperf');
  console.log(`      ${r.frames} frames, stream/legacy upload bytes = ${r.ratio.toFixed(3)}`);
  assert.ok(r.frames > 3000);
  assert.ok(r.ratio < 0.4, `upload ratio ${r.ratio} should be well under the legacy 1.0`);
});
await ok('D2: creatureRepipe take — every frame reassembles; uploads shrink', async () => {
  const r = await replayTake('creatureRepipe.kcperf');
  console.log(`      ${r.frames} frames, stream/legacy upload bytes = ${r.ratio.toFixed(3)}`);
  assert.ok(r.frames > 800);
  assert.ok(r.ratio < 0.4, `upload ratio ${r.ratio} should be well under the legacy 1.0`);
});

console.log(`instanceStreams.selfcheck: OK (${n} groups) — #2183 WS4`);
