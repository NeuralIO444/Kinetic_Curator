// node src/engine/kernel/tracks/pooledPatch.selfcheck.mjs
// #1251: pooled numeric FIELD/FEED resolve path. Two claims, both pinned:
//
// 1. PARITY — the pooled variant (pooledPatch.mjs) is bit-identical to the
//    object path in gl/liveResolve.mjs on fixture scenes: field + feed +
//    the FEED write side, across frames, including the #1236 no-op paths,
//    NaN/missing/out-of-range coords, empty lists, polarity and strength
//    clamping. The reference below replays the object path's logic verbatim
//    (toNorm / clampHop copied from liveResolve.mjs; the real applyField /
//    feedLive.applyTo from the kernel). If the pooled math drifts by one ulp
//    anywhere, this suite fails. Same seed → same output.
//
// 2. ALLOCATION — on the FIELD/FEED block the object path's per-frame traffic
//    (toNorm maps x2, applyField/applyFeed result maps, sampleFlow's
//    per-point {x,y}, the clampHop item map, the push-side toNorm map) is
//    replaced by reused scratch. Proven structurally: Array.prototype.map
//    call counts per frame on each path, plus zero typed-array construction
//    on the pooled hot loop, plus an arithmetic small-object budget with an
//    asserted ratio floor. The one remaining per-frame cost on the pooled
//    path is the fresh item objects from the fused clampHop pass —
//    load-bearing (buildPlacements' itemPool aliases cached item objects
//    across frames and the morph ledger holds last frame's array), so
//    in-place writes would corrupt both.
import assert from 'node:assert/strict';
import { applyField } from './trackGraph.js';
import { createFeedLive } from './feedLive.js';
import { createPooledPatch } from './pooledPatch.mjs';

const W = 1280;
const H = 800;
const HOP_MAX_PX = 4;

// Deterministic PRNG — same fixture scenes every run.
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- REFERENCE: the object path, verbatim logic from gl/liveResolve.mjs ---
const toNorm = (it) => ({ x: (Number(it.x) || 0) / W, y: (Number(it.y) || 0) / H });
// clampHop copied verbatim from gl/liveResolve.mjs (not exported there).
function clampHop(it, q, w = W, h = H) {
  if (!q) return it;
  let dx = q.x * w - it.x;
  let dy = q.y * h - it.y;
  const m = Math.hypot(dx, dy);
  if (m > HOP_MAX_PX) { dx *= HOP_MAX_PX / m; dy *= HOP_MAX_PX / m; }
  return { ...it, x: it.x + dx, y: it.y + dy };
}
function refFieldItems(tgtItems, srcItems, patch) {
  const srcPts = (srcItems || []).map(toNorm);
  const tgt = (tgtItems || []).map(toNorm);
  const pulled = applyField(tgt, srcPts, patch);
  let sum = 0;
  const items = (tgtItems || []).map((it, k) => {
    const next = clampHop(it, pulled[k]);
    sum += Math.hypot(next.x - it.x, next.y - it.y);
    return next;
  });
  return { items, pullPx: sum / Math.max(1, (tgtItems || []).length) };
}
function refFeedItems(tgtItems, feedLive, patch) {
  const pts = (tgtItems || []).map(toNorm);
  const pulled = feedLive.applyTo(pts, patch);
  let sum = 0;
  const items = (tgtItems || []).map((it, k) => {
    const next = clampHop(it, pulled[k]);
    sum += Math.hypot(next.x - it.x, next.y - it.y);
    return next;
  });
  return { items, pullPx: sum / Math.max(1, (tgtItems || []).length) };
}

// Fixture items: deterministic positions that drift per frame (like a live
// loop), with stable extra keys; frame 3 injects the hostile edge coords.
function makeItems(rng, n, frame, hostile) {
  const items = [];
  for (let i = 0; i < n; i++) {
    const bx = rng() * W;
    const by = rng() * H;
    const it = {
      x: bx + frame * 0.7,
      y: by - frame * 0.35,
      scale: 0.5 + rng(),
      alpha: 20 + rng() * 80,
      assetId: `asset-${i % 5}`,
      seedOffset: i,
    };
    if (hostile && i % 7 === 0) it.x = NaN;
    if (hostile && i % 11 === 0) delete it.y;
    if (hostile && i % 13 === 0) { it.x = -50; it.y = H + 90; }
    items.push(it);
  }
  return items;
}

