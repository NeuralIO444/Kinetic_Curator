// node src/state/rollPool.selfcheck.mjs
// #1767 (KINETIC variety S1): KINETIC deals from the whole library. Over N rolls every family turns up within a
// bounded number of rolls and >200 unique assets are reachable (was 49 of 295); the pool keeps the old size; the
// creature citizen is never dealt; a store roll lands a known, mixed pool in one undo step.
import assert from 'node:assert/strict';
import { ASSETS } from '../data/assets/index.js';
import { FAMILIES } from '../data/assetStyle.js';
import { SHAPE_SETS } from '../data/voices.js';
import { mkRng } from '../engine/prng.js';
import { dealableRecords, dealMixedPool, dealPoolFor, poolToEnabled, POOL_MIN, POOL_MAX } from './rollPool.mjs';

const records = dealableRecords(ASSETS);
const rng = mkRng(1767);

// 1. the old ceiling, measured: the 19 curated 4-shape sets reach 49 assets (#1771 later widened the layout-tile
//    chips to 8 shapes — 92 — still a fraction of the library; the pre-#1767 deal was the 4-shape slice)
const setReach = new Set(SHAPE_SETS.flatMap((s) => s.ids.slice(0, 4)));
assert.ok(setReach.size < 60, `the old deck: ${setReach.size} assets`);

// 2. every library family is dealt within a bounded number of rolls, and >200 unique assets become reachable
const libFamilies = FAMILIES.filter((f) => f !== 'imported' && f !== 'creature');
const seenFam = new Set();
let rollsToAllFamilies = 0;
const seen = new Set();
for (let i = 1; i <= 800; i++) {
  const { ids, families } = dealMixedPool(records, rng);
  assert.ok(ids.length >= POOL_MIN && ids.length <= POOL_MAX, `pool size ${ids.length} in ${POOL_MIN}..${POOL_MAX}`);
  assert.ok(families.length >= 2 && families.length <= 3);
  assert.ok(!ids.includes('creature'), 'the creature citizen is never dealt');
  for (const f of families) seenFam.add(f);
  if (!rollsToAllFamilies && libFamilies.every((f) => seenFam.has(f))) rollsToAllFamilies = i;
  for (const id of ids) seen.add(id);
}
assert.ok(
  rollsToAllFamilies > 0 && rollsToAllFamilies <= 40,
  `all ${libFamilies.length} families within ${rollsToAllFamilies} rolls`,
);
assert.ok(seen.size > 200, `${seen.size} unique assets reachable in 800 rolls (was ${setReach.size})`);

// 3. a mixed pool really mixes: its assets span more than one family
const once = dealMixedPool(records, mkRng(7));
const famOf = new Map(records.map((r) => [r.id, r.family]));
assert.ok(new Set(once.ids.map((id) => famOf.get(id))).size >= 2);

// 4. deterministic for a given stream (the store passes its honest die; replay comes from the stored pool, #710)
assert.deepEqual(dealMixedPool(records, mkRng(42)), dealMixedPool(records, mkRng(42)));

// 5. the coherent variant (S6's look pass): a pairing pulls a matching pool; a pairing with nothing to deal falls back
const coh = dealPoolFor(records, mkRng(3), { categories: ['floral', 'organic'], styles: ['japanese'] });
assert.ok(coh.coherent && coh.ids.length >= POOL_MIN);
const recOf = new Map(records.map((r) => [r.id, r]));
assert.ok(coh.ids.every((id) => ['floral', 'organic'].includes(recOf.get(id).category)));
const none = dealPoolFor(records, mkRng(3), { categories: ['no-such-category'] });
assert.ok(!none.coherent && none.ids.length >= POOL_MIN, 'an empty pairing still deals a pool');

// 6. imports join the deal
const withImport = dealableRecords(ASSETS, [{ id: 'user:koi', category: 'floral', tags: ['flower'] }]);
assert.ok(withImport.some((r) => r.id === 'user:koi' && r.family === 'imported'));
assert.deepEqual(poolToEnabled(['a', 'b']), { a: true, b: true });

// 7. the store: a chaos roll lands a known, mixed pool (one undo step is pinned by kineticRoll.selfcheck)
const { useStore } = await import('./store.js');
const known = new Set(ASSETS.map((a) => a.id));
const storeSeen = new Set();
for (let i = 0; i < 30; i++) {
  useStore.getState().kineticRoll();
  const on = Object.keys(useStore.getState().enabledAssets).filter((k) => useStore.getState().enabledAssets[k]);
  assert.ok(on.length >= POOL_MIN && on.every((id) => known.has(id)) && !on.includes('creature'));
  for (const id of on) storeSeen.add(id);
}
assert.ok(
  storeSeen.size > 60,
  `30 store rolls already reach ${storeSeen.size} assets (the old deck's ceiling was ${setReach.size})`,
);

console.log(
  `rollPool.selfcheck: ok (#1767 — all families in ${rollsToAllFamilies} rolls, ${seen.size} assets reachable, was ${setReach.size})`,
);
