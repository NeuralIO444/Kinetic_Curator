// usePerformanceGovernor — auto-protects interactivity when FPS tanks
//
// Strategy:
// - Track a short window of low-FPS samples
// - If sustained low FPS while quality is higher than 'performance',
//   step quality down one level (high → balanced → performance)
// - Optionally clamp count further if already on performance
// - Never fights a user who manually chose 'performance'

import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';

const LOW_FPS = 32;
const SUSTAIN_MS = 1600; // must stay low this long before acting
const COOLDOWN_MS = 8000; // don't auto-step again for a while

export function usePerformanceGovernor() {
  const fps = useStore(s => s.fps);
  const quality = useStore(s => s.quality);
  const autoQuality = useStore(s => s.autoQuality);
  const setQuality = useStore(s => s.setQuality);
  const setLayoutParam = useStore(s => s.setLayoutParam);
  const layoutParams = useStore(s => s.layoutParams);

  const lowSinceRef = useRef(null);
  const lastActionRef = useRef(0);

  useEffect(() => {
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

    // Already on performance — hard-clamp count a bit more if still struggling
    if (layoutParams.count > 120) {
      const next = Math.max(80, Math.floor(layoutParams.count * 0.7));
      setLayoutParam('count', next);
      if (layoutParams.mirror) setLayoutParam('mirror', false);
      lastActionRef.current = now;
      lowSinceRef.current = null;
      console.info('[Kinetic] Performance clamp: count →', next, ', mirror off');
    }
  }, [fps, quality, autoQuality, setQuality, setLayoutParam, layoutParams.count, layoutParams.mirror]);
}
