/**
 * regionInstances.selfcheck — #725 slice 3: region-targeted kineme expansion.
 *
 *  - an asset with no slot kinemes → single normal instance (region -1)
 *  - a slot with a kineme → remainder (0) + region instance (slot index)
 *  - region instances carry their kineme id; unknown kineme ids are ignored
 *  - mask builder: slot pixels land at the right cell offset, 1:1, no filtering
 */
import assert from 'node:assert';
import {
  expandRegionInstances, buildRegionMask, slotIndex,
  MASK_CELL_PX, MASK_BOX_OFFSET, MASK_DETECT_PX,
} from './regionInstances.js';

const getKineme = (id) => (id === 'spin-slow' || id === 'bob-gentle' ? { id } : undefined);
const slots = new Map([
  ['user:shapes', { A: 'rm-ff0000-2-2', B: 'rm-0000ff-6-6', C: null, D: null }],
  ['user:plain', { A: null, B: null, C: null, D: null }],
]);

const base = (asset) => ({ asset, x: 10, y: 20, kineme: 0 });

// No slot kinemes → untouched, region -1.
{
  const out = expandRegionInstances([base('user:shapes')], slots, {}, getKineme);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].region, -1);
}

// Slot A has a kineme → remainder + A.
{
  const out = expandRegionInstances(
    [base('user:shapes')],
    slots,
    { 'user:shapes': { A: 'spin-slow' } },
    getKineme,
  );
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].region, 0, 'remainder first (drawn under)');
  assert.strictEqual(out[1].region, slotIndex('A'));
  assert.strictEqual(out[1].region, 1);
  assert.strictEqual(out[1].regionKinemeId, 'spin-slow');
  assert.strictEqual(out[1].regionSlot, 'A');
  // base transform survives the split
  assert.strictEqual(out[1].x, 10);
  assert.strictEqual(out[0].x, 10);
}

// Two animated slots → remainder + A + B, in slot order.
{
  const out = expandRegionInstances(
    [base('user:shapes')],
    slots,
    { 'user:shapes': { A: 'spin-slow', B: 'bob-gentle' } },
    getKineme,
  );
  assert.deepStrictEqual(out.map((i) => i.region), [0, 1, 2]);
  assert.strictEqual(out[2].regionKinemeId, 'bob-gentle');
}

// Unknown kineme id → slot treated as static (no region instance).
{
  const out = expandRegionInstances(
    [base('user:shapes')],
    slots,
    { 'user:shapes': { A: 'nope' } },
    getKineme,
  );
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].region, -1);
}

// Asset without slots → never expanded.
{
  const out = expandRegionInstances(
    [base('user:plain')],
    slots,
    { 'user:plain': { A: 'spin-slow' } },
    getKineme,
  );
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].region, -1);
}

// Cycle speed alone (no motion kineme) also expands the slot.
{
  const out = expandRegionInstances(
    [base('user:shapes')],
    slots,
    {},
    getKineme,
    { 'user:shapes': { B: 1.5 } },
  );
  assert.deepStrictEqual(out.map((i) => i.region), [0, 2]);
  assert.strictEqual(out[1].regionCycle, 1.5);
  assert.strictEqual(out[1].regionKinemeId, null);
  assert.strictEqual(out[0].regionCycle, undefined, 'remainder carries no cycle');
}

// Mask: 200px detection → 400px cell at offset (100,100), 1:1.
{
  const W = MASK_DETECT_PX;
  const idMap = new Int32Array(W * W).fill(-1);
  const regions = [
    { id: 'rm-ff0000-2-2' },
    { id: 'rm-0000ff-6-6' },
  ];
  // paint region 0 (slot A) at detection pixel (10, 20), region 1 (slot B) at (30, 40)
  idMap[20 * W + 10] = 0;
  idMap[40 * W + 30] = 1;
  const mask = buildRegionMask(
    { idMap, w: W, h: W, regions },
    { A: 'rm-ff0000-2-2', B: 'rm-0000ff-6-6', C: null, D: null },
  );
  assert.strictEqual(mask.length, MASK_CELL_PX * MASK_CELL_PX);
  const at = (x, y) => mask[y * MASK_CELL_PX + x];
  assert.strictEqual(at(10 + MASK_BOX_OFFSET, 20 + MASK_BOX_OFFSET), 1, 'slot A pixel at cell offset');
  assert.strictEqual(at(30 + MASK_BOX_OFFSET, 40 + MASK_BOX_OFFSET), 2, 'slot B pixel at cell offset');
  assert.strictEqual(at(0, 0), 0, 'cell corner is unassigned');
  assert.strictEqual(at(150, 150), 0, 'unpainted detection pixel stays 0');
}

// Mask with no slots → all zeros (shader keeps remainder path honest).
{
  const W = MASK_DETECT_PX;
  const mask = buildRegionMask(
    { idMap: new Int32Array(W * W).fill(0), w: W, h: W, regions: [{ id: 'rm-ff0000-2-2' }] },
    { A: null, B: null, C: null, D: null },
  );
  assert.ok(mask.every((v) => v === 0));
}

console.log('regionInstances.selfcheck: OK');
