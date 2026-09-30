// The ↓ HITS export's per-favorite rows (studio/hits_bridge.py reads them).
// Pure so a selfcheck covers it without the panel.
import { normalizeSeedOffsets } from '../engine/kernel/rng.js';
import { recipeFeatures } from '../curator/recipeFeatures.js';

/**
 * #537 — a recipe is only deterministic with its stream offsets (#305), so a
 * hit carries them. Legacy favorites saved before #305 have none: omit the key
 * rather than invent zeros (hits_bridge treats "absent" as "the project's own").
 */
export function hitsFromFavorites(favorites) {
  return (favorites || []).map((f) => ({
    seed: f.seed >>> 0,
    ...(f.seedOffsets && typeof f.seedOffsets === 'object'
      ? { seedOffsets: normalizeSeedOffsets(f.seedOffsets) } : {}),
    timestamp: f.timestamp,
    layoutParams: f.config?.layout || null,
    paletteId: f.config?.palette?.id || null,
    // #719 — the kept cast; legacy keeps omit it (hits_bridge then keeps the project's own).
    ...(Array.isArray(f.config?.assets) && f.config.assets.length ? { assets: [...f.config.assets] } : {}),
    // #719 — named features, the same function studio sidecars use for the pool.
    features: recipeFeatures({ layoutParams: f.config?.layout, paletteId: f.config?.palette?.id, assets: f.config?.assets }),
  }));
}
