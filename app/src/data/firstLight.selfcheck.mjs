// node src/data/firstLight.selfcheck.mjs
// #707 — the living boot only ever rolls tasteful, valid setups.
import assert from 'node:assert';
import { getFirstLightPresets, rollLivingBoot } from './firstLight.js';
import { validateLayoutParams } from './layout-modes.js';

// Tiny seeded rng so the test is deterministic.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
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
  assert.ok(roll.assetIds.length === 2 || roll.assetIds.length === 3, `2–3 assets, got ${roll.assetIds.length}`);
  assert.strictEqual(new Set(roll.assetIds).size, roll.assetIds.length, 'assets unique');
}

// ── Audit fix 3f — rollLivingBoot's no-random path is deterministic ─────────
// rollLivingBoot defaulted random = Math.random (measured pre-fix: 24
// distinct boots over 200 no-arg calls). It has no production caller —
// only this suite — so a missing/non-function random now rolls 0: the
// deterministic first light (first starter preset, its first assets).
// If the living boot is wired later it must pass a stream or accept
// this roll.
{
  const a = rollLivingBoot();
  const b = rollLivingBoot();
  assert.deepStrictEqual(a, b, 'no-random rollLivingBoot must be deterministic');
  assert.deepStrictEqual(rollLivingBoot(undefined), a, 'undefined random = the roll-0 stream');
  assert.deepStrictEqual(rollLivingBoot(42), a, 'non-function random = the roll-0 stream');
  assert.deepStrictEqual(
    rollLivingBoot(() => 0),
    a,
    'explicit zero stream matches',
  );
  const starters = getFirstLightPresets();
  assert.strictEqual(a.preset.id, starters[0].id, 'roll-0 boot deals the first starter');
}

console.log('[firstlight] ok — 4 starters, 200 seeded rolls all bounded');
