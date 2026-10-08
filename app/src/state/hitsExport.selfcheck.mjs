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
// #719 — the kept cast rides along; legacy rows omit it (hits_bridge keeps the project's own)
{
  const [withCast, legacy] = hitsFromFavorites([
    { seed: 1, config: { layout: {}, palette: { id: 'x' }, assets: ['xsh01', 'xsh07'] } },
    { seed: 2, config: { layout: {}, palette: { id: 'x' } } },
  ]);
  assert.deepStrictEqual(withCast.assets, ['xsh01', 'xsh07']);
  assert.ok(!('assets' in legacy), 'legacy row: no cast key');
}
// #1140 — session context rides the hit rows; legacy rows omit it
{
  const [withCtx, legacy] = hitsFromFavorites([
    { seed: 11, timestamp: 't', config: { layout: {}, palette: { id: 'x' } },
      context: { audio: 0.62, paletteWarmth: 0.7, dwellMs: 4500 } },
    { seed: 12, timestamp: 't', config: { layout: {}, palette: { id: 'x' } } },
  ]);
  assert.deepStrictEqual(withCtx.context, { audio: 0.62, paletteWarmth: 0.7, dwellMs: 4500 });
  assert.ok(!('context' in legacy), 'legacy row: no context key');
  // hostile context normalizes on the way out too
  const [h] = hitsFromFavorites([
    { seed: 13, timestamp: 't', config: {}, context: { audio: 'x', dwellMs: -1 } },
  ]);
  assert.strictEqual(h.context.audio, null);
  assert.strictEqual(h.context.dwellMs, 0);
}
console.log('hitsExport.selfcheck: OK');
