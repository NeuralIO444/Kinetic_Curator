// node src/engine/dishCultureCells.selfcheck.mjs
// K2 slice 2b (#2187) — the GPU culture's grid as a recorded input: the codec round-trips (decay states included), only
// non-dead cells are kept, malformed input is inert, and the cells survive the input log (JSON) bit for bit.
import assert from 'node:assert/strict';
import { packCultureCells, unpackCultureCells, isCultureCells } from './dishCultureCells.mjs';
import { createInputLog, replayInputs } from './kernel/replay/inputLog.js';

const N = 96 * 54;
const grid = new Uint8Array(N);
for (let i = 0; i < N; i++) grid[i] = (i * 2654435761) % 7 < 2 ? 1 + (i % 4) : 0;
let groups = 0;

{
  const c = packCultureCells(grid, 12);
  assert.equal(c.gen, 12);
  assert.ok(isCultureCells(c));
  assert.equal(
    c.idx.length,
    grid.reduce((n, v) => n + (v > 0 ? 1 : 0), 0),
    'only non-dead cells are kept',
  );
  assert.deepEqual(unpackCultureCells(c), grid, 'pack/unpack is the identity on the grid, decay states included');
  groups++;
}
{
  for (const bad of [
    null,
    {},
    { gen: 1, idx: [1], v: [1] },
    { gen: 'x', idx: new Uint16Array(1), v: new Uint8Array(1) },
    { gen: 1, idx: new Uint16Array(2), v: new Uint8Array(1) },
  ])
    assert.equal(isCultureCells(bad), false);
  assert.equal(
    unpackCultureCells(null).every((v) => v === 0),
    true,
    'junk unpacks to an empty grid',
  );
  const wrong = packCultureCells(new Uint8Array(10), 3);
  assert.equal(wrong.idx.length, 0, 'a wrong-size grid packs empty');
  const oob = unpackCultureCells({ gen: 0, idx: Uint16Array.of(N + 5, 3), v: Uint8Array.of(9, 4) });
  assert.equal(oob[3], 4);
  assert.equal(
    oob.reduce((n, v) => n + v, 0),
    4,
    'an out-of-range index is skipped',
  );
  groups++;
}
{
  const log = createInputLog();
  log.record({ dishCultureCells: packCultureCells(grid, 40) });
  const [back] = [...replayInputs(JSON.parse(JSON.stringify(log.finish())))];
  assert.ok(isCultureCells(back.dishCultureCells), 'the cells survive the input log');
  assert.deepEqual(unpackCultureCells(back.dishCultureCells), grid, 'and read back bit for bit');
  groups++;
}
console.log(`dishCultureCells.selfcheck: OK (${groups} groups) — K2 slice 2b #2187`);
