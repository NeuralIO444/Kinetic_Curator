// useMorphEvolve — smooth interpolation of layout params toward morph targets

import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpValue(from, to, t) {
  if (Array.isArray(from) && Array.isArray(to)) {
    const len = Math.max(from.length, to.length);
    const out = [];
    for (let i = 0; i < len; i++) {
      const a = from[i] ?? from[from.length - 1] ?? 0;
      const b = to[i] ?? to[to.length - 1] ?? 0;
      out.push(+(lerp(a, b, t).toFixed(3)));
    }
    return out;
  }
  if (typeof from === 'number' && typeof to === 'number') {
    return +(lerp(from, to, t).toFixed(3));
  }
  return to;
}

export function useMorphEvolve() {
  const morphing = useStore(s => s.morphing);
  const morphFrom = useStore(s => s.morphFrom);
  const morphTo = useStore(s => s.morphTo);
  const morphStart = useStore(s => s.morphStart);
  const morphDurationMs = useStore(s => s.morphDurationMs);
  const setLayoutParams = useStore(s => s.setLayoutParams);
  const finishMorph = useStore(s => s.finishMorph);

  const rafRef = useRef(null);

  useEffect(() => {
    if (!morphing || !morphFrom || !morphTo) return;

    const tick = (now) => {
      const elapsed = now - morphStart;
      const t = Math.min(1, elapsed / Math.max(1, morphDurationMs));
      // ease-in-out cubic
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const next = { ...useStore.getState().layoutParams };
      for (const key of Object.keys(morphTo)) {
        if (key in morphFrom) {
          next[key] = lerpValue(morphFrom[key], morphTo[key], e);
          // Integer-ish keys: round at the end
          if (['count', 'jitter', 'density', 'zTiers', 'displacement', 'particleCount'].includes(key)) {
            if (typeof next[key] === 'number') next[key] = Math.round(next[key]);
          }
        }
      }
      setLayoutParams(next);

      if (t >= 1) {
        finishMorph();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [morphing, morphFrom, morphTo, morphStart, morphDurationMs, setLayoutParams, finishMorph]);
}
