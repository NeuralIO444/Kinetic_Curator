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
// happened to draw. Bump FEATURES_VERSION whenever a key or bucket edge changes,
// or when the keep record schema changes (#1140: session context) — the model
// must never mix two definitions under one name, and the trainer must never mix
// instrumented keeps with uninstrumented ones under one version.
import { ASSETS } from '../data/assets/index.js';
import { normalizeLayoutParams, PARAM_SPEC } from '../data/layout-modes.js';
import { RANDOMIZABLE_KEYS } from '../state/paramUtils.js';

// v2 (#762): + `num`, the continuous layout keys CURATE actually varies,
// normalized 0–1 — the buckets alone are too coarse to tell 8 candidates apart.
// v3 (#1140): keep records carry session context (audio/palette-warmth/dwell);
// the feature keys are unchanged, but training data is now instrumented.
export const FEATURES_VERSION = 3;

// The three pair params have no PARAM_SPEC range; these bounds are the dice's
// own (state/paramUtils.js randomizeKey), so 0–1 spans what CURATE can roll.
const PAIR_NUMS = {
  scale: (v) => ['scaleMid', ((v[0] + v[1]) / 2 - 0.1) / (3.0 - 0.1)],
  rotate: (v) => ['rotateSpread', (v[1] - v[0]) / 360],
  alpha: (v) => ['alphaMid', ((v[0] + v[1]) / 2) / 100],
};
const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/** The continuous CURATE keys, normalized 0–1 (fixed key order, 4-decimal). */
export function recipeNumerics(p) {
  const out = {};
  for (const k of RANDOMIZABLE_KEYS) {
    const v = p[k];
    if (PAIR_NUMS[k]) {
      const pair = Array.isArray(v) && v.length === 2 ? v.map(Number) : [0, 0];
      const [name, x] = PAIR_NUMS[k](pair);
      out[name] = +clamp01(x).toFixed(4);
      continue;
    }
    const s = PARAM_SPEC[k];
    out[k] = s ? +clamp01((Number(v) - s.min) / (s.max - s.min)).toFixed(4) : 0;
  }
  return out;
}

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
  // #1202 — scale is {x, y} now; the feature reads the X range (linked =
  // today's behavior). A legacy array still works.
  const scalePair = Array.isArray(p.scale) ? p.scale : (p.scale?.x ?? [1, 1]);
  const [s0, s1] = scalePair;
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
    // #1202 — mirror is a 4-state enum; a legacy boolean still reads (true → on).
    mirror: p.mirror === true || (typeof p.mirror === 'string' && p.mirror !== 'off'),
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
    num: recipeNumerics(p),
  };
}
