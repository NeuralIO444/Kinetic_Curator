// usePerformanceGovernor — auto-protects interactivity when FPS tanks
//
// Strategy:
// - Track a short window of low-FPS samples
// - If sustained low FPS while quality is higher than 'performance',
//   step quality down one level (high → balanced → performance)
// - Optionally clamp count further if already on performance
// - Never fights a user who manually chose 'performance'
// - #107 §4: quality/count only shrink what gets drawn. At ~0 FPS that is
//   not enough — evolve, ambient life drift, ACCUM and swarm are each doing
//   full-rate work independent of quality, so a sustained near-zero reading
//   sets `slowRender`, which those four pause on directly until FPS
//   recovers. Recovery is immediate (no sustain window): a false-positive
//   resume just means one hook does a frame of work it could have skipped.
// - #107 §5: the last-resort count clamp below is a render-only overlay
//   (perfClampOverride), not a layoutParams write — see the comment at that
//   branch for why.

import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';

const LOW_FPS = 32;
const CRITICAL_FPS = 10; // ~0 FPS: the tab is barely getting frames at all
const SUSTAIN_MS = 1600; // must stay low this long before acting
const CRITICAL_SUSTAIN_MS = 800; // react faster — this is the worse case
const COOLDOWN_MS = 8000; // don't auto-step again for a while

export function usePerformanceGovernor() {
  const fps = useStore(s => s.fps);
  const quality = useStore(s => s.quality);
  const autoQuality = useStore(s => s.autoQuality);
  const slowRender = useStore(s => s.slowRender);
  const perfClampOverride = useStore(s => s.perfClampOverride);
  const setQuality = useStore(s => s.setQuality);
  const setSlowRender = useStore(s => s.setSlowRender);
  const setPerfClampOverride = useStore(s => s.setPerfClampOverride);
  const layoutParams = useStore(s => s.layoutParams);

  const lowSinceRef = useRef(null);
  const lastActionRef = useRef(0);
  const criticalSinceRef = useRef(null);

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
      setSlowRender(true);
      console.info('[Kinetic] Perf critical: pausing evolve/life/ACCUM/swarm (FPS below', CRITICAL_FPS, ')');
    }
  }, [fps, autoQuality, slowRender, setSlowRender]);

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
