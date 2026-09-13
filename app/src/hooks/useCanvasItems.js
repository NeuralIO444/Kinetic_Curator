// useCanvasItems — static placement + color mapping + mirror for non-swarm modes

import { useMemo } from 'react';
import { computePlacements } from '../engine/placement.js';
import { colorForPlacement } from '../engine/color.js';
import { mkRng } from '../engine/prng.js';
import { getPreset } from '../data/presets.js';

export function useCanvasItems({ layoutParams, seed, activeAssets, palette, caGrid, safeCount, effectiveScale, effectiveAlpha, canvasW, canvasH, caps }) {
  const preset = getPreset(layoutParams.composition);

  const placements = useMemo(() => {
    if (activeAssets.length === 0) return [];
    return computePlacements({
      mode: layoutParams.mode,
      count: safeCount,
      seed,
      scale: effectiveScale,
      rotate: layoutParams.rotate,
      alpha: effectiveAlpha,
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
  }, [activeAssets.length, layoutParams, seed, canvasW, canvasH, caGrid, safeCount, effectiveScale, effectiveAlpha]);

  const items = useMemo(() => {
    const rng = mkRng(seed + 1);
    let mapped = placements.map((p, i) => {
      const asset = activeAssets[i % activeAssets.length];
      const color = colorForPlacement({
        swatches: palette.swatches,
        strategy: preset.paletteShift || 'band',
        t: p.t,
        index: p.index,
        rng: () => rng(),
      });
      const accent = palette.swatches[(palette.swatches.indexOf(color) + 3) % palette.swatches.length] || palette.swatches[0];
      return { ...p, assetId: asset.id, color, accent };
    });

    if (!layoutParams.overlap) mapped = [...mapped].sort((a, b) => a.scale - b.scale);

    if (layoutParams.mirror && caps.allowMirror) {
      const mirrored = mapped.map(item => ({ ...item, x: canvasW - item.x, _mirrored: true }));
      mapped = [...mapped, ...mirrored];
    }

    return mapped;
  }, [placements, activeAssets, palette.swatches, preset.paletteShift, seed, layoutParams.overlap, layoutParams.mirror, canvasW, caps.allowMirror]);

  return { preset, items };
}
