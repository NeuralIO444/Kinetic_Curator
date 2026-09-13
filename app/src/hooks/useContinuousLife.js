// useContinuousLife — subtle LFO drift on unlocked params while running
// Makes the composition breathe even when Evolve is off.

import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';

export function useContinuousLife() {
  const running = useStore(s => s.running);
  const lifeDrift = useStore(s => s.layoutParams.lifeDrift ?? 0.35);
  const lockedParams = useStore(s => s.lockedParams);
  const setLayoutParam = useStore(s => s.setLayoutParam);

  const baseRef = useRef(null);
  const tRef = useRef(0);

  useEffect(() => {
    if (!running || lifeDrift <= 0.01) {
      baseRef.current = null;
      return;
    }

    // Capture baseline once when life starts
    if (!baseRef.current) {
      const lp = useStore.getState().layoutParams;
      baseRef.current = {
        jitter: lp.jitter,
        displacement: lp.displacement,
        noiseSpeed: lp.noiseSpeed,
      };
    }

    const id = setInterval(() => {
      tRef.current += 0.04;
      const t = tRef.current;
      const depth = lifeDrift;
      const base = baseRef.current;
      if (!base) return;

      if (!lockedParams.jitter) {
        const v = Math.round(base.jitter + Math.sin(t * 0.7) * 12 * depth);
        setLayoutParam('jitter', Math.max(0, Math.min(200, v)));
      }
      if (!lockedParams.displacement) {
        const v = Math.round(base.displacement + Math.sin(t * 0.45 + 1.2) * 18 * depth);
        setLayoutParam('displacement', Math.max(0, Math.min(250, v)));
      }
      if (!lockedParams.noiseSpeed) {
        const v = +(base.noiseSpeed + Math.sin(t * 0.3 + 0.5) * 0.25 * depth).toFixed(2);
        setLayoutParam('noiseSpeed', Math.max(0.1, Math.min(3, v)));
      }
    }, 80);

    return () => clearInterval(id);
  }, [running, lifeDrift, lockedParams.jitter, lockedParams.displacement, lockedParams.noiseSpeed, setLayoutParam]);

  // Reset baseline when user manually changes these params significantly
  useEffect(() => {
    const unsub = useStore.subscribe(
      (s) => s.layoutParams,
      (lp, prev) => {
        if (!prev) return;
        // If user (or evolve) hard-jumps a value, re-anchor baseline
        if (
          Math.abs(lp.jitter - prev.jitter) > 20 ||
          Math.abs(lp.displacement - prev.displacement) > 25 ||
          Math.abs(lp.noiseSpeed - prev.noiseSpeed) > 0.4
        ) {
          baseRef.current = {
            jitter: lp.jitter,
            displacement: lp.displacement,
            noiseSpeed: lp.noiseSpeed,
          };
        }
      }
    );
    return unsub;
  }, []);
}
