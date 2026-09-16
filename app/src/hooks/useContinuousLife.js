// useContinuousLife — subtle LFO drift on unlocked params while running
// Makes the composition breathe even when Evolve is off.
//
// #107 §2: this used to call setLayoutParams every 80ms, writing the sine
// values straight into document state — which fought the autosave debounce
// and put machine-generated noise in the same field undo/redo operate on.
// It now writes to the ephemeral driftOverlay slot instead (see
// layoutSlice.js), which the canvas merges over layoutParams for render
// only. layoutParams itself is untouched, so it only ever changes from a
// real edit.

import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';

export function useContinuousLife() {
  const running = useStore(s => s.running);
  const lifeDrift = useStore(s => s.layoutParams.lifeDrift ?? 0.35);
  const lockedParams = useStore(s => s.lockedParams);
  const setDriftOverlay = useStore(s => s.setDriftOverlay);
  // #107 §4: this is the "life" the performance governor pauses at ~0 FPS —
  // every tick invalidates the geometry cache (see buildPlacements.js), which
  // is exactly the wrong thing to keep doing while the frame rate is on the
  // floor.
  const slowRender = useStore(s => s.slowRender);
  // #107 §5: held for the whole duration of a batch export, independent of
  // slowRender — see globalSlice.js for why this is a separate flag.
  const batchPaused = useStore(s => s.batchPaused);

  const baseRef = useRef(null);
  const tRef = useRef(0);

  useEffect(() => {
    if (!running || lifeDrift <= 0.01 || slowRender || batchPaused) {
      baseRef.current = null;
      setDriftOverlay(null);
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
      setDriftOverlay(Object.keys(next).length > 0 ? next : null);
    }, 80);

    return () => clearInterval(id);
  }, [running, lifeDrift, slowRender, batchPaused, lockedParams.jitter, lockedParams.displacement, lockedParams.noiseSpeed, setDriftOverlay]);

  // Re-anchor the baseline whenever the operator (or a preset/evolve target)
  // actually edits one of these params. layoutParams no longer carries
  // drift's own writes, so any change observed here is a real edit — no
  // threshold needed to tell the two apart anymore.
  useEffect(() => {
    const unsub = useStore.subscribe((s, prevS) => {
      if (!baseRef.current) return;
      const lp = s.layoutParams;
      const prev = prevS?.layoutParams;
      if (!prev || lp === prev) return;
      if (lp.jitter !== prev.jitter || lp.displacement !== prev.displacement || lp.noiseSpeed !== prev.noiseSpeed) {
        baseRef.current = {
          jitter: lp.jitter,
          displacement: lp.displacement,
          noiseSpeed: lp.noiseSpeed,
        };
      }
    });
    return unsub;
  }, []);
}
