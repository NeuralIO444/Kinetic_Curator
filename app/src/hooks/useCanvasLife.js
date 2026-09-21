// useCanvasLife — continuous breathing time + audio-driven scale/alpha/glow modulation

import { useState, useEffect, useMemo } from 'react';

// Spine C (#389): Stop per-frame setLifeT. The GL liveLoop owns the
// continuous clock, ballistics, and springs. useCanvasLife keeps a ~6Hz
// (160ms) tick for meters only, eliminating per-frame React re-renders.
const METER_TICK_MS = 160;

export function useCanvasLife({ running, layoutParams, beatPulse, audioBands }) {
  const [lifeT, setLifeT] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setLifeT(performance.now() * 0.001);
    }, METER_TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  const depth = layoutParams.audioModDepth ?? 0.65;
  const scaleModAmt = layoutParams.audioScaleMod ?? 0.45;
  const alphaModAmt = layoutParams.audioAlphaMod ?? 0.25;
  const lifeDrift = layoutParams.lifeDrift ?? 0.35;

  const bands = audioBands || { bass: 0, mid: 0, treble: 0, rms: 0 };
  const pulse = beatPulse || 0;

  // #273: STIMULUS DEPTH applies once. (It used to scale the audio term by
  // depth *and* the whole gesture by depth again — quadratic, so the default
  // 0.65 felt dead and 1.0 blew up ~1.6x.) The outer * depth stays so
  // depth = 0 remains a true no-op.
  const scaleMul = 1 + (
    pulse * 0.38 * scaleModAmt +
    (bands.bass * 0.55 + bands.rms * 0.35) * 0.28
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
