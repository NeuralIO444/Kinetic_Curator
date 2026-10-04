/**
 * regionCycle.selfcheck — #725 slice 4: per-region color cycling.
 *
 *  - sanitize: speeds clamp, zeros/negatives drop, unknown slots drop
 *  - hueRotateRgb: 0° is identity, 360° returns, 180° shifts hue
 *  - amount-0 identity: speed 0 → no entry (static path untouched)
 */
import assert from 'node:assert';
import { sanitizeAssetRegionCycle, hueRotateRgb, CYCLE_MAX } from './regionCycle.js';

// Sanitizer.
assert.strictEqual(sanitizeAssetRegionCycle(null), null);
assert.strictEqual(sanitizeAssetRegionCycle([]), null);
assert.strictEqual(sanitizeAssetRegionCycle({ a: { A: 0 } }), null, 'speed 0 = off → nothing left → null');
assert.strictEqual(sanitizeAssetRegionCycle({ a: { A: -1 } }), null, 'negative drops');
assert.deepStrictEqual(
  sanitizeAssetRegionCycle({ a: { A: 1.5, B: 99, C: 0, Z: 2 }, b: 'x' }),
  { a: { A: 1.5, B: CYCLE_MAX } },
  'clamp to max, drop zero/unknown slots/non-objects',
);

// Hue rotation: identity at 0°, full circle at 360°.
{
  const c = [0.8, 0.2, 0.1];
  const id = hueRotateRgb(c, 0);
  assert.ok(id.every((v, i) => Math.abs(v - c[i]) < 1e-9), '0° is identity');
  const full = hueRotateRgb(c, 360);
  assert.ok(full.every((v, i) => Math.abs(v - c[i]) < 1e-9), '360° returns');
  const half = hueRotateRgb(c, 180);
  const dist = Math.hypot(half[0] - c[0], half[1] - c[1], half[2] - c[2]);
  assert.ok(dist > 0.3, `180° visibly shifts hue (dist ${dist.toFixed(2)})`);
  // achromatic stays achromatic (hue of gray is undefined → no-op)
  const gray = hueRotateRgb([0.5, 0.5, 0.5], 123);
  assert.ok(Math.abs(gray[0] - gray[1]) < 1e-9 && Math.abs(gray[1] - gray[2]) < 1e-9, 'gray stays gray');
}

console.log('regionCycle.selfcheck: OK');
