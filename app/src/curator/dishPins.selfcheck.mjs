// node src/curator/dishPins.selfcheck.mjs
// #1355 step 2 — pins as data: one by default, Shift adds up to four, scene coordinates.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_PINS, sanitizePins, placePin, clientToScene } from './dishPins.js';

// 1. one pin by default: a plain click places it, the next plain click MOVES it
{
  const a = placePin([], { x: 10, y: 20 });
  assert.deepEqual(a, [{ x: 10, y: 20 }]);
  const b = placePin(a, { x: 30, y: 40 });
  assert.deepEqual(b, [{ x: 30, y: 40 }], 'moved, not added');
  assert.notEqual(a, b, 'a new array: the store is immutable');
  assert.deepEqual(a, [{ x: 10, y: 20 }], 'the old array is untouched');
}

// 2. Shift adds, up to the limit of four; past the limit the newest pin moves
{
  assert.equal(MAX_PINS, 4);
  let p = [];
  for (let i = 0; i < 4; i++) p = placePin(p, { x: i, y: i }, { add: true });
  assert.equal(p.length, 4);
  const q = placePin(p, { x: 99, y: 99 }, { add: true });
  assert.equal(q.length, 4, 'never more than four');
  assert.deepEqual(q[3], { x: 99, y: 99 });
  assert.deepEqual(q.slice(0, 3), p.slice(0, 3), 'the older pins stay where they were');
  // a plain click with several pins moves only the newest
  assert.deepEqual(placePin(p, { x: 7, y: 7 }).slice(0, 3), p.slice(0, 3));
}

// 3. junk never becomes a pin
{
  const p = [{ x: 1, y: 2 }];
  for (const bad of [null, undefined, {}, { x: NaN, y: 1 }, { x: 1, y: Infinity }, { x: '1', y: 2 }]) {
    assert.equal(placePin(p, bad), p, 'same array back');
  }
  assert.deepEqual(sanitizePins('x'), []);
  assert.deepEqual(sanitizePins([{ x: 1, y: 2, extra: 3 }, null, { x: NaN, y: 0 }]), [{ x: 1, y: 2 }]);
  assert.equal(sanitizePins(Array.from({ length: 9 }, (_, i) => ({ x: i, y: i }))).length, 4);
}

// 4. a click lands where the artist sees it: letterbox, zoom about the centre, pan
{
  const W = 1000, H = 500;
  const rect = { left: 100, top: 50, width: 500, height: 250 }; // exact fit, half size
  assert.deepEqual(clientToScene(rect, 350, 175, W, H), { x: 500, y: 250 }, 'centre');
  assert.deepEqual(clientToScene(rect, 100, 50, W, H), { x: 0, y: 0 }, 'top-left');
  // a taller box letterboxes the canvas: bars above and below are not the dish
  const tall = { left: 0, top: 0, width: 500, height: 450 };
  assert.equal(clientToScene(tall, 250, 50, W, H), null, 'a click on the bar is no pin');
  assert.deepEqual(clientToScene(tall, 250, 225, W, H), { x: 500, y: 250 });
  // zoom is about the canvas centre, pan is in canvas pixels: invert liveLoop's x' = z(x - CX) + CX + pan
  const z = 2, pan = { x: 40, y: -20 };
  const s = clientToScene(rect, 350, 175, W, H, z, pan);
  assert.ok(Math.abs(z * (s.x - 500) + 500 + pan.x - 500) < 1e-9 && Math.abs(z * (s.y - 250) + 250 + pan.y - 250) < 1e-9);
  assert.equal(clientToScene({ left: 0, top: 0, width: 0, height: 0 }, 1, 1, W, H), null, 'degenerate rect (#454)');
}

// 5. the live loop hands the pins to the resolver, so a performance records them (roadmap: pin events are logged)
{
  const loop = readFileSync(new URL('../gl/liveLoop.mjs', import.meta.url), 'utf8');
  assert.ok(/dishPins: s\.dishPins/.test(loop), 'liveLoop passes dishPins in the resolver input');
  const src = readFileSync(new URL('./dishPins.js', import.meta.url), 'utf8');
  assert.ok(!/Date\.now|performance\.now|Math\.random/.test(src), 'no clock, no randomness');
}

console.log('dishPins.selfcheck: ok (#1355 step 2)');
