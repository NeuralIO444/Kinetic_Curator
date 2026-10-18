// viewportMath.selfcheck.mjs — audit standards, hooks tests slice 1 (#1686).
// Characterization pins for useCanvasViewport's pure core, hand-derived
// from the hook's inline formulas BEFORE extraction:
//   zoom:  clamp(z - deltaY * 0.0015, 0.1, 10)
//   pan:   startPan + (client - dragStart)
//   attractor: canvas-space point through pan/zoom, with the #454
//   degenerate-rect guard (a zero-size rect once fed Infinity/NaN into
//   the physics — the guard's null is load-bearing).
import assert from 'node:assert';
import { nextZoom, panFromDrag, attractorPoint } from './viewportMath.mjs';

// Zoom (hand-computed from the formula).
assert.strictEqual(nextZoom(1, -100), 1.15, 'wheel up zooms in by deltaY * 0.0015');
assert.strictEqual(nextZoom(1, 100), 0.85, 'wheel down zooms out');
assert.strictEqual(nextZoom(2, 0), 2, 'no wheel delta, no change');
assert.strictEqual(nextZoom(9.99, -1000), 10, 'zoom clamps at 10');
assert.strictEqual(nextZoom(0.2, 1000), 0.1, 'zoom clamps at 0.1');

// Pan.
assert.deepStrictEqual(panFromDrag(10, 20, 100, 100, 130, 70), { x: 40, y: -10 },
  'pan follows the pointer from the drag start');
assert.deepStrictEqual(panFromDrag(0, 0, 50, 50, 50, 50), { x: 0, y: 0 }, 'no movement, no pan');

// Attractor: rect 500x350 at origin, canvas 1000x700 (scale 2), client
// centre (250,175) -> canvas (500,350); pan (50,50), zoom 2 -> (225,150).
const rect = { left: 0, top: 0, width: 500, height: 350 };
assert.deepStrictEqual(
  attractorPoint(250, 175, rect, 50, 50, 2, 1000, 700),
  { x: 225, y: 150 },
  'attractor maps client -> canvas -> world through pan/zoom',
);
// #454: a degenerate rect is "no attractor this frame", never Infinity/NaN.
for (const bad of [
  { left: 0, top: 0, width: 0, height: 350 },
  { left: 0, top: 0, width: 500, height: 0 },
  { left: 0, top: 0, width: NaN, height: 350 },
]) {
  assert.strictEqual(
    attractorPoint(10, 10, bad, 0, 0, 1, 1000, 700),
    null,
    `degenerate rect (${bad.width}x${bad.height}) yields null, per #454`,
  );
}

console.log('viewportMath.selfcheck: OK — viewport pure core pinned');
