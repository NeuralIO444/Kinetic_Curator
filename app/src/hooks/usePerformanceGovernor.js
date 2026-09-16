// usePerformanceGovernor — auto-protects interactivity when FPS tanks
//
// Strategy:
// - Track a short window of low-FPS samples
// - If sustained low FPS while quality is higher than 'performance',
//   step quality down one level (high → balanced → performance)
// - Optionally clamp count further if already on performance
// - Never fights a user who manually chose 'performance'
// - #107 §4: quality/count only shrink what gets drawn. Two tiers below that:
//     tier 1 (FPS < 16 sustained 2s): shed ACCUM/gloss/mirror render-only,
//       across every visible layer. Auto-clears the instant FPS recovers —
//       no sustain needed, a false-positive resume just costs one frame.
//     tier 2 (FPS ~0 sustained, or a critical render-error elsewhere): a hard
//       stop via tripWatchdog — running/evolve off, does not auto-resume.
//   Recovery for tier 1 and the tier-2 `slowRender` flag is immediate; only
//   `running`/`evolveMode` require a manual resume (panic-key precedent).
// - #107 §5: the last-resort count clamp below is a render-only overlay
//   (perfClampOverride), not a layoutParams write — see the comment at that
//   branch for why.

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
  const setQuality = useStore(s => s.setQuality);
  const setSlowRender = useStore(s => s.setSlowRender);
  const setPerfTier1 = useStore(s => s.setPerfTier1);
  const tripWatchdog = useStore(s => s.tripWatchdog);
  const setPerfClampOverride = useStore(s => s.setPerfClampOverride);
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

  useEffect(() => {
    // The premise for a density clamp is "still struggling at the lowest
    // quality tier" — once any of that stops holding, drop it immediately
    // rather than leaving a render-only cut in place with nothing left to
    // clear it (#107 §5).
    if (!autoQuality || fps >= LOW_FPS || quality !== 'performance') {
      if (perfClampOverride) setPerfClampOverride(null);
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

    // Step quality down
    if (quality === 'high') {
      setQuality('balanced');
      lastActionRef.current = now;
      lowSinceRef.current = null;
      console.info('[Kinetic] Auto quality → balanced (FPS sustained below', LOW_FPS, ')');
      return;
    }

    if (quality === 'balanced') {
      setQuality('performance');
      lastActionRef.current = now;
      lowSinceRef.current = null;
      console.info('[Kinetic] Auto quality → performance (FPS sustained below', LOW_FPS, ')');
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
      lastActionRef.current = now;
      lowSinceRef.current = null;
      console.info('[Kinetic] Performance clamp (live only): count →', next, ', mirror off');
    }
  }, [fps, quality, autoQuality, setQuality, layoutParams.count, perfClampOverride, setPerfClampOverride]);
}
