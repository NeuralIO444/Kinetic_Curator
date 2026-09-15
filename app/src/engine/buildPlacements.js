// Pure placement + asset + color + mirror pipeline.
// Shared by live preview (useCanvasItems) and renderFinal (#24 / #32).
// Kernel K0: asset + color channels index-stable (#58).

import { computePlacements } from './placement.js';
import { colorForPlacement } from './color.js';
import { mkRng } from './prng.js';
import { getPreset } from '../data/presets.js';
import { getQualityCaps } from '../data/quality.js';
import {
  pickWeightedIndexStable,
  colorRngForIndex,
} from './kernel/rng.js';

/** Authored per-asset weight → selection frequency. */
export const SELECTION_WEIGHT = { heavy: 4, medium: 2, light: 1 };

/**
 * Seeded weighted pick from an asset list (sequential stream — tests / legacy).
 * Prefer pickWeightedIndexStable for pipeline.
 */
export function pickWeighted(assets, weights, totalWeight, rng) {
  let r = rng() * totalWeight;
  for (let i = 0; i < assets.length; i++) {
    r -= weights[i];
    if (r <= 0) return assets[i];
  }
  return assets[assets.length - 1];
}

export function clampCount(count, mirror, caps) {
  const maxForMirror = mirror
    ? (caps.maxCountMirrored ?? caps.maxCount ?? 420)
    : (caps.maxCount ?? 420);
  return Math.min(Math.max(1, Number(count) || 1), maxForMirror);
}

/**
 * Build fully attributed items for the canvas (or offline render).
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

  const weights = activeAssets.map((a) => SELECTION_WEIGHT[a.weight] || 1);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  let mapped = placements.map((p) => {
    const asset = pickWeightedIndexStable(
      activeAssets, weights, totalWeight, seed, p.index,
    );
    const color = colorForPlacement({
      swatches: palette.swatches,
      strategy: preset.paletteShift || 'band',
      t: p.t,
      index: p.index,
      rng: colorRngForIndex(seed, p.index),
    });
    const accent =
      palette.swatches[(palette.swatches.indexOf(color) + 3) % palette.swatches.length] ||
      palette.swatches[0];
    const key = `p${p.index}-${asset.id}`;
    return { ...p, assetId: asset.id, color, accent, key };
  });

  if (!layoutParams.overlap) {
    mapped = [...mapped].sort((a, b) => a.scale - b.scale);
  }

  if (mirror && caps.allowMirror) {
    const mirrored = mapped.map((item) => ({
      ...item,
      x: canvasW - item.x,
      _mirrored: true,
      key: `${item.key}-m`,
    }));
    mapped = [...mapped, ...mirrored];
  }

  return { preset, items: mapped, safeCount };
}

// Re-export for tests that still use sequential streams
export { mkRng };
