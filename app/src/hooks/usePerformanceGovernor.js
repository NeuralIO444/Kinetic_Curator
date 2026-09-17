// usePerformanceGovernor — the Showrunner's enforcement arm.
//
// Auto-protects interactivity when FPS tanks. Strategy:
// - Track a short window of low-FPS samples; act only on sustained dips
//   with a cooldown between steps (never thrash on spikes).
// - Shed load in a DEFINED ORDER — the cut list. Order is the contract:
//     cut 1: FX simplify (turbulence octaves → 1, grain off)
//     cut 2: FX bypass (keep first visible FX layer only)
//     cut 3: quality tier step HIGH → BALANCED → PERF
//     cut 4: mirror/gloss/ACCUM shed (independent perfTier1 mechanism, lower FPS floor)
//     cut 5: cost-aware asset thinning (drop highest-cost assets first)
//     cut 5b: render-only count clamp below the PERF floor (existing)
//     cut 6: freeze motion via slowRender (a still instrument beats a dead one)
//     cut 7: watchdog hard stop (existing tier 2, manual resume)
// - Every cut is a render-only overlay: it never writes layoutParams, never
//   serializes into project JSON, and auto-clears on recovery — except the
//   hard stop, which needs manual resume (panic-key precedent, #107).
// - Cuts 1–2 are dormant until a layer with kind 'fx' exists (#152); the
//   guard keeps the ladder from spending steps on nothing.

import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';

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
  const layers = useStore(s => s.layers);
  const fxShedLevel = useStore(s => s.fxShedLevel);
  const assetThin = useStore(s => s.assetThin);
  const setQuality = useStore(s => s.setQuality);
  const setSlowRender = useStore(s => s.setSlowRender);
  const setPerfTier1 = useStore(s => s.setPerfTier1);
  const tripWatchdog = useStore(s => s.tripWatchdog);
  const setPerfClampOverride = useStore(s => s.setPerfClampOverride);
  const setFxShedLevel = useStore(s => s.setFxShedLevel);
  const setAssetThin = useStore(s => s.setAssetThin);
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
    // holding. frameLock is a user choice and is never auto-cleared here.
    // (The count clamp keeps its original nuance: its premise is "still
    // struggling at the lowest tier", so it also clears on tier change.)
    if (healthy || quality !== 'performance') {
      if (perfClampOverride) setPerfClampOverride(null);
    }
    if (healthy) {
      if (fxShedLevel > 0) setFxShedLevel(0);
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

    const step = (label) => {
      lastActionRef.current = now;
      lowSinceRef.current = null;
      console.info('[Kinetic] Showrunner cut:', label, '(FPS sustained below', LOW_FPS + ')');
    };

    // Cuts 1–2: FX shedding comes FIRST. A filter chain re-renders every
    // frame while anything beneath it animates, so FX is the steepest cost
    // per unit of visual change (the Resolume "effect stack" lesson).
    // Dormant until kind:'fx' layers exist (#152) — the guard keeps the
    // ladder from spending steps on nothing.
    const fxActive = layers.filter((l) => l.kind === 'fx' && l.visible !== false).length;
    if (fxActive > 0 && fxShedLevel < 2) {
      const next = fxShedLevel + 1;
      setFxShedLevel(next);
      step(next === 1
        ? 'FX simplify — turbulence to 1 octave, grain off'
        : 'FX bypass — first visible FX layer only');
      return;
    }

    // Cut 3: quality tier step (placement + particle budgets).
    if (quality === 'high') {
      setQuality('balanced');
      step('quality → BALANCED');
      return;
    }
    if (quality === 'balanced') {
      setQuality('performance');
      step('quality → PERF');
      return;
    }

    // Cut 5: cost-aware asset thinning. (Cut 4 — mirror/gloss/ACCUM — is
    // the independent perfTier1 mechanism at its own lower FPS floor.)
    if (!assetThin) {
      setAssetThin(true);
      step('asset thinning — highest-cost assets drop first');
      return;
    }

    // Already on performance — the caps at that tier are the floor for what
    // the live canvas draws; if FPS is still on the floor too, cut further
    // via a render-only overlay rather than layoutParams itself. That field
    // is what a "FINAL · UNCAPPED" export restores to once it is done, and a
    // live-only performance cut must never be what a snapshot inherits.
    const effectiveCount = perfClampOverride?.count ?? layoutParams.count;
    if (effectiveCount > 120) {
      const next = Math.max(80, Math.floor(effectiveCount * 0.7));
      setPerfClampOverride({ count: next, mirror: false });
      step(`count clamp (live only) → ${next}`);
      return;
    }

    // Cut 6: freeze motion. Reuses the tested slowRender path (pauses
    // evolve/ambient-drift/ACCUM/swarm); it auto-clears on recovery in the
    // critical effect above. A still instrument beats a dead one.
    if (!slowRender) {
      setSlowRender(true);
      step('motion frozen (slowRender)');
    }
  }, [fps, quality, autoQuality, setQuality, layoutParams.count, perfClampOverride,
    setPerfClampOverride, layers, fxShedLevel, setFxShedLevel, assetThin,
    setAssetThin, slowRender, setSlowRender]);
}
