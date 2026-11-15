// dishFluidRender.selfcheck.mjs — FERROFLUID (#1997, re-pinned by #2178): the matter constants.
//
// This suite used to pin the CPU seating (fluidMatterItems): the body as ordinary resolver
// items, wearing the nearest dealt mark or dealt from the stage pool, capped at 480. #2178
// RETIRED that path (Matt's rulings on the issue: Option B body, GPU seating, clean take
// break) — the body is a GPU channel now (engine/dishFluidChannel.mjs), and every law the
// old suite pinned lives there, pinned by dishFluidChannel.selfcheck.mjs against the seat
// model: the density floor gate, bedrock, the pool vocabulary (letterforms included), the
// empty pool that seats nothing, the primitive fallback. What remains here is the
// retirement itself and the shared matter law this module still owns:
//
//   - the retired exports are gone (fluidMatterItems, seatDensity, isFluidMatter,
//     MAX_FLUID_ITEMS) — nothing can quietly resurrect the item body;
//   - no production module imports them (the resolver's fluid block annotates the plan
//     with the channel descriptor instead — liveResolve.dishFluid pins that side);
//   - the surviving constants keep their values: the channel's scale law, the pull's
//     density gate and the seat model's floor all read them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as render from './dishFluidRender.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

console.log('dishFluidRender — the matter constants after the channel (#2178)');

ok('the retired CPU body is gone from the module', () => {
  assert.equal(render.fluidMatterItems, undefined, 'fluidMatterItems retired');
  assert.equal(render.seatDensity, undefined, 'seatDensity retired');
  assert.equal(render.isFluidMatter, undefined, 'isFluidMatter retired');
  assert.equal(render.MAX_FLUID_ITEMS, undefined, 'the 480 cap retired with the items');
  assert.deepEqual(
    Object.keys(render).sort(),
    ['FLUID_PRIMITIVE_ASSETS', 'MATTER_CELL_RADIUS', 'MATTER_DENSITY_FLOOR', 'MATTER_SCALE_MIN'],
    'the module exports exactly the shared matter law',
  );
});

ok('no production module reaches for the retired body', () => {
  const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const resolve = readFileSync(path.join(APP, 'src', 'gl', 'liveResolve.mjs'), 'utf8');
  assert.ok(!resolve.includes('fluidMatterItems'), 'the resolver emits no body items');
  assert.ok(!resolve.includes('isFluidMatter'), 'the resolver filters no body items');
  assert.ok(resolve.includes('plan.fieldBody ='), 'the resolver annotates the plan with the channel descriptor');
});

ok('the surviving matter law keeps its values', () => {
  assert.equal(render.MATTER_DENSITY_FLOOR, 0.25, 'the floor the channel gates and the pull reads');
  assert.equal(render.MATTER_CELL_RADIUS, 0.6, 'the radius term in the channel’s scale base');
  assert.equal(render.MATTER_SCALE_MIN, 0.45, 'the barely-seated scale the seat model interpolates from');
  assert.deepEqual(
    render.FLUID_PRIMITIVE_ASSETS,
    ['mrk_dots_01', 'mrk_ring_01', 'mrk_pit_01'],
    'the seed-shape fallback',
  );
});

console.log(`dishFluidRender.selfcheck: ok (${n} groups)`);
