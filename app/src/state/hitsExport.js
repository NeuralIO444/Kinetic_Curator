// The ↓ HITS export's per-favorite rows (studio/hits_bridge.py reads them).
// Pure so a selfcheck covers it without the panel.
import { normalizeSeedOffsets } from '../engine/kernel/rng.js';

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
  }));
}
