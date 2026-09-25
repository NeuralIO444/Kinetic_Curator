// node src/state/hitsExport.selfcheck.mjs — #537: hits rows carry seedOffsets.
import assert from 'node:assert';
import { hitsFromFavorites } from './hitsExport.js';
import { SEED_OFFSET_GROUPS } from '../engine/kernel/rng.js';

const G = SEED_OFFSET_GROUPS[0];
const rows = hitsFromFavorites([
  { seed: 7, seedOffsets: { [G]: 42 }, timestamp: '12:00:00', config: { layout: { mode: 'grid' }, palette: { id: 'bone' } } },
  { seed: 8, timestamp: '12:01:00', config: { layout: { mode: 'scatter' }, palette: { id: 'ink' } } }, // legacy: no offsets
  { seed: -1, seedOffsets: { [G]: 'junk' }, config: {} },
]);
assert.strictEqual(rows.length, 3);
assert.strictEqual(rows[0].seedOffsets[G], 42, 'offsets ride along');
assert.deepStrictEqual(Object.keys(rows[0].seedOffsets).sort(), [...SEED_OFFSET_GROUPS].sort(), 'normalized to all groups');
assert.ok(!('seedOffsets' in rows[1]), 'legacy favorite: key omitted, not invented');
assert.strictEqual(rows[2].seed, 0xffffffff, 'seed stays uint32');
assert.strictEqual(rows[2].seedOffsets[G], 0, 'junk offset values normalize to 0');
assert.deepStrictEqual(rows[0].layoutParams, { mode: 'grid' });
assert.strictEqual(rows[0].paletteId, 'bone');
assert.strictEqual(rows[2].layoutParams, null);
assert.deepStrictEqual(hitsFromFavorites(undefined), []);
console.log('hitsExport.selfcheck: OK');
