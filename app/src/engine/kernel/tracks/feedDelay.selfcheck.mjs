// Delay-1 FEED ring. Contract: field() then push().
import assert from 'node:assert';
import { applyFeed, lumaToFlow } from './trackGraph.js';
import { createFeedDelay } from './feedDelay.js';

const w = 4;
const h = 4;
const ramp = new Float32Array(w * h);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp[y * w + x] = x / (w - 1);

const ring = createFeedDelay(w, h);
const pts = [{ x: 0.5, y: 0.5 }];
const patch = { mode: 'feed', from: 0, to: 1, strength: 1 };

assert.strictEqual(ring.hasHistory(0), false);
{
  const out = applyFeed(pts, ring.field(0), patch);
  assert.strictEqual(out[0].x, 0.5);
  assert.strictEqual(out[0].y, 0.5);
}

// field → apply → push  is delay-1.
{
  const before = applyFeed(pts, ring.field(0), patch);
  ring.push(0, ramp);
  const after = applyFeed(pts, ring.field(0), patch);
  assert.strictEqual(before[0].y, 0.5);
  assert.ok(after[0].y < before[0].y, 'after push, next field() is last luma');
  const live = applyFeed(pts, lumaToFlow(ramp, w, h), patch);
  assert.ok(Math.abs(after[0].y - live[0].y) < 1e-6);
}

ring.reset();
assert.strictEqual(ring.hasHistory(0), false);
assert.strictEqual(applyFeed(pts, ring.field(0), patch)[0].y, 0.5);

console.log('kernel/tracks/feedDelay.selfcheck: OK');
