// Delay-1 FEED ring. Node-only.
//   node src/engine/kernel/tracks/feedDelay.selfcheck.mjs
import assert from 'node:assert';
import { applyFeed, lumaToFlow } from './trackGraph.js';
import { createFeedDelay } from './feedDelay.js';

const w = 4;
const h = 4;
const ramp = new Float32Array(w * h);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp[y * w + x] = x / (w - 1);

const ring = createFeedDelay(w, h);
assert.strictEqual(ring.hasHistory(0), false);

const pts = [{ x: 0.5, y: 0.5 }];
const patch = { mode: 'feed', from: 0, to: 1, strength: 1 };

// Frame 0: no history → zero field → identity, even with FEED armed.
{
  const field = ring.field(0);
  const out = applyFeed(pts, field, patch);
  assert.strictEqual(out[0].x, 0.5);
  assert.strictEqual(out[0].y, 0.5);
}

// Push frame 0 luma; frame 1 samples it.
ring.push(0, ramp);
assert.strictEqual(ring.hasHistory(0), true);
{
  const field = ring.field(0);
  const live = lumaToFlow(ramp, w, h);
  const a = applyFeed(pts, field, patch);
  const b = applyFeed(pts, live, patch);
  assert.ok(Math.abs(a[0].x - b[0].x) < 1e-6);
  assert.ok(a[0].x > pts[0].x);
}

// Reset drops history back to identity.
ring.reset();
assert.strictEqual(ring.hasHistory(0), false);
{
  const out = applyFeed(pts, ring.field(0), patch);
  assert.strictEqual(out[0].x, 0.5);
}

console.log('kernel/tracks/feedDelay.selfcheck: OK');
