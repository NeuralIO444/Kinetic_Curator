// useContinuousLife — subtle LFO drift on unlocked params while running
// Makes the composition breathe even when Evolve is off.

import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';

export function useContinuousLife() {
  const running = useStore(s => s.running);
  const lifeDrift = useStore(s => s.layoutParams.lifeDrift ?? 0.35);
  const lockedParams = useStore(s => s.lockedParams);
  // Drift is machine-generated: write via setLayoutParams so it never lands
  // in the undo stack (setLayoutParam records history on every call).
  const setLayoutParams = useStore(s => s.setLayoutParams);

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

      const next = {};
      if (!lockedParams.jitter) {
        const v = Math.round(base.jitter + Math.sin(t * 0.7) * 12 * depth);
        next.jitter = Math.max(0, Math.min(200, v));
      }
      if (!lockedParams.displacement) {
        const v = Math.round(base.displacement + Math.sin(t * 0.45 + 1.2) * 18 * depth);
        next.displacement = Math.max(0, Math.min(250, v));
      }
      if (!lockedParams.noiseSpeed) {
        const v = +(base.noiseSpeed + Math.sin(t * 0.3 + 0.5) * 0.25 * depth).toFixed(2);
        next.noiseSpeed = Math.max(0.1, Math.min(3, v));
      }
      if (Object.keys(next).length > 0) setLayoutParams(next);
    }, 80);

    return () => clearInterval(id);
  }, [running, lifeDrift, lockedParams.jitter, lockedParams.displacement, lockedParams.noiseSpeed, setLayoutParams]);

  // Reset baseline when user manually changes these params significantly.
  // NOTE: the store has no subscribeWithSelector middleware, so subscribe()
  // takes a single (state, prevState) listener — the two-arg selector form
  // silently never fired.
  useEffect(() => {
    const unsub = useStore.subscribe((s, prevS) => {
      const lp = s.layoutParams;
      const prev = prevS?.layoutParams;
      {
        if (!prev || lp === prev) return;
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
    });
    return unsub;
  }, []);
}
