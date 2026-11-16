// node src/engine/dishFluidCells.selfcheck.mjs
// K1 slice 4b (#2186, S2) — the GPU field as a recorded input. Pinned: the codec round-trips; the readers (births, bone
// pull) see EXACTLY the same field from the live dense read and from the recorded cells; noise below the floor never leaks;
// a malformed cells object is inert; the cells survive the input log (JSON) bit for bit.
import assert from 'node:assert/strict';
import {
  packFluidCells,
  unpackFluidCells,
  readableDensity,
  isFluidCells,
  FLUID_CELLS_FLOOR,
} from './dishFluidCells.mjs';
import { fluidBirthSet } from './dishFluidCouple.mjs';
import { bonePullDelta } from './dishFluidPull.mjs';
import { FLUID_GRID_COLS, FLUID_GRID_ROWS } from './dishFluid.mjs';
import { createInputLog, replayInputs } from './kernel/replay/inputLog.js';

const N = FLUID_GRID_COLS * FLUID_GRID_ROWS;
let groups = 0;
const field = (seed) => {
  const d = new Float32Array(N);
  let s = seed >>> 0;
  for (let i = 0; i < N; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const r = s / 4294967296;
    d[i] = r < 0.3 ? 0.15 + r * 2 : r * 0.4; // a mix of matter, near-floor and empty
  }
  return d;
};

// A: codec — only cells above the floor ride; unpack is the dequantized field; unknown/oob entries are inert
{
  const d = field(1);
  const c = packFluidCells(d, 12);
  assert.equal(c.step, 12);
  assert.ok(c.idx.length > 0 && c.idx.length < N, 'sparse');
  const u = unpackFluidCells(c);
  for (let i = 0; i < N; i++) {
    const q = Math.round(d[i] * 255);
    if (q / 255 > FLUID_CELLS_FLOOR) assert.equal(u[i], Math.fround(q / 255));
    else assert.equal(u[i], 0, 'at or under the floor reads as empty');
  }
  // an out-of-range index is skipped, never written
  const oob = { step: 1, idx: Uint16Array.of(5, 65535), q: Uint8Array.of(255, 255) };
  const uo = unpackFluidCells(oob);
  assert.equal(uo[5], 1);
  assert.equal(
    uo.reduce((a, v) => a + (v > 0 ? 1 : 0), 0),
    1,
    'only the in-range cell lands',
  );
  groups++;
}
// B: the readers see the same field live (readableDensity) and recorded (unpack of the packed cells)
{
  for (const seed of [3, 4, 5]) {
    const d = field(seed);
    const live = readableDensity(d, 7);
    const rec = unpackFluidCells(packFluidCells(d, 7));
    assert.deepEqual(Array.from(live), Array.from(rec), 'the host hands what replay will read');
    const culture = {
      cols: FLUID_GRID_COLS,
      rows: FLUID_GRID_ROWS,
      cur: new Uint8Array(N),
      mask: null,
      bedrock: null,
      gen: 3,
    };
    assert.deepEqual(fluidBirthSet(culture, live, 0.8, 99), fluidBirthSet(culture, rec, 0.8, 99), 'births agree');
    const f = (density) => ({ density, magnets: [{ x: 0.5, y: 0.5 }], pull: 0.7, aspectHW: 0.7, W: 1000, H: 700 });
    for (const [jx, jy] of [
      [100, 100],
      [500, 350],
      [910, 640],
      [333, 222],
    ]) {
      assert.deepEqual(
        bonePullDelta(f(live), jx, jy, jx + 20, jy + 5),
        bonePullDelta(f(rec), jx, jy, jx + 20, jy + 5),
        'pull agrees',
      );
    }
  }
  groups++;
}
// C: malformed cells are refused by shape and inert when unpacked
{
  assert.equal(isFluidCells(null), false);
  assert.equal(isFluidCells({ step: 1, idx: [1], q: [2] }), false, 'plain arrays are not the typed form');
  assert.equal(isFluidCells({ step: 1, idx: Uint16Array.of(1, 2), q: Uint8Array.of(1) }), false, 'length mismatch');
  assert.ok(unpackFluidCells({ junk: 1 }).every((v) => v === 0));
  assert.equal(packFluidCells(new Float32Array(3)).idx.length, 0, 'a wrong-sized field packs to nothing');
  groups++;
}
// D: the cells ride the input log exactly (typed arrays keep their type), identity pattern included
{
  const log = createInputLog();
  const c1 = packFluidCells(field(8), 1);
  const c2 = packFluidCells(field(9), 2);
  log.record({ a: 1, dishFluidCells: c1 });
  log.record({ a: 1, dishFluidCells: c1 });
  log.record({ a: 1, dishFluidCells: c2 });
  const data = JSON.parse(JSON.stringify(log.finish()));
  const back = [...replayInputs(data)];
  assert.equal(back.length, 3);
  assert.ok(back[0].dishFluidCells.idx instanceof Uint16Array && back[0].dishFluidCells.q instanceof Uint8Array);
  assert.deepEqual(Array.from(back[0].dishFluidCells.idx), Array.from(c1.idx));
  assert.deepEqual(Array.from(back[2].dishFluidCells.q), Array.from(c2.q));
  assert.equal(back[2].dishFluidCells.step, 2);
  groups++;
}
console.log(`dishFluidCells.selfcheck: OK (${groups} groups) — K1 slice 4b #2186`);
