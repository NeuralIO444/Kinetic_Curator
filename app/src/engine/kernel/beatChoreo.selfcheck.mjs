import assert from 'node:assert/strict';
import {
  CHOREO_SLOTS, CHOREO_SLOT_T, CHOREO_MAX_DELAY,
  heroIndex, chorusOrder, chorusSlot, choreoPlan, choreoWindow,
} from './beatChoreo.mjs';

let n = 0, fail = 0;
function ok(name, fn) {
  n++;
  try { fn(); console.log(`  [ok] ${name}`); }
  catch (e) { fail++; console.log(`  [FAIL] ${name}: ${e.message}`); }
}

const mk = (x, y, scale) => ({ x, y, scale });

ok('heroIndex picks the largest mark', () => {
  const items = [mk(0, 0, 1), mk(10, 0, 5), mk(20, 0, 2)];
  assert.equal(heroIndex(items), 1);
});

ok('heroIndex: tie goes to the lowest index; empty has no hero', () => {
  assert.equal(heroIndex([mk(0, 0, 3), mk(1, 1, 3)]), 0);
  assert.equal(heroIndex([]), -1);
  assert.equal(heroIndex([mk(0, 0, NaN)]), 0, 'non-finite scale reads as 0, still a hero');
});

ok('chorusOrder is nearest-first from the hero, hero excluded', () => {
  const items = [mk(0, 0, 9), mk(100, 0, 1), mk(30, 0, 1), mk(200, 0, 1)];
  assert.deepEqual(chorusOrder(items, 0), [2, 1, 3]);
});

ok('chorusOrder: distance ties keep index order', () => {
  const items = [mk(0, 0, 9), mk(50, 0, 1), mk(-50, 0, 1)];
  assert.deepEqual(chorusOrder(items, 0), [1, 2]);
});

ok('chorusSlot spreads ranks across slots 1..3', () => {
  assert.equal(chorusSlot(0, 1), 1, 'lone chorus mark takes slot 1');
  assert.equal(chorusSlot(0, 2), 1);
  assert.equal(chorusSlot(1, 2), 3, 'farthest ring takes the last slot');
  assert.equal(chorusSlot(0, 100), 1);
  assert.equal(chorusSlot(99, 100), 3);
  for (let r = 0; r < 100; r++) {
    const s = chorusSlot(r, 100);
    assert.ok(s >= 1 && s <= CHOREO_SLOTS - 1, `slot ${s} in range`);
  }
  // monotonic: nearer never starts later than farther
  let prev = 1;
  for (let r = 0; r < 100; r++) {
    const s = chorusSlot(r, 100);
    assert.ok(s >= prev, `rank ${r}: slot ${s} >= ${prev}`);
    prev = s;
  }
});

ok('choreoPlan: hero owns slot 0, chorus radiates outward', () => {
  const items = [mk(0, 0, 1), mk(10, 0, 8), mk(100, 0, 1), mk(1000, 0, 1)];
  const plan = choreoPlan(items);
  assert.equal(plan.hero, 1);
  assert.equal(plan.slots[1], 0, 'hero on the downbeat');
  assert.ok(plan.slots[0] >= 1 && plan.slots[2] >= 1 && plan.slots[3] >= 1);
  assert.ok(plan.slots[0] <= plan.slots[2] && plan.slots[2] <= plan.slots[3],
    'nearer the hero, earlier the slot');
});

ok('choreoWindow: starts quantize to the 16th-note grid', () => {
  const grid = new Set([0, 1, 2, 3].map((s) => s * CHOREO_SLOT_T));
  for (let s = 0; s < CHOREO_SLOTS; s++) {
    for (let i = 0; i < 40; i++) {
      const { delay, dur } = choreoWindow(s, i, 11);
      assert.ok(grid.has(delay), `delay ${delay} is on the grid`);
      assert.ok(delay <= CHOREO_MAX_DELAY + 1e-12, 'no start past the max delay');
      assert.ok(delay + dur <= 1 + 1e-9, `window closes by t=1 (got ${delay + dur})`);
      assert.ok(dur >= 0.4, `window long enough to read (got ${dur})`);
    }
  }
});

ok('choreoWindow: hero window matches the seeded duration shape', () => {
  // Same (index, seed) -> same duration the old stagger would give at delay 0.
  const a = choreoWindow(0, 7, 42);
  const b = choreoWindow(0, 7, 42);
  assert.deepEqual(a, b, 'deterministic');
  assert.notDeepEqual(choreoWindow(0, 7, 42), choreoWindow(0, 7, 43), 'seed still varies duration');
});

ok('choreoPlan is deterministic and empty-safe', () => {
  const items = [mk(5, 5, 2), mk(0, 0, 7), mk(9, 1, 2)];
  assert.deepEqual(choreoPlan(items), choreoPlan(items));
  assert.deepEqual(choreoPlan([]), { hero: -1, slots: [] });
  assert.deepEqual(choreoPlan(null), { hero: -1, slots: [] });
});

console.log(`\nbeatChoreo: ${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
