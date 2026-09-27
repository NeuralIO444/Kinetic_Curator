// Living boot (#707) — the instrument wakes up playing, never blank.
//
// rollLivingBoot picks one of the First Light starter presets at random,
// takes its curated palette, and draws 2–3 assets from its small pool.
// Everything is curated, not dice-roll: the randomness only chooses
// *which* tasteful setup you get, so a fresh boot can never strobe,
// muddy out, or explode into nodes.
import { COMPOSITION_PRESETS } from './presets.js';
import { ASSETS } from './assets/index.js';
import { PALETTES } from './palettes.js';

export const FIRSTLIGHT_GROUP = 'firstlight';

const ASSET_IDS = new Set(ASSETS.map((a) => a.id));
const PALETTE_IDS = new Set(PALETTES.map((p) => p.id));

export function getFirstLightPresets() {
  return COMPOSITION_PRESETS.filter((p) => p.group === FIRSTLIGHT_GROUP);
}

/**
 * @param {() => number} random — injectable for tests; defaults to Math.random
 * @returns {{ preset, paletteId, assetIds }} — 2 or 3 asset ids, all valid
 */
export function rollLivingBoot(random = Math.random) {
  const starters = getFirstLightPresets();
  if (!starters.length) throw new Error('[firstlight] no starter presets registered');
  const preset = starters[Math.floor(random() * starters.length) % starters.length];

  const paletteId = PALETTE_IDS.has(preset.paletteId) ? preset.paletteId : 'praystation';

  const pool = (preset.assetIds || []).filter((id) => ASSET_IDS.has(id));
  const want = 2 + (random() < 0.5 ? 1 : 0);
  const assetIds = [];
  const rest = [...pool];
  while (assetIds.length < Math.min(want, rest.length)) {
    assetIds.push(rest.splice(Math.floor(random() * rest.length), 1)[0]);
  }
  // Safety net: a preset with an empty pool still boots with *something*.
  if (!assetIds.length) assetIds.push('org_blob_01');

  return { preset, paletteId, assetIds };
}
