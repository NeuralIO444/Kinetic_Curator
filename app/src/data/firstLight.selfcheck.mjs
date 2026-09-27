// node src/data/firstLight.selfcheck.mjs
// #707 — the living boot only ever rolls tasteful, valid setups.
import assert from 'node:assert';
import { getFirstLightPresets, rollLivingBoot } from './firstLight.js';
import { validateLayoutParams } from './layout-modes.js';

// Tiny seeded rng so the test is deterministic.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const starters = getFirstLightPresets();
assert.strictEqual(starters.length, 4, 'four First Light starter presets');
assert.strictEqual(new Set(starters.map((p) => p.id)).size, 4, 'starter ids unique');

for (const p of starters) {
  assert.ok(p.paletteId, `${p.id} carries a palette`);
  assert.ok(Array.isArray(p.assetIds) && p.assetIds.length >= 2, `${p.id} carries 2+ assets`);
  // Bounded params: every starter must validate clean — no rejections, so a
  // fresh boot can never land out-of-range (no strobing, no node explosions).
  const { rejected } = validateLayoutParams({ ...p.params, composition: p.id });
  assert.deepStrictEqual(rejected, [], `${p.id} params validate clean`);
}

// 200 seeded rolls: always 2–3 unique valid assets, valid palette + preset.
for (let i = 0; i < 200; i++) {
  const roll = rollLivingBoot(mulberry32(0x707 + i));
  assert.ok(['first-light', 'grid-talk', 'pond', 'paper-storm'].includes(roll.preset.id));
  assert.ok(roll.paletteId, 'palette set');
  assert.ok(roll.assetIds.length === 2 || roll.assetIds.length === 3,
    `2–3 assets, got ${roll.assetIds.length}`);
  assert.strictEqual(new Set(roll.assetIds).size, roll.assetIds.length, 'assets unique');
}

console.log('[firstlight] ok — 4 starters, 200 seeded rolls all bounded');
