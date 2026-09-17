// primitives.selfcheck — motif kit geometry for the Asset Studio (#114).
import assert from 'node:assert';
import { polygonPoints, polyInner, PRIMITIVES } from './primitives.js';

for (let n = 3; n <= 8; n++) {
  const pts = polygonPoints(n).split(' ');
  assert.strictEqual(pts.length, n, `n=${n} yields ${n} points`);
  for (const p of pts) {
    const [x, y] = p.split(',').map(Number);
    assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100, `point ${p} inside 100x100`);
  }
}
// Clamping: out-of-range sides fall back to the 3–8 window.
assert.strictEqual(polygonPoints(2).split(' ').length, 3);
assert.strictEqual(polygonPoints(99).split(' ').length, 8);
// The n-gon sits on a radius-32 circle around (50,50).
const [hx, hy] = polygonPoints(6).split(' ')[0].split(',').map(Number);
assert.ok(Math.abs(Math.hypot(hx - 50, hy - 50) - 32) < 0.01);

const inner = polyInner(5);
assert.ok(inner.includes('<polygon points="'));
assert.ok(inner.includes('fill="currentColor"'));
assert.strictEqual(inner.split(' ').filter((t) => t.includes(',')).length, 5);

// Kit tokens only: currentColor paint, no literals beyond geometry.
for (const [id, markup] of Object.entries(PRIMITIVES)) {
  assert.ok(!/#[0-9a-f]{3,6}/i.test(markup), `${id} carries no literal hex`);
  assert.ok(markup.includes('currentColor'), `${id} paints via currentColor`);
}

console.log('primitives.selfcheck: OK');
