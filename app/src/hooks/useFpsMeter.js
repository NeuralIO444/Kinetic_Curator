// useFpsMeter — real rAF-based FPS measurement
// Updates the Zustand store ~4 times per second to avoid thrashing UI.

import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';

export function useFpsMeter(enabled = true) {
  const setFps = useStore(s => s.setFps);
  const framesRef = useRef(0);
  const lastReportRef = useRef(performance.now());
  const rafRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    const tick = (now) => {
      framesRef.current += 1;
      const elapsed = now - lastReportRef.current;

      // Report ~4 Hz
      if (elapsed >= 250) {
        const fps = (framesRef.current / elapsed) * 1000;
        setFps(Math.round(fps * 10) / 10);
        framesRef.current = 0;
        lastReportRef.current = now;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, setFps]);
}
