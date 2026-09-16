// useSwarmTick — particle system lifecycle + render items for swarm / hype

import { useState, useEffect, useRef, useMemo } from 'react';
import { ParticleSystem } from '../engine/particles.js';
import { isLiveSwarmMode } from '../data/layout-modes.js';
import { useStore } from '../state/store.js';

export function useSwarmTick({
  mode, safeParticles, activeAssets, palette, seed, layoutParams,
  canvasW, canvasH, scaleMul, alphaBoost, caps, attractorRef,
}) {
  const [tick, setTick] = useState(0);
  const [swarmSystem] = useState(() => new ParticleSystem());
  const phraseWrapGen = useStore((s) => s.phraseWrapGen || 0);
  const wrapSeen = useRef(phraseWrapGen);

  const liveRef = useRef({ layoutParams, activeAssets, palette, seed });
  useEffect(() => {
    liveRef.current = { layoutParams, activeAssets, palette, seed };
  });

  useEffect(() => {
    if (!isLiveSwarmMode(mode)) return;
    const l = liveRef.current;
    swarmSystem.init(safeParticles, canvasW, canvasH, l.activeAssets, l.palette, l.seed);
    let animId;
    const step = () => {
      const c = liveRef.current;
      swarmSystem.update(c.layoutParams, c.activeAssets, c.palette, c.seed, Date.now(), attractorRef?.current);
      setTick((t) => (t + 1) % 1000000);
      animId = requestAnimationFrame(step);
    };
    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [mode, seed, safeParticles, canvasW, canvasH, swarmSystem, attractorRef]);

  useEffect(() => {
    if (phraseWrapGen === wrapSeen.current) return;
    wrapSeen.current = phraseWrapGen;
    swarmSystem.resetPhase();
  }, [phraseWrapGen, swarmSystem]);

  const swarmItems = useMemo(() => {
    if (!isLiveSwarmMode(mode)) return null;
    let items = swarmSystem.getItems(activeAssets).map((item) => {
      const accent = palette.swatches[(palette.swatches.indexOf(item.color) + 3) % palette.swatches.length] || palette.swatches[0];
      const u = Number.isFinite(item.u) ? item.u : 0;
      const uScale = item.role === 'wing' ? 1 + u * 0.18 : 1;
      return {
        ...item,
        assetId: item.asset?.id,
        accent,
        scale: item.scale * scaleMul * uScale,
        alpha: Math.min(100, item.alpha + alphaBoost),
        u,
      };
    });

    if (!layoutParams.overlap) items = [...items].sort((a, b) => a.scale - b.scale);

    const stamp = layoutParams.mirror || layoutParams.symmetry === 'stamp';
    if (stamp && caps.allowMirror) {
      const mirrored = items.map((item) => ({
        ...item,
        x: canvasW - item.x,
        rotation: -item.rotation,
        _mirrored: true,
        key: item.key ? `${item.key}-stamp` : undefined,
      }));
      items = [...items, ...mirrored];
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeAssets, layoutParams.overlap, layoutParams.mirror, layoutParams.symmetry, tick, canvasW, palette.swatches, caps.allowMirror, scaleMul, alphaBoost, swarmSystem]);

  return { tick, swarmItems, resetPhase: () => swarmSystem.resetPhase(), physicsCount: () => swarmSystem.physicsCount() };
}