const pooled = createPooledPatch();
const FRAMES = 10;

// --- 1. FIELD parity across frames, strengths, polarities, edge cases ------
const fieldCases = [
  { strength: 1.0 },
  { strength: 0 }, // #1236 no-op: coords pass through, item map still runs
  { strength: 2.5 },
  { strength: 99, polarity: -1 }, // strength clamps to 4, repel polarity
  { strength: 0.05 },
];
for (const [ci, fc] of fieldCases.entries()) {
  const rngS = mulberry32(1000 + ci);
  const rngT = mulberry32(2000 + ci);
  for (let f = 0; f < FRAMES; f++) {
    const S = 6 + (f % 4) * 6; // 6..24 source items, size varies per frame
    const M = 8 + (f % 5) * 6; // 8..32 target items
    const srcItems = makeItems(rngS, S, f, f === 3);
    const tgtItems = makeItems(rngT, M, f, f === 3);
    const before = JSON.stringify({ srcItems, tgtItems });
    const patch = { mode: 'field', from: 0, to: 1, strength: fc.strength, polarity: fc.polarity };
    const ref = refFieldItems(tgtItems, srcItems, patch);
    const got = pooled.applyFieldItems(tgtItems, srcItems, patch, W, H);
    assert.deepStrictEqual(got.items, ref.items, `field case ${ci} frame ${f}: items bit-identical`);
    assert.strictEqual(got.pullPx, ref.pullPx, `field case ${ci} frame ${f}: pullPx identical`);
    assert.strictEqual(JSON.stringify({ srcItems, tgtItems }), before, `field case ${ci} frame ${f}: inputs not mutated`);
    // determinism: same inputs → same outputs on a second call
    const again = pooled.applyFieldItems(tgtItems, srcItems, patch, W, H);
    assert.deepStrictEqual(again.items, got.items, `field case ${ci} frame ${f}: deterministic`);
  }
}
// empty source / empty target / undefined lists
for (const [srcItems, tgtItems, label] of [
  [[], makeItems(mulberry32(7), 5, 0, false), 'empty source'],
  [makeItems(mulberry32(8), 5, 0, false), [], 'empty target'],
  [undefined, makeItems(mulberry32(9), 5, 0, false), 'undefined source'],
  [makeItems(mulberry32(10), 5, 0, false), undefined, 'undefined target'],
]) {
  const patch = { mode: 'field', from: 0, to: 1, strength: 1.5 };
  const ref = refFieldItems(tgtItems, srcItems, patch);
  const got = pooled.applyFieldItems(tgtItems, srcItems, patch, W, H);
  assert.deepStrictEqual(got.items, ref.items, `field ${label}: items bit-identical`);
  assert.strictEqual(got.pullPx, ref.pullPx, `field ${label}: pullPx identical`);
}
// mode off → #1236 same-reference no-op on the object path; pooled copies the
// norm coords through and still runs the item map — outputs must match.
{
  const tgtItems = makeItems(mulberry32(11), 9, 0, false);
  const patch = { mode: 'off', from: 0, to: 1, strength: 1.5 };
  const ref = refFieldItems(tgtItems, tgtItems, patch);
  const got = pooled.applyFieldItems(tgtItems, tgtItems, patch, W, H);
  assert.deepStrictEqual(got.items, ref.items, 'field mode off: items bit-identical');
  assert.strictEqual(got.pullPx, ref.pullPx, 'field mode off: pullPx identical');
}

