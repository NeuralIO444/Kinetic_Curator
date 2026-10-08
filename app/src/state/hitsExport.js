// The ↓ HITS export's per-favorite rows (studio/hits_bridge.py reads them).
// Pure so a selfcheck covers it without the panel.
import { normalizeSeedOffsets } from '../engine/kernel/rng.js';
import { recipeFeatures } from '../curator/recipeFeatures.js';
import { sanitizeKeepContext } from '../curator/keepContext.js';

/**
 * #537 — a recipe is only deterministic with its stream offsets (#305), so a
 * hit carries them. Legacy favorites saved before #305 have none: omit the key
 * rather than invent zeros (hits_bridge treats "absent" as "the project's own").
 */
function hitRow(f) {
  const context = sanitizeKeepContext(f.context);
  return {
    seed: f.seed >>> 0,
    ...(f.seedOffsets && typeof f.seedOffsets === 'object'
      ? { seedOffsets: normalizeSeedOffsets(f.seedOffsets) } : {}),
    timestamp: f.timestamp,
    // #1140 — the keep's session context (audio/palette-warmth/dwell); legacy
    // rows omit it (hits_bridge treats "absent" as "not instrumented").
    ...(context ? { context } : {}),
    layoutParams: f.config?.layout || null,
    paletteId: f.config?.palette?.id || null,
    // #719 — the kept cast; legacy keeps omit it (hits_bridge then keeps the project's own).
    ...(Array.isArray(f.config?.assets) && f.config.assets.length ? { assets: [...f.config.assets] } : {}),
    // #719 — named features, the same function studio sidecars use for the pool.
    features: recipeFeatures({ layoutParams: f.config?.layout, paletteId: f.config?.palette?.id, assets: f.config?.assets }),
  };
}

export function hitsFromFavorites(favorites) {
  return (favorites || []).map(hitRow);
}

/**
 * #996 — the keeps ledger for hits_bridge.py bold: every keep, with a
 * `favorite` flag so Lois sees favorites as a SUBSET of keeps (1s and 0s).
 * A favorite implies a keep, so favorites ride along as keep rows — that
 * keeps legacy favorites (kept before keeps existed) in the bold set.
 * Deduped by seed; first record wins.
 */
export function keepsFromKeeps(keeps, favorites) {
  const favoriteSeeds = new Set((favorites || []).map((f) => f.seed >>> 0));
  const seen = new Set();
  const rows = [];
  const push = (k) => {
    const seed = k.seed >>> 0;
    if (seen.has(seed)) return;
    seen.add(seed);
    rows.push({ ...hitRow(k), favorite: favoriteSeeds.has(seed) });
  };
  (keeps || []).forEach(push);
  (favorites || []).forEach(push);
  return rows;
}
