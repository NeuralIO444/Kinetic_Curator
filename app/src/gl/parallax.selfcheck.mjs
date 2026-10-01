import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyParallax, parallaxOffset } from './parallax.mjs';

test('#796 zero parallax is a no-op', () => {
  assert.deepEqual(parallaxOffset(0, 4, 0, 1, 1000), { x: 0, y: 0 });
});

test('#796 same inputs are bit-identical', () => {
  const a = parallaxOffset(2, 4, 0.4, 0xabc, 8000);
  const b = parallaxOffset(2, 4, 0.4, 0xabc, 8000);
  assert.ok(Object.is(a.x, b.x) && Object.is(a.y, b.y));
});

test('#796 far tiers move more than near', () => {
  const near = parallaxOffset(0, 4, 0.8, 7, 4000);
  const far = parallaxOffset(3, 4, 0.8, 7, 4000);
  assert.ok(Math.hypot(far.x, far.y) > Math.hypot(near.x, near.y));
});

test('#796 apply mutates only when amount > 0', () => {
  const items = [{ x: 10, y: 20, zTier: 2 }];
  applyParallax(items, { zTiers: 4, parallax: 0, seed: 1, loopTimeMs: 500 });
  assert.equal(items[0].x, 10);
  applyParallax(items, { zTiers: 4, parallax: 0.5, seed: 1, loopTimeMs: 500 });
  assert.notEqual(items[0].x, 10);
});