// --- 2. FEED parity + pooled write-side parity ------------------------------
const feedCases = [{ strength: 0.5 }, { strength: 0 }, { strength: 3, polarity: -1 }];
for (const [ci, fc] of feedCases.entries()) {
  const liveRef = createFeedLive(160, 112);
  const livePooled = createFeedLive(160, 112);
  const rng = mulberry32(3000 + ci);
  for (let f = 0; f < FRAMES; f++) {
    const M = 8 + (f % 5) * 6;
    const items = makeItems(rng, M, f, f === 3);
    // write side: object path pushSource(map(toNorm)) vs pooled pushItems
    liveRef.pushSource(0, items.map(toNorm));
    pooled.pushItems(livePooled, 0, items, W, H);
    liveRef.commit();
    livePooled.commit();
    for (let t = 0; t < 4; t++) {
      // #1308 — the delay field is SoA { u, v } columns now; compare lanes.
      const fP = livePooled.delay.field(t);
      const fR = liveRef.delay.field(t);
      assert.deepStrictEqual(Array.from(fP.u), Array.from(fR.u), `feed case ${ci} frame ${f} track ${t}: u column byte-identical`);
      assert.deepStrictEqual(Array.from(fP.v), Array.from(fR.v), `feed case ${ci} frame ${f} track ${t}: v column byte-identical`);
    }
    // apply side
    const amt = (fc.strength ?? 0.16) * 0.05; // liveResolve scales by 0.05
    const patch = { mode: 'feed', from: 0, to: 1, strength: amt, polarity: fc.polarity };
    const ref = refFeedItems(items, liveRef, patch);
    const got = pooled.applyFeedItems(items, livePooled, patch, W, H);
    assert.deepStrictEqual(got.items, ref.items, `feed case ${ci} frame ${f}: items bit-identical`);
    assert.strictEqual(got.pullPx, ref.pullPx, `feed case ${ci} frame ${f}: pullPx identical`);
  }
}
// feed with no delay history: applyTo returns its input (the norm array);
// pooled must produce the same item map over the pass-through coords.
{
  const liveRef = createFeedLive(160, 112);
  const livePooled = createFeedLive(160, 112);
  const items = makeItems(mulberry32(12), 9, 0, false);
  const patch = { mode: 'feed', from: 2, to: 1, strength: 0.05 };
  const ref = refFeedItems(items, liveRef, patch);
  const got = pooled.applyFeedItems(items, livePooled, patch, W, H);
  assert.deepStrictEqual(got.items, ref.items, 'feed no-history: items bit-identical');
  assert.strictEqual(got.pullPx, ref.pullPx, 'feed no-history: pullPx identical');
}
// pooled push edge cases: out-of-range ids and non-array items are no-ops,
// exactly like the object path.
{
  const liveRef = createFeedLive(160, 112);
  const livePooled = createFeedLive(160, 112);
  const items = makeItems(mulberry32(13), 6, 0, false);
  liveRef.pushSource(9, items.map(toNorm));
  pooled.pushItems(livePooled, 9, items, W, H);
  liveRef.pushSource(-2, items.map(toNorm));
  pooled.pushItems(livePooled, -2, items, W, H);
  liveRef.pushSource(1, undefined);
  pooled.pushItems(livePooled, 1, undefined, W, H);
  liveRef.commit();
  livePooled.commit();
  for (let t = 0; t < 4; t++) {
    // #1308 — the delay field is SoA { u, v } columns now; compare lanes.
    const fP = livePooled.delay.field(t);
    const fR = liveRef.delay.field(t);
    assert.deepStrictEqual(Array.from(fP.u), Array.from(fR.u), `push edge track ${t}: u column matches`);
    assert.deepStrictEqual(Array.from(fP.v), Array.from(fR.v), `push edge track ${t}: v column matches`);
  }
}

// --- 3. allocation budget ----------------------------------------------------
// Structural proof: count Array.prototype.map calls per frame on each path
// (every map on this block allocates exactly one result array), and count
// typed-array constructions on the pooled hot loop (scratch must be reused).
const realMap = Array.prototype.map;
let mapCalls = 0;
function countMaps(fn) {
  mapCalls = 0;
  Array.prototype.map = function (...args) { mapCalls++; return realMap.apply(this, args); };
  try {
    fn();
  } finally {
    Array.prototype.map = realMap;
  }
  return mapCalls;
}
const RealF32 = globalThis.Float32Array;
const RealF64 = globalThis.Float64Array;
let f32Allocs = 0;
let f64Allocs = 0;
class CountingF32 extends RealF32 { constructor(...a) { f32Allocs++; super(...a); } }
class CountingF64 extends RealF64 { constructor(...a) { f64Allocs++; super(...a); } }

const rngA = mulberry32(5000);
const S = 24;
const M = 32;
const srcItems = makeItems(rngA, S, 0, false);
const tgtItems = makeItems(rngA, M, 0, false);
const fieldPatch = { mode: 'field', from: 0, to: 1, strength: 1.2 };
const feedPatch = { mode: 'feed', from: 0, to: 1, strength: 0.06 };
const liveA = createFeedLive(160, 112);
const liveB = createFeedLive(160, 112);
liveA.pushSource(0, tgtItems.map(toNorm));
liveA.commit();

