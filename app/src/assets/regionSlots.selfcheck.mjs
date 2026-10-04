/**
 * regionSlots.selfcheck — #725 slice 2: slot bookkeeping acceptance.
 *
 *  - four fixed slots, one region per slot, a region in at most one slot
 *  - assignments keyed by stable ID (redraw-safe, recolor-breaking)
 *  - hostile/malformed storage input normalizes cleanly, never throws
 */
import assert from 'node:assert';
import {
  REGION_SLOTS, emptyRegionSlots, normalizeRegionSlots,
  assignRegionSlot, slotOfRegion, normalizeRegions,
} from './regionSlots.js';

const ID_A = 'rm-ff0000-2-2';
const ID_B = 'rm-0000ff-6-6';

// Four fixed slots.
assert.deepStrictEqual(REGION_SLOTS, ['A', 'B', 'C', 'D']);
assert.deepStrictEqual(emptyRegionSlots(), { A: null, B: null, C: null, D: null });

// Assign + move + unassign.
{
  let s = assignRegionSlot(emptyRegionSlots(), 'A', ID_A);
  assert.strictEqual(s.A, ID_A);
  assert.strictEqual(slotOfRegion(s, ID_A), 'A');
  // moving to B vacates A
  s = assignRegionSlot(s, 'B', ID_A);
  assert.strictEqual(s.A, null);
  assert.strictEqual(s.B, ID_A);
  assert.strictEqual(slotOfRegion(s, ID_A), 'B');
  // unassign
  s = assignRegionSlot(s, 'B', null);
  assert.strictEqual(s.B, null);
  assert.strictEqual(slotOfRegion(s, ID_A), null);
}

// Unknown slot / malformed id → no-op (normalized).
{
  const s = assignRegionSlot(emptyRegionSlots(), 'Z', ID_A);
  assert.deepStrictEqual(s, emptyRegionSlots());
  const s2 = assignRegionSlot(emptyRegionSlots(), 'A', 'not-an-id');
  assert.deepStrictEqual(s2, emptyRegionSlots());
}

// Double-booked storage: first slot wins.
{
  const s = normalizeRegionSlots({ A: ID_A, B: ID_A, C: ID_B, Z: ID_A });
  assert.strictEqual(s.A, ID_A);
  assert.strictEqual(s.B, null);
  assert.strictEqual(s.C, ID_B);
}

// Hostile storage input.
{
  assert.deepStrictEqual(normalizeRegionSlots(null), emptyRegionSlots());
  assert.deepStrictEqual(normalizeRegionSlots('x'), emptyRegionSlots());
  assert.deepStrictEqual(normalizeRegionSlots({ A: 42, B: [ID_A] }), emptyRegionSlots());
}

// Region list round-trip: well-formed survives byte-identical.
{
  const regions = [
    { id: ID_A, color: 'ff0000', cx: 0.25, cy: 0.25, x0: 0.1, y0: 0.1, x1: 0.4, y1: 0.4, area: 3600 },
    { id: ID_B, color: '0000ff', cx: 0.75, cy: 0.75, x0: 0.6, y0: 0.6, x1: 0.9, y1: 0.9, area: 3600 },
  ];
  assert.deepStrictEqual(normalizeRegions(regions), regions);
  assert.deepStrictEqual(normalizeRegions(regions), normalizeRegions(JSON.parse(JSON.stringify(regions))));
}

// Malformed regions dropped; dup IDs deduped.
{
  const out = normalizeRegions([
    { id: ID_A, color: 'ff0000', cx: 0.25, cy: 0.25, x0: 0.1, y0: 0.1, x1: 0.4, y1: 0.4, area: 3600 },
    { id: ID_A, color: 'ff0000', cx: 0.3, cy: 0.3, x0: 0.1, y0: 0.1, x1: 0.4, y1: 0.4, area: 100 },
    { id: 'bogus', color: 'ff0000', cx: 0.5, cy: 0.5, x0: 0, y0: 0, x1: 1, y1: 1, area: 10 },
    { id: ID_B, color: 'zzz', cx: 0.5, cy: 0.5, x0: 0, y0: 0, x1: 1, y1: 1, area: 10 },
    null, 'x', 42,
  ]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].id, ID_A);
}

console.log('regionSlots.selfcheck: OK');
