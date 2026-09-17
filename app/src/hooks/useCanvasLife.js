// useCanvasLife — continuous breathing time + audio-driven scale/alpha/glow modulation

import { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../state/store.js';

// Frame-lock show mode gates the life tick to ~30Hz. This tick is the
// dominant per-frame re-render driver (breath/scale/alpha feed every Layer),
// so halving it roughly halves React render work. A locked 30fps reads
// smoother than a fluctuating 40–60 (the Resolume lesson).
const FRAME_LOCK_MS = 1000 / 30;

export function useCanvasLife({ running, layoutParams, beatPulse, audioBands }) {
  const [lifeT, setLifeT] = useState(0);
  const frameLock = useStore(s => s.frameLock);
  const lastTickRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    let id;
    const step = (now) => {
      if (!frameLock || now - lastTickRef.current >= FRAME_LOCK_MS) {
        lastTickRef.current = now;
        setLifeT(now * 0.001);
      }
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [running, frameLock]);

  const depth = layoutParams.audioModDepth ?? 0.65;
  const scaleModAmt = layoutParams.audioScaleMod ?? 0.45;
  const alphaModAmt = layoutParams.audioAlphaMod ?? 0.25;
  const lifeDrift = layoutParams.lifeDrift ?? 0.35;

  const bands = audioBands || { bass: 0, mid: 0, treble: 0, rms: 0 };
  const pulse = beatPulse || 0;

  const scaleMul = 1 + (
    pulse * 0.38 * scaleModAmt +
    (bands.bass * 0.55 + bands.rms * 0.35) * 0.28 * depth
  ) * depth;

  const alphaBoost = pulse * 18 * alphaModAmt * depth;

  const breathScale = 1 + Math.sin(lifeT * 0.8) * 0.012 * lifeDrift
    + pulse * 0.035 * depth;
  const breathRot = Math.sin(lifeT * 0.35) * 0.6 * lifeDrift;

  const glow = Math.min(1, pulse * 0.8 + bands.rms * 0.4) * depth;

  const effectiveScale = useMemo(() => {
    const [lo, hi] = layoutParams.scale;
    return [lo * scaleMul, hi * scaleMul];
  }, [layoutParams.scale, scaleMul]);

  const effectiveAlpha = useMemo(() => {
    const [lo, hi] = layoutParams.alpha;
    return [
      Math.min(100, lo + alphaBoost * 0.4),
      Math.min(100, hi + alphaBoost),
    ];
  }, [layoutParams.alpha, alphaBoost]);

  return { lifeT, scaleMul, alphaBoost, breathScale, breathRot, glow, effectiveScale, effectiveAlpha, depth, bands, pulse };
}