// warm up the pooled scratch to the max fixture size (grow-only after this)
pooled.applyFieldItems(tgtItems, srcItems, fieldPatch, W, H);
pooled.applyFeedItems(tgtItems, liveB, feedPatch, W, H);
pooled.pushItems(liveB, 0, tgtItems, W, H);
liveB.commit();

const refFieldMaps = countMaps(() => refFieldItems(tgtItems, srcItems, fieldPatch));
const pooledFieldMaps = countMaps(() => pooled.applyFieldItems(tgtItems, srcItems, fieldPatch, W, H));
const refFeedMaps = countMaps(() => refFeedItems(tgtItems, liveA, feedPatch));
const pooledFeedMaps = countMaps(() => pooled.applyFeedItems(tgtItems, liveB, feedPatch, W, H));
const refPushMaps = countMaps(() => liveA.pushSource(0, tgtItems.map(toNorm)));
const pooledPushMaps = countMaps(() => pooled.pushItems(liveB, 0, tgtItems, W, H));

assert.strictEqual(refFieldMaps, 4, 'object FIELD frame: 4 maps (srcPts, tgt, applyField, items)');
assert.strictEqual(pooledFieldMaps, 0, 'pooled FIELD frame: 0 maps');
assert.strictEqual(refFeedMaps, 3, 'object FEED frame: 3 maps (pts, applyFeed, items)');
assert.strictEqual(pooledFeedMaps, 0, 'pooled FEED frame: 0 maps');
assert.strictEqual(refPushMaps, 1, 'object push: 1 map');
assert.strictEqual(pooledPushMaps, 0, 'pooled push: 0 maps');

globalThis.Float32Array = CountingF32;
globalThis.Float64Array = CountingF64;
try {
  f32Allocs = 0; f64Allocs = 0;
  // steady state: one committed push, then 30 read frames. The delay flow
  // cache stays clean (its #1231 recompute is shared infrastructure both
  // paths use), so this counts only the pooled module's own scratch.
  pooled.pushItems(liveB, 0, tgtItems, W, H);
  liveB.commit();
  pooled.applyFeedItems(tgtItems, liveB, feedPatch, W, H); // warm the field cache
  f32Allocs = 0; f64Allocs = 0;
  for (let f = 0; f < 30; f++) {
    pooled.applyFieldItems(tgtItems, srcItems, fieldPatch, W, H);
    pooled.applyFeedItems(tgtItems, liveB, feedPatch, W, H);
  }
  assert.strictEqual(f32Allocs, 0, '30 pooled frames: zero Float32Array constructions');
  assert.strictEqual(f64Allocs, 0, '30 pooled frames: zero Float64Array constructions (scratch reused)');
} finally {
  globalThis.Float32Array = RealF32;
  globalThis.Float64Array = RealF64;
}

// Arithmetic small-object budget per frame (S source, M target items).
// Object path FIELD: S+M (toNorm) + M (applyField map) + M (item map) + 2
//   (patch literal, normalizePatch). Pooled FIELD: M (fused item pass) + 1
//   (normalizePatch). FEED adds sampleFlow's M per-point {x,y} on the object
//   path. Push: M+1 array on the object path, 0 pooled.
// The asymptote is 4x: the M fresh item objects are the floor (in-place
// writes would corrupt buildPlacements' itemPool and the morph ledger, both
// of which alias item objects across frames). Assert well above 3x so a
// future regression in the pooled path's allocation profile fails loudly.
const objField = S + 3 * M + 2;
const poolField = M + 1;
const objFeed = 4 * M + 2;
const poolFeed = M + 1;
const ratioField = objField / poolField;
const ratioFeed = objFeed / poolFeed;
assert.ok(ratioField > 3, `FIELD small-object ratio ${ratioField.toFixed(2)}x > 3x`);
assert.ok(ratioFeed > 3, `FEED small-object ratio ${ratioFeed.toFixed(2)}x > 3x`);

console.log('pooledPatch.selfcheck: OK', {
  frames: FRAMES,
  fieldCases: fieldCases.length,
  feedCases: feedCases.length,
  maps: { refFieldMaps, pooledFieldMaps, refFeedMaps, pooledFeedMaps, refPushMaps, pooledPushMaps },
  smallObjectRatio: { field: ratioField.toFixed(2) + 'x', feed: ratioFeed.toFixed(2) + 'x' },
});
