// Pure placement + asset + color + mirror pipeline.
// Shared by live preview (useCanvasItems) and future renderFinal (#24 / #32).
// No React, no store — deterministic given the same inputs.

import { computePlacements } from './placement.js';
import { colorForPlacement } from './color.js';
import { mkRng } from './prng.js';
import { getPreset } from '../data/presets.js';
import { getQualityCaps } from '../data/quality.js';

/** Authored per-asset weight → selection frequency. */
export const SELECTION_WEIGHT = { heavy: 4, medium: 2, light: 1 };

/**
 * Seeded weighted pick from an asset list.
 * @param {Array<{ id: string, weight?: string }>} assets
 * @param {number[]} weights
 * @param {number} totalWeight
 * @param {() => number} rng
 */
export function pickWeighted(assets, weights, totalWeight, rng) {
  let r = rng() * totalWeight;
  for (let i = 0; i < assets.length; i++) {
    r -= weights[i];
    if (r <= 0) return assets[i];
  }
  return assets[assets.length - 1];
}

/**
 * Clamp requested count against quality caps (and mirror budget).
 * @param {number} count
 * @param {boolean} mirror
 * @param {{ maxCount?: number, maxCountMirrored?: number }} caps
 */
export function clampCount(count, mirror, caps) {
  const maxForMirror = mirror
    ? (caps.maxCountMirrored ?? caps.maxCount ?? 420)
    : (caps.maxCount ?? 420);
  return Math.min(Math.max(1, Number(count) || 1), maxForMirror);
}

/**
 * Build fully attributed items for the canvas (or offline render).
 *
 * @param {object} opts
 * @param {object} opts.layoutParams
 * @param {number} opts.seed
 * @param {Array}  opts.activeAssets - enabled asset objects
 * @param {{ swatches: string[] }} opts.palette
 * @param {object|null} [opts.caGrid]
 * @param {object} [opts.caps] - quality caps; defaults to balanced
 * @param {number} opts.canvasW
 * @param {number} opts.canvasH
 * @param {[number, number]} [opts.scale] - override scale range (live audio/life)
 * @param {[number, number]} [opts.alpha] - override alpha range (live audio/life)
 * @returns {{ preset: object, items: object[], safeCount: number }}
 */
export function buildPlacements({
  layoutParams,
  seed,
  activeAssets,
  palette,
  caGrid = null,
  caps: capsIn,
  canvasW,
  canvasH,
  scale: scaleOverride,
  alpha: alphaOverride,
}) {
  const caps = capsIn || getQualityCaps('balanced');
  const preset = getPreset(layoutParams.composition);

  if (!activeAssets || activeAssets.length === 0) {
    return { preset, items: [], safeCount: 0 };
  }

  const mirror = !!layoutParams.mirror;
  const safeCount = clampCount(layoutParams.count, mirror, caps);
  const scale = scaleOverride ?? layoutParams.scale;
  const alpha = alphaOverride ?? layoutParams.alpha;

  const placements = computePlacements({
    mode: layoutParams.mode,
    count: safeCount,
    seed,
    scale,
    rotate: layoutParams.rotate,
    alpha,
    jitter: layoutParams.jitter,
    density: layoutParams.density,
    zTiers: layoutParams.zTiers,
    bleed: layoutParams.bleed,
    canvasW,
    canvasH,
    caGrid: layoutParams.mode === 'ca' ? caGrid : null,
    displacement: layoutParams.displacement,
    noiseFreq: layoutParams.noiseFreq,
    noiseSpeed: layoutParams.noiseSpeed,
  });

  const rng = mkRng(seed + 1);
  const weights = activeAssets.map((a) => SELECTION_WEIGHT[a.weight] || 1);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  let mapped = placements.map((p) => {
    const asset = pickWeighted(activeAssets, weights, totalWeight, rng);
    const color = colorForPlacement({
      swatches: palette.swatches,
      strategy: preset.paletteShift || 'band',
      t: p.t,
      index: p.index,
      rng: () => rng(),
    });
    const accent =
      palette.swatches[(palette.swatches.indexOf(color) + 3) % palette.swatches.length] ||
      palette.swatches[0];
    return { ...p, assetId: asset.id, color, accent };
  });

  if (!layoutParams.overlap) {
    mapped = [...mapped].sort((a, b) => a.scale - b.scale);
  }

  if (mirror && caps.allowMirror) {
    const mirrored = mapped.map((item) => ({
      ...item,
      x: canvasW - item.x,
      _mirrored: true,
    }));
    mapped = [...mapped, ...mirrored];
  }

  return { preset, items: mapped, safeCount };
}
