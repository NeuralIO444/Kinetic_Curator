// node src/curator/diceCrowns.selfcheck.mjs
//
// #1645 — the crown log's shed counter. The log is capped training
// data; what the cap sheds is now totalled in a sibling key, shown by
// the census readout, and pinned here: cap trims count, unreadable
// stored crowns count when the write path passes them, the list's own
// stored shape never changes, and the count survives a reload.
import assert from 'node:assert';
import {
  DICE_CROWNS_KEY,
  DICE_CROWNS_MAX,
  DICE_CROWNS_SHED_KEY,
  readCrowns,
  readCrownsCounted,
  readCrownShed,
  recordCrown,
} from './diceCrowns.js';

let checks = 0;
const ok = (name) => {
  checks += 1;
  console.log(`  [ok] ${name}`);
};
const store = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), map: m };
};
const crown = (i) => ({ ts: 1000 + i, layoutId: `layout-${i}`, assetIds: [`asset-${i}`], davisCode: null });

// ── a fresh log sheds nothing and writes no counter ──
{
  const s = store();
  recordCrown(crown(1), s);
  recordCrown(crown(2), s);
  assert.equal(readCrowns(s).length, 2);
  assert.equal(readCrownShed(s), 0, 'no trims yet');
  assert.equal(s.map.has(DICE_CROWNS_SHED_KEY), false, 'the counter key appears only when something sheds');
  ok('under the cap: no sheds, no counter key');
}

// ── the cap's trims are totalled, and the list stays a bare array ──
{
  const s = store();
  for (let i = 0; i < DICE_CROWNS_MAX + 5; i++) recordCrown(crown(i), s);
  assert.equal(readCrowns(s).length, DICE_CROWNS_MAX, 'the cap still holds');
  assert.equal(readCrownShed(s), 5, 'five crowns shed past the cap, counted');
  assert.ok(
    Array.isArray(JSON.parse(s.map.get(DICE_CROWNS_KEY))),
    'the stored list is still a bare array — no migration of the training data',
  );
  assert.equal(readCrowns(s)[0].layoutId, 'layout-5', 'the oldest five are the ones that went');
  ok('cap trims increment the persisted shed counter');
}

// ── stored crowns that no longer read count when the log rewrites ──
{
  const s = store();
  s.setItem(DICE_CROWNS_KEY, JSON.stringify([crown(1), { nope: true }, { layoutId: '', assetIds: ['x'] }, crown(2)]));
  const counted = readCrownsCounted(s);
  assert.equal(counted.crowns.length, 2);
  assert.equal(counted.dropped, 2, 'the counted read names what it left behind');
  assert.equal(readCrownShed(s), 0, 'a read alone sheds nothing — the entries are still stored');
  recordCrown(crown(3), s);
  assert.equal(readCrownShed(s), 2, 'the rewrite that drops them is what counts them');
  assert.deepEqual(
    readCrowns(s).map((c) => c.layoutId),
    ['layout-1', 'layout-2', 'layout-3'],
  );
  // an unsanitizable crown is refused without touching the count
  const before = readCrownShed(s);
  assert.equal(recordCrown({ layoutId: '', assetIds: [] }, s).length, 3);
  assert.equal(readCrownShed(s), before, 'a refused crown sheds nothing');
  ok('unreadable stored crowns are counted at the rewrite, never at a read');
}

// ── the counter survives a reload and keeps counting ──
{
  const s = store();
  for (let i = 0; i < DICE_CROWNS_MAX + 2; i++) recordCrown(crown(i), s);
  assert.equal(readCrownShed(s), 2);
  recordCrown(crown(999), s); // a "later session": same storage, fresh module state would read the key
  assert.equal(readCrownShed(s), 3, 'the total is read from storage, not memory');
  assert.equal(JSON.parse(s.map.get(DICE_CROWNS_SHED_KEY)), 3);
  ok('the shed total persists and accumulates across sessions');
}

console.log(`diceCrowns.selfcheck: ${checks} checks passed`);
