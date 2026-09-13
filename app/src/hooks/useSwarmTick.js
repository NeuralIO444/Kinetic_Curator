// useSwarmTick — particle system lifecycle + render items for swarm mode

import { useState, useEffect, useRef, useMemo } from 'react';
import { ParticleSystem } from '../engine/particles.js';

const swarmSystem = new ParticleSystem();

export function useSwarmTick({ mode, safeParticles, activeAssets, palette, seed, layoutParams, canvasW, canvasH, scaleMul, alphaBoost, caps }) {
  const [tick, setTick] = useState(0);
  const attractorRef = useRef(null);

  useEffect(() => {
    if (mode !== 'swarm') return;

    swarmSystem.init(safeParticles, canvasW, canvasH, activeAssets, palette, seed);

    let animId;
    const step = () => {
      swarmSystem.update(layoutParams, activeAssets, palette, seed, Date.now(), attractorRef.current);
      setTick(t => t + 1);
      animId = requestAnimationFrame(step);
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [mode, activeAssets, palette, seed, safeParticles, layoutParams, canvasW, canvasH]);

  const swarmItems = useMemo(() => {
    if (mode !== 'swarm') return null;
    let items = swarmSystem.getItems(activeAssets).map(item => {
      const accent = palette.swatches[(palette.swatches.indexOf(item.color) + 3) % palette.swatches.length] || palette.swatches[0];
      return {
        ...item,
        assetId: item.asset?.id,
        accent,
        scale: item.scale * scaleMul,
        alpha: Math.min(100, item.alpha + alphaBoost),
      };
    });

    if (!layoutParams.overlap) items = [...items].sort((a, b) => a.scale - b.scale);

    if (layoutParams.mirror && caps.allowMirror) {
      const mirrored = items.map(item => ({
        ...item,
        x: canvasW - item.x,
        rotation: -item.rotation,
        _mirrored: true,
      }));
      items = [...items, ...mirrored];
    }
    return items;
  }, [mode, activeAssets, layoutParams.overlap, layoutParams.mirror, tick, canvasW, palette.swatches, caps.allowMirror, scaleMul, alphaBoost]);

  return { tick, swarmItems, attractorRef };
}

export { swarmSystem };
