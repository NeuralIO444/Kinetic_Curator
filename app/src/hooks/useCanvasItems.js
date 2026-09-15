// useCanvasItems — thin React wrapper around pure buildPlacements (#32).
// Live path passes audio/life-modulated scale + alpha; final render will call
// buildPlacements directly with layoutParams ranges and lifted caps.

import { useMemo } from 'react';
import { buildPlacements } from '../engine/buildPlacements.js';

// Re-export for existing selfcheck / callers
export { pickWeighted, SELECTION_WEIGHT } from '../engine/buildPlacements.js';

export function useCanvasItems({
  layoutParams,
  seed,
  activeAssets,
  palette,
  caGrid,
  // NOTE: callers still pass safeCount; it is deliberately unused here
  // because buildPlacements clamps count from caps itself.
  effectiveScale,
  effectiveAlpha,
  canvasW,
  canvasH,
  caps,
}) {
  const { preset, items } = useMemo(
    () =>
      buildPlacements({
        layoutParams,
        seed,
        activeAssets,
        palette,
        caGrid,
        caps,
        canvasW,
        canvasH,
        scale: effectiveScale,
        alpha: effectiveAlpha,
      }),
    [
      layoutParams,
      seed,
      activeAssets,
      palette,
      caGrid,
      caps,
      canvasW,
      canvasH,
      effectiveScale,
      effectiveAlpha,
    ],
  );

  return { preset, items };
}
