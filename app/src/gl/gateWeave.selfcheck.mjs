// node src/gl/gateWeave.selfcheck.mjs
// #741: the weave is a whisper (bounded), deterministic (a pure function of
// time + frame), alive (not constant), and centred (no net drift).
import assert from 'node:assert';
import { gateWeaveOffset, WEAVE_MAX_PX } from './gateWeave.mjs';

assert.ok(WEAVE_MAX_PX <= 0.75, 'subtle at max: under three-quarters of a pixel');

let sx = 0, sy = 0, n = 0, maxX = 0, maxY = 0;
const seenX = new Set();
for (let f = 0; f < 20000; f++) {
  const [dx, dy] = gateWeaveOffset(f * 16.667, f); // ~5.5 min at 60fps
  assert.ok(Number.isFinite(dx) && Number.isFinite(dy), 'finite');
  assert.ok(Math.abs(dx) <= WEAVE_MAX_PX && Math.abs(dy) <= WEAVE_MAX_PX, `bounded: ${dx}, ${dy}`);
  maxX = Math.max(maxX, Math.abs(dx)); maxY = Math.max(maxY, Math.abs(dy));
  sx += dx; sy += dy; n++;
  seenX.add(dx.toFixed(4));
}
assert.ok(maxX > 0.2 && maxY > 0.1, `it actually moves (max ${maxX.toFixed(2)}, ${maxY.toFixed(2)})`);
assert.ok(seenX.size > 1000, 'not a constant or a short loop');
assert.ok(Math.abs(sx / n) < 0.03 && Math.abs(sy / n) < 0.03, 'centred: no net drift');

assert.deepStrictEqual(gateWeaveOffset(1234.5, 77), gateWeaveOffset(1234.5, 77), 'deterministic');
assert.notDeepStrictEqual(gateWeaveOffset(1000, 1), gateWeaveOffset(1000, 2), 'the jitter changes per frame');
// Hostile inputs never produce NaN into the shader.
for (const bad of [NaN, Infinity, -Infinity, undefined]) {
  const [dx, dy] = gateWeaveOffset(bad, bad);
  assert.ok(Number.isFinite(dx) && Number.isFinite(dy), `hostile ${bad} stays finite`);
}
console.log('gateWeave.selfcheck: OK');
