import assert from 'node:assert';
import { createFeedHop, packFlowRgba, unpackFlowRgba, hopSize, lumaFromRgba } from './feedHop.js';
import { feedTextureBytes, sampleFlow } from './trackGraph.js';

{
  const s = hopSize(1920, 1080);
  assert.strictEqual(s.w, 480);
  assert.strictEqual(s.h, 270);
  assert.strictEqual(s.bytes, feedTextureBytes(1920, 1080));
  assert.strictEqual(s.bytes, s.w * s.h * 8);
}

{
  const hop = createFeedHop(16, 16);
  assert.strictEqual(hop.w, 4);
  assert.strictEqual(hop.h, 4);
  const luma = new Float32Array(16);
  for (let i = 8; i < 16; i++) luma[i] = 1;
  const f0 = hop.tick(0, luma);
  for (let i = 0; i < f0.flow.length; i++) assert.strictEqual(f0.flow[i], 0, 'frame 0 field is zeros');
  const packed0 = packFlowRgba(f0);
  assert.strictEqual(packed0.rgba.length, hop.w * hop.h * 4);
  const f1 = hop.tick(0, luma);
  let energy = 0;
  for (let i = 0; i < f1.flow.length; i++) energy += Math.abs(f1.flow[i]);
  assert.ok(energy > 0, 'frame 1 field is encoded curl');
  const packed = packFlowRgba(f1);
  const back = unpackFlowRgba(packed.rgba, packed.w, packed.h);
  for (let i = 0; i < f1.flow.length; i++) {
    assert.ok(Math.abs(back.flow[i] - f1.flow[i]) < 1e-6);
  }
  const a = sampleFlow(f1, 0.5, 0.5);
  const b = hop.sample(back, 0.5, 0.5);
  assert.ok(Math.abs(a.x - b.x) < 1e-5 && Math.abs(a.y - b.y) < 1e-5);
}

{
  const rgba = new Float32Array(4 * 4);
  rgba[0] = 1; rgba[1] = 1; rgba[2] = 1; rgba[3] = 1;
  const luma = lumaFromRgba(rgba, 2, 2);
  assert.ok(luma[0] > 0.99);
  assert.strictEqual(luma[1], 0);
}

console.log('kernel/tracks/feedHop.selfcheck: OK');
