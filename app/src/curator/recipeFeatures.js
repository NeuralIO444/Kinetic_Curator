// recipeFeatures — #719: named features for a kept (or passed) composition.
//
// The taste model only ever saw pixels. This gives it WHY: a small, named,
// categorical description of the recipe (fxhash-style "features"), computed by
// ONE pure function so every side of the ledger agrees —
//   keeps:  the ↓ HITS export rows (state/hitsExport.js)
//   passes: studio sidecars, via `render.mjs --emit-normalized` (studio.py)
// A feature a keep has but a pass lacks teaches nothing, so both call this.
//
// Recipe-level and seed-independent on purpose: features name the choices a
// performer made (system, symmetry, palette, cast, density), not what the seed
// happened to draw. Bump FEATURES_VERSION whenever a key or bucket edge changes
// — the model must never mix two definitions under one name.
import { ASSETS } from '../data/assets/index.js';
import { normalizeLayoutParams } from '../data/layout-modes.js';

export const FEATURES_VERSION = 1;

const CATEGORY_BY_ID = new Map(ASSETS.map((a) => [a.id, a.category]));
const LIVE_MODES = new Set(['swarm', 'hype', 'murmuration']);

const bucket = (v, edges, names) => {
  for (let i = 0; i < edges.length; i++) if (v < edges[i]) return names[i];
  return names[names.length - 1];
};

/**
 * @param {{ layoutParams?: object, paletteId?: string, assets?: string[]|null }} recipe
 *   assets: the enabled cast ids; absent/null = the whole library ('all').
 * @returns {object} flat, JSON-safe, deterministic
 */
export function recipeFeatures({ layoutParams, paletteId, assets } = {}) {
  const p = normalizeLayoutParams(layoutParams && typeof layoutParams === 'object' ? layoutParams : {});
  const bodies = LIVE_MODES.has(p.mode) ? p.particleCount : p.count;
  const [s0, s1] = Array.isArray(p.scale) ? p.scale : [1, 1];
  const cast = Array.isArray(assets) && assets.length
    ? [...new Set(assets.filter((x) => typeof x === 'string'))].sort()
    : null;
  return {
    v: FEATURES_VERSION,
    system: p.mode,
    symmetry: p.symmetry,
    behave: p.behave,
    blend: p.blendMode,
    paletteShift: p.paletteShift,
    palette: typeof paletteId === 'string' && paletteId ? paletteId : null,
    accum: !!p.accumulation,
    mirror: !!p.mirror,
    bleed: !!p.bleed,
    overlap: !!p.overlap,
    bodies: bucket(bodies, [60, 200], ['sparse', 'mid', 'dense']),
    density: bucket(p.density, [40, 75], ['low', 'mid', 'high']),
    scale: bucket((s0 + s1) / 2, [0.8, 1.5], ['small', 'medium', 'large']),
    cast,
    castSize: cast ? cast.length : null,
    castCategories: cast
      ? [...new Set(cast.map((id) => CATEGORY_BY_ID.get(id) || (id.startsWith('user:') ? 'user' : 'unknown')))].sort()
      : null,
  };
}
