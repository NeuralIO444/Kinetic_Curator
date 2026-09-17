// useCanvasItems — thin React wrapper around pure buildPlacements (#32).
// Live path passes audio/life-modulated scale + alpha; final render will call
// buildPlacements directly with layoutParams ranges and lifted caps.

import { useMemo, useState } from 'react';
import { buildPlacements } from '../engine/buildPlacements.js';
import { timeStage } from './useFpsMeter.js';

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
  // Kernel v2 (#108) step 4. One cache per hook instance, so each <Layer />
  // gets its own — a module-level cache would thrash between layers, which
  // is exactly the case the multi-layer work introduced.
  //
  // useState with a lazy initializer, not useRef: this is read during render,
  // which react-hooks/refs correctly forbids for refs. The setter is never
  // called — useState is only being used for its one guarantee, a stable
  // object per component instance. Nothing here schedules a render.
  //
  // Under StrictMode's double-render the cache may be written twice; that is
  // harmless, because buildPlacements re-validates every cached stage against
  // its inputs before reusing it. A stale or duplicated write costs a
  // recompute, never a wrong frame.
  const [cache] = useState(() => ({}));

  const { preset, items } = useMemo(
    () =>
      // Showrunner patrol: time the kernel+staged-eval stage at the hook
      // boundary (the engine itself is frozen — no instrumentation inside).
      // buildPlacements is cached per layer instance, so most frames report
      // ~0ms here; spikes mark genuine recompute frames.
      timeStage('kernel', () =>
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
          cache,
        }),
      ),
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
      // Stable for the life of the component (useState lazy init); listed to
      // satisfy exhaustive-deps, not because it can change.
      cache,
    ],
  );

  return { preset, items };
}
