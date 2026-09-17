// usePerformanceGovernor — the Showrunner's enforcement arm.
//
// Auto-protects interactivity when FPS tanks. Strategy:
// - Track a short window of low-FPS samples; act only on sustained dips
//   with a cooldown between steps (never thrash on spikes).
// - Shed load in a DEFINED ORDER — the cut list. Order is the contract
//   (see ./governorCuts.js, pure and unit-tested):
//     cut 1: dynamic resolution scaling (renderScale 1 → 0.75 → 0.5 → 0.33)
//     cut 2: quality tier step HIGH → BALANCED → PERF
//     cut 3: mirror/gloss/ACCUM shed (independent perfTier1 mechanism, lower FPS floor)
//     cut 4: cost-aware asset thinning (drop highest-cost assets first)
//     cut 5: render-only count clamp below the PERF floor
//     cut 6: freeze motion via slowRender (a still instrument beats a dead one)
//     cut 7: watchdog hard stop (existing tier 2, manual resume)
// - Every cut is a render-only overlay: it never writes layoutParams, never
//   serializes into project JSON, and auto-clears on recovery — except the
//   hard stop, which needs manual resume (panic-key precedent, #107).
// - Phase 6 (#192): the old cuts 1–2 (FX simplify / FX bypass — the
//   fxShedLevel ladder) are REMOVED. GPU FX compositing has 10–50x headroom,
//   and the ladder caused the silent-cull trap: an FX layer shown in the UI
//   while its wrap was culled. The primary shed is dynamic resolution
//   scaling — pixels drop before anything visible is cut. If the governor
//   ever sheds, the UI says so: see ShedBadge in App.jsx (#177 owns the
//   full indicator design later).

import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';
import { nextGovernorCut } from './governorCuts.js';

const LOW_FPS = 32;
const CRITICAL_FPS = 10; // ~0 FPS: the tab is barely getting frames at all
const TIER1_FPS = 16; // shed ACCUM/gloss/mirror before things go fully critical
const SUSTAIN_MS = 1600; // must stay low this long before acting
const CRITICAL_SUSTAIN_MS = 800; // react faster — this is the worse case
const TIER1_SUSTAIN_MS = 2000; // #107 §4 spec: 2s sustained below TIER1_FPS
const COOLDOWN_MS = 8000; // don't auto-step again for a while

export function usePerformanceGovernor() {
  const fps = useStore(s => s.fps);
  const quality = useStore(s => s.quality);
  const autoQuality = useStore(s => s.autoQuality);
  const slowRender = useStore(s => s.slowRender);
  const perfTier1 = useStore(s => s.perfTier1);
  const perfClampOverride = useStore(s => s.perfClampOverride);
  const assetThin = useStore(s => s.assetThin);
  const renderScale = useStore(s => s.renderScale);
  const setQuality = useStore(s => s.setQuality);
  const setSlowRender = useStore(s => s.setSlowRender);
  const setPerfTier1 = useStore(s => s.setPerfTier1);
  const tripWatchdog = useStore(s => s.tripWatchdog);
  const setPerfClampOverride = useStore(s => s.setPerfClampOverride);
  const setAssetThin = useStore(s => s.setAssetThin);
  const setRenderScale = useStore(s => s.setRenderScale);
  const layoutParams = useStore(s => s.layoutParams);

  const lowSinceRef = useRef(null);
  const lastActionRef = useRef(0);
  const criticalSinceRef = useRef(null);
  const tier1SinceRef = useRef(null);

  useEffect(() => {
    if (!autoQuality) {
      criticalSinceRef.current = null;
      if (slowRender) setSlowRender(false);
      return;
    }
    if (fps >= LOW_FPS) {
      criticalSinceRef.current = null;
      if (slowRender) setSlowRender(false);
      return;
    }
    if (fps >= CRITICAL_FPS) {
      criticalSinceRef.current = null;
      return;
    }
    const now = Date.now();
    if (criticalSinceRef.current == null) {
      criticalSinceRef.current = now;
      return;
    }
    if (!slowRender && now - criticalSinceRef.current >= CRITICAL_SUSTAIN_MS) {
      tripWatchdog('fps-critical');
      console.info('[Kinetic] Perf critical: watchdog tripped — running/evolve off (FPS below', CRITICAL_FPS, ')');
    }
  }, [fps, autoQuality, slowRender, tripWatchdog, setSlowRender]);

  // Tier 1 (#107 §4): a milder, self-clearing shed. Independent sustain
  // window from the critical tier above — this one fires first, at a higher
  // FPS floor, and never touches running/evolveMode.
  useEffect(() => {
    if (!autoQuality) {
      tier1SinceRef.current = null;
      if (perfTier1) setPerfTier1(false);
      return;
    }
    if (fps >= TIER1_FPS) {
      tier1SinceRef.current = null;
      if (perfTier1) setPerfTier1(false);
      return;
    }
    const now = Date.now();
    if (tier1SinceRef.current == null) {
      tier1SinceRef.current = now;
      return;
    }
    if (!perfTier1 && now - tier1SinceRef.current >= TIER1_SUSTAIN_MS) {
      setPerfTier1(true);
      console.info('[Kinetic] Perf tier1: ACCUM/gloss/mirror off (FPS below', TIER1_FPS, ')');
    }
  }, [fps, autoQuality, perfTier1, setPerfTier1]);

  // The cut list: ordered, one step per sustain+cooldown cycle.
  useEffect(() => {
    const healthy = !autoQuality || fps >= LOW_FPS;

    // Recovery: render-only cuts auto-clear the moment the premise stops
    // holding. (The count clamp keeps its original nuance: its premise is
    // "still struggling at the lowest tier", so it also clears on tier
    // change.)
    if (healthy || quality !== 'performance') {
      if (perfClampOverride) setPerfClampOverride(null);
    }
    if (healthy) {
      if (renderScale < 1) setRenderScale(1);
      if (assetThin) setAssetThin(false);
    }

    if (!autoQuality) {
      lowSinceRef.current = null;
      return;
    }

    const now = Date.now();

    if (fps >= LOW_FPS) {
      lowSinceRef.current = null;
      return;
    }

    // Start / continue low window
    if (lowSinceRef.current == null) {
      lowSinceRef.current = now;
      return;
    }

    const sustained = now - lowSinceRef.current >= SUSTAIN_MS;
    const cooled = now - lastActionRef.current >= COOLDOWN_MS;

    if (!sustained || !cooled) return;

    const cut = nextGovernorCut({
      renderScale,
      quality,
      assetThin,
      perfClampOverride,
      effectiveCount: layoutParams.count,
      slowRender,
    });
    if (!cut) return; // ladder exhausted — hold; the watchdog is separate

    switch (cut.kind) {
      case 'renderScale': setRenderScale(cut.scale); break;
      case 'quality': setQuality(cut.quality); break;
      case 'assetThin': setAssetThin(true); break;
      case 'countClamp': setPerfClampOverride({ count: cut.count, mirror: false }); break;
      case 'slowRender': setSlowRender(true); break;
      default: break;
    }
    lastActionRef.current = now;
    lowSinceRef.current = null;
    console.info('[Kinetic] Showrunner cut:', cut.label, '(FPS sustained below', LOW_FPS + ')');
  }, [fps, quality, autoQuality, setQuality, layoutParams.count, perfClampOverride,
    setPerfClampOverride, assetThin, setAssetThin, renderScale, setRenderScale,
    slowRender, setSlowRender]);
}
