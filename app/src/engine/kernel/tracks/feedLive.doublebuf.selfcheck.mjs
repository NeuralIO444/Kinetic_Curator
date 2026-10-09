// node src/engine/kernel/tracks/feedLive.doublebuf.selfcheck.mjs
// #1244: double-buffered FEED delay slots. Pins the byte-identical law: the
// swap path must produce exactly what the old allocate-then-copy path
// produced. Runs both paths side by side (the reference replays the OLD
// feedLive rasterize + feedDelay.push copy semantics) and asserts the
// resulting fields are byte-identical every frame, then proves the rasterize
// path allocates zero Float32Arrays. Same seed → same output.
import assert from 'node:assert/strict';
import { createFeedLive } from './feedLive.js';
import { createFeedDelay } from './feedDelay.js';
import { applyFeed, normalizePatch, MAX_TRACKS } from './trackGraph.js';

// Deterministic PRNG — same points every run.
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

// --- OLD PATH (pre-#1244 spec): fresh allocation + element-wise copy --------
function oldRasterize(w, h, points) {
  const luma = new Float32Array(w * h);
  const pts = Array.isArray(points) ? points : [];
  for (const p of pts) {
    const x = Math.max(0, Math.min(w - 1, Math.floor((Number(p.x) || 0) * w)));
    const y = Math.max(0, Math.min(h - 1, Math.floor((Number(p.y) || 0) * h)));
    luma[y * w + x] = 1;
  }
  return luma;
}

// Deterministic point sets; some frames include out-of-range coords (clamped).
function makePoints(rng, count) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    pts.push({ x: rng() * 1.4 - 0.2, y: rng() * 1.4 - 0.2 });
  }
  return pts;
}

const live = createFeedLive(160, 112); // w=40, h=28 after FEED_SCALE — small, fast
const ref = createFeedDelay(live.w, live.h);
const { w, h } = live;
const rng = mulberry32(1244);

function pushBoth(trackId, points) {
  live.pushSource(trackId, points);
  // reference: old pending semantics — rasterize fresh, push() copies
  const id = trackId | 0;
  ref.push(id, oldRasterize(w, h, points));
}

// --- 1. pre-commit: no history on either path --------------------------------
for (let t = 0; t < MAX_TRACKS; t++) {
  assert.deepStrictEqual(live.delay.field(t), ref.field(t), `track ${t}: pre-commit zero fields match`);
}

// --- 2. multi-frame parity, all tracks ---------------------------------------
const FRAMES = 12;
for (let f = 0; f < FRAMES; f++) {
  for (let t = 0; t < MAX_TRACKS; t++) {
    const n = 3 + Math.floor(rng() * 12);
    pushBoth(t, f === 5 && t === 1 ? [] : makePoints(rng, n)); // frame 5: empty source
  }
  if (f === 3) {
    // same track pushed twice in one frame — last write wins on both paths
    const pts = makePoints(rng, 7);
    live.pushSource(0, pts);
    ref.push(0, oldRasterize(w, h, pts));
  }
  if (f === 7) {
    // out-of-range track ids are a no-op on both paths
    live.pushSource(9, makePoints(rng, 4));
    ref.push(9, oldRasterize(w, h, makePoints(rng, 4)));
    live.pushSource(-2, makePoints(rng, 4));
    ref.push(-2, oldRasterize(w, h, makePoints(rng, 4)));
    live.pushSource(2, undefined); // non-array points → treated as []
    ref.push(2, oldRasterize(w, h, undefined));
  }
  live.commit();
  for (let t = 0; t < MAX_TRACKS; t++) {
    assert.deepStrictEqual(
      live.delay.field(t),
      ref.field(t),
      `frame ${f} track ${t}: double-buffer field byte-identical to allocate+copy`,
    );
  }
  // applyTo plumbing parity: same patch through both fields
  const patch = { mode: 'feed', from: 1, to: 2, strength: 0.7 };
  const viaLive = live.applyTo([{ x: 0.3, y: 0.4 }], patch);
  const viaRef = applyFeed([{ x: 0.3, y: 0.4 }], ref.field(1), normalizePatch(patch));
  assert.deepStrictEqual(viaLive, viaRef, `frame ${f}: applyTo output identical`);
}

// --- 3. reset parity ----------------------------------------------------------
live.reset();
ref.reset();
for (let t = 0; t < MAX_TRACKS; t++) {
  assert.deepStrictEqual(live.delay.field(t), ref.field(t), `track ${t}: post-reset zero fields match`);
  assert.equal(live.delay.hasHistory(t), ref.hasHistory(t), `track ${t}: post-reset history flags match`);
}

// --- 4. zero allocation on the rasterize path ---------------------------------
const rng2 = mulberry32(777);
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
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    live.pushSource(0, makePoints(rng2, 9));
    live.pushSource(2, makePoints(rng2, 5));
    seen.add(live.delay.stageBuffer(2));
    live.commit();
  }
  assert.strictEqual(allocs, 0, '30 frames of pushSource+commit: zero Float32Array allocations');
  assert.strictEqual(seen.size, 2, 'staging buffer cycles between exactly 2 reused buffers');
} finally {
  globalThis.Float32Array = RealF32;
}

// --- 5. staged-but-uncommitted writes are invisible, like the old pending ----
const pts3 = makePoints(mulberry32(42), 20);
live.pushSource(3, pts3);
assert.deepStrictEqual(
  live.delay.field(3),
  ref.field(3),
  'uncommitted stage does not leak into the delay slot',
);
ref.push(3, oldRasterize(w, h, pts3));
live.commit();
assert.deepStrictEqual(
  live.delay.field(3),
  ref.field(3),
  'after commit the staged frame matches the reference push',
);

console.log('feedLive.doublebuf.selfcheck: OK', { w, h, frames: FRAMES });
