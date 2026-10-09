// node src/engine/kernel/tracks/feedDelay.delay1.selfcheck.mjs
// #1248: delay-1 timing + delay-slot push/field/commit semantics — the pins
// #1231 deliberately did not write (it pinned the flow cache only).
// Covers: multi-track slot independence, push-not-visible-until-commit at the
// feedLive level (rasterize → push → commit does not bleed the frame just
// pushed), last-write-wins staging, and double-commit safety. No RNG.
import assert from 'node:assert';
import { createFeedDelay } from './feedDelay.js';
import { createFeedLive } from './feedLive.js';
import { lumaToFlow, applyFeed } from './trackGraph.js';

function makeLuma(w, h, seed) {
  const out = new Float32Array(w * h);
  let s = seed >>> 0;
  for (let i = 0; i < out.length; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    out[i] = ((s >>> 16) & 0xff) / 255;
  }
  return out;
}

// --- 1. slot-level: tracks are independent delay slots -----------------------
const W = 8;
const H = 8;
const slots = createFeedDelay(W, H);
const lumaA = makeLuma(W, H, 1248);
const lumaB = makeLuma(W, H, 777);
const lumaC = makeLuma(W, H, 31337);
slots.push(0, lumaA);
slots.push(1, lumaB);
const f0 = slots.field(0);
const f1 = slots.field(1);
assert.deepStrictEqual(Array.from(f0.flow), Array.from(lumaToFlow(lumaA, W, H).flow), 'slot 0 holds A');
assert.deepStrictEqual(Array.from(f1.flow), Array.from(lumaToFlow(lumaB, W, H).flow), 'slot 1 holds B');
// Pushing to slot 1 must not invalidate slot 0's cached field object.
slots.push(1, lumaC);
assert.strictEqual(slots.field(0), f0, 'push to slot 1 leaves slot 0 cache untouched');
assert.deepStrictEqual(
  Array.from(slots.field(1).flow),
  Array.from(lumaToFlow(lumaC, W, H).flow),
  'slot 1 recomputes to C',
);
assert.strictEqual(slots.hasHistory(0), true, 'pushed slot has history');
assert.strictEqual(slots.hasHistory(2), false, 'never-pushed slot has no history');

// --- 2. feedLive delay-1: rasterize → push → commit, no bleed ----------------
const live = createFeedLive(32, 32); // w=8, h=8 after FEED_SCALE
assert.strictEqual(live.w, 8, 'raster width');
assert.strictEqual(live.h, 8, 'raster height');
const dst = [{ x: 0.5, y: 0.5 }];
const feed = { mode: 'feed', from: 0, to: 1, strength: 1 };
const pointsA = [{ x: 0.45, y: 0.45 }]; // rasterizes to cell (3,3) → luma index 27
const pointsB = [{ x: 0.6, y: 0.4 }]; // rasterizes to cell (4,3) → luma index 28
const rasterA = new Float32Array(64);
rasterA[27] = 1;
const rasterB = new Float32Array(64);
rasterB[28] = 1;
const expectWith = (raster) => applyFeed(dst, lumaToFlow(raster, 8, 8), feed);

// Frame 1: push stages A, but nothing committed → identity (no bleed of A yet).
live.pushSource(0, pointsA);
const out1 = live.applyTo(dst, feed);
assert.strictEqual(out1[0].x, 0.5, 'frame 1: staged A is not visible before commit');
assert.strictEqual(out1[0].y, 0.5, 'frame 1: staged A is not visible before commit');

// Commit: A becomes the visible field, byte-identical to a fresh flow hop.
live.commit();
const out2 = live.applyTo(dst, feed);
assert.deepStrictEqual(out2, expectWith(rasterA), 'committed A drives the hop, byte-identical');

// Frame 2: staging B must not bleed into the still-visible A field.
live.pushSource(0, pointsB);
const out2b = live.applyTo(dst, feed);
assert.deepStrictEqual(out2b, out2, 'just-pushed B does not bleed into the visible field');

// Commit: B replaces A as the visible field.
live.commit();
const out3 = live.applyTo(dst, feed);
assert.deepStrictEqual(out3, expectWith(rasterB), 'committed B drives the hop, byte-identical');
assert.notDeepStrictEqual(out3, out2, 'the hop actually moved from A to B');

// Double commit is safe: pending is empty, visible field unchanged.
live.commit();
const out4 = live.applyTo(dst, feed);
assert.deepStrictEqual(out4, out3, 'commit with empty pending changes nothing');

// --- 3. last-write-wins: two pushSources before one commit -------------------
live.reset();
live.pushSource(0, pointsA);
live.pushSource(0, pointsB);
live.commit();
assert.deepStrictEqual(
  Array.from(live.delay.field(0).flow),
  Array.from(lumaToFlow(rasterB, 8, 8).flow),
  'staged B overwrites staged A — the last push wins',
);

// --- 4. reset restores delay-1 start state ------------------------------------
live.reset();
live.pushSource(0, pointsA);
const outR = live.applyTo(dst, feed);
assert.strictEqual(outR[0].x, 0.5, 'after reset, staged A is again invisible before commit');
assert.strictEqual(live.delay.hasHistory(0), false, 'reset clears delay history');

// --- 5. determinism: the whole frame sequence replays identically -----------
function runSequence() {
  const l = createFeedLive(32, 32);
  const seq = [];
  l.pushSource(0, pointsA);
  seq.push(l.applyTo(dst, feed));
  l.commit();
  seq.push(l.applyTo(dst, feed));
  l.pushSource(0, pointsB);
  seq.push(l.applyTo(dst, feed));
  l.commit();
  seq.push(l.applyTo(dst, feed));
  return seq;
}
assert.deepStrictEqual(runSequence(), runSequence(), 'delay-1 frame sequence is deterministic');

console.log('ok — feedDelay delay-1 semantics (#1248)', {
  slotIndependence: true,
  noBleed: true,
  lastWriteWins: true,
});
