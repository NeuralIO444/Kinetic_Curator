// Pure placement + asset + color + mirror pipeline.
// Shared by live preview (useCanvasItems) and renderFinal (#24 / #32).
// Kernel K0: asset + color channels index-stable (#58).

import { computePlacementsSoA } from './placement.js';
import { assignColor, resolveStrategy } from './kernel/color/index.js';
import { mkRng } from './prng.js';
import { getPreset } from '../data/presets.js';
import { getQualityCaps } from '../data/quality.js';
import {
  pickWeightedIndexStable,
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

  // Kernel v2 (#108) step 2: read columns and build the item object once,
  // instead of computePlacements building one object per point and this
  // spreading it into a second one.
  const soa = computePlacementsSoA({
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

  const strategy = resolveStrategy(layoutParams, preset);
  let mapped = new Array(soa.n);
  for (let k = 0; k < soa.n; k++) {
    const index = soa.index[k];
    const t = soa.t[k];
    const asset = pickWeightedIndexStable(
      activeAssets, weights, totalWeight, seed, index,
    );
    // K5 (#64): colour comes from the kernel's colour channel only.
    const { color, accent } = assignColor({ seed, index, t }, palette, strategy);
    mapped[k] = {
      x: soa.x[k],
      y: soa.y[k],
      scale: soa.scale[k],
      rotation: soa.rotation[k],
      alpha: soa.alpha[k],
      index,
      t,
      zTier: soa.zTier[k],
      assetId: asset.id,
      color,
      accent,
      key: `p${index}-${asset.id}`,
    };
  }

  if (!layoutParams.overlap) {
    // `mapped` is already a fresh array we own — no defensive copy needed.
    mapped.sort((a, b) => a.scale - b.scale);
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
