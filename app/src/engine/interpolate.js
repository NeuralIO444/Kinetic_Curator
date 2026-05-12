// engine/interpolate.js — tween two state snapshots for keyframe playback.

const NUMERIC_LAYOUT_KEYS = ['count', 'jitter', 'density', 'zTiers'];
const PAIR_LAYOUT_KEYS = ['scale', 'rotate', 'alpha'];
const NUMERIC_EFFECT_KEYS = [
  'blendStrength', 'echoCount', 'echoDecay', 'trailLength',
  'feedbackStrength', 'feedbackDepth', 'particleCount', 'particleSpeed',
  'blastRadius', 'blastForce',
];

function lerp(a, b, t) { return a + (b - a) * t; }

function lerpPair(a, b, t) {
  if (!Array.isArray(a) || !Array.isArray(b)) return b;
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}

function pick(a, b, t) { return t < 0.5 ? a : b; }

/**
 * Interpolate between two snapshots (or favorite configs) at parameter t ∈ [0,1].
 * Numeric fields lerp; discrete fields (mode, paletteId, boolean toggles) switch
 * at t=0.5 so transitions remain crisp.
 */
export function interpolateSnapshots(from, to, t) {
  if (!from) return to;
  if (!to) return from;
  if (t <= 0) return from;
  if (t >= 1) return to;

  const out = { ...to };

  // Layout params
  if (from.layoutParams && to.layoutParams) {
    const lp = { ...to.layoutParams };
    for (const k of NUMERIC_LAYOUT_KEYS) {
      if (typeof from.layoutParams[k] === 'number' && typeof to.layoutParams[k] === 'number') {
        lp[k] = k === 'count' || k === 'zTiers'
          ? Math.round(lerp(from.layoutParams[k], to.layoutParams[k], t))
          : lerp(from.layoutParams[k], to.layoutParams[k], t);
      }
    }
    for (const k of PAIR_LAYOUT_KEYS) {
      if (Array.isArray(from.layoutParams[k]) && Array.isArray(to.layoutParams[k])) {
        lp[k] = lerpPair(from.layoutParams[k], to.layoutParams[k], t);
      }
    }
    // Discrete: layout mode / composition switch at midpoint
    lp.mode = pick(from.layoutParams.mode, to.layoutParams.mode, t);
    lp.composition = pick(from.layoutParams.composition, to.layoutParams.composition, t);
    out.layoutParams = lp;
  }

  // Palette switch at midpoint (sharp swap looks better than blending palettes)
  if (from.paletteId && to.paletteId) {
    out.paletteId = pick(from.paletteId, to.paletteId, t);
  }

  // Seed: linear lerp produces interesting drift; integer
  if (typeof from.seed === 'number' && typeof to.seed === 'number') {
    out.seed = Math.round(lerp(from.seed, to.seed, t));
  }

  // Effect numerics
  for (const k of NUMERIC_EFFECT_KEYS) {
    if (typeof from[k] === 'number' && typeof to[k] === 'number') {
      out[k] = k === 'echoCount' || k === 'trailLength' || k === 'feedbackDepth' || k === 'particleCount'
        ? Math.round(lerp(from[k], to[k], t))
        : lerp(from[k], to[k], t);
    }
  }

  return out;
}

/**
 * Convert a favorite into a state-shaped snapshot the interpolator understands.
 * Prefers the full `snapshot` field added in the v2 favorite shape; falls back
 * to the legacy `{ seed, config: { layout, palette } }` projection so old
 * favorites still recall (with effect-state simply absent).
 */
export function favoriteToSnapshot(fav) {
  if (!fav) return null;
  if (fav.snapshot) return fav.snapshot;
  return {
    seed: fav.seed,
    paletteId: fav.config?.palette?.id,
    layoutParams: fav.config?.layout,
  };
}
