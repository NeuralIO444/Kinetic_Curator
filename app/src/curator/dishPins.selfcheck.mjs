// node src/curator/dishPins.selfcheck.mjs
// #1355 — a pin is a creature's home, as data: well-formed, at most four, scene coordinates, and the resolver reads it.
// (Auto spawn, curator/spawn.js, chooses them; there is no manual placement any more.)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_PINS, sanitizePins } from './dishPins.js';

// 1. junk never becomes a pin, and there are at most four
{
  assert.equal(MAX_PINS, 4);
  assert.deepEqual(sanitizePins('x'), []);
  assert.deepEqual(sanitizePins(null), []);
  assert.deepEqual(sanitizePins([{ x: 1, y: 2, extra: 3 }, null, { x: NaN, y: 0 }, { x: '1', y: 2 }, { x: Infinity, y: 1 }]), [{ x: 1, y: 2 }]);
  assert.equal(sanitizePins(Array.from({ length: 9 }, (_, i) => ({ x: i, y: i }))).length, 4);
}

// 2. the resolver is handed the homes by the live loop
{
  const loop = readFileSync(new URL('../gl/liveLoop.mjs', import.meta.url), 'utf8');
  assert.ok(/dishPins: s\.dishPins/.test(loop), 'liveLoop passes dishPins in the resolver input');
  const src = readFileSync(new URL('./dishPins.js', import.meta.url), 'utf8');
  assert.ok(!/Date\.now|performance\.now|Math\.random/.test(src), 'no clock, no randomness');
}

// 3. the manual tool is gone: no PIN button, no canvas click, no marks to place
{
  const pool = readFileSync(new URL('../panels/AssetPoolPanel.jsx', import.meta.url), 'utf8');
  const canvas = readFileSync(new URL('../panels/CanvasPanel.jsx', import.meta.url), 'utf8');
  assert.ok(!/pin-tool|pinArmed|placeDishPin|clearDishPins/.test(pool), 'no PIN button in the asset panel');
  assert.ok(!/pinArmed|placeDishPin|clientToScene|dish-pins/.test(canvas), 'no pin click or marks on the canvas');
}

console.log('dishPins.selfcheck: ok (#1355 homes as data)');
