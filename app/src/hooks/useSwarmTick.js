// useSwarmTick — particle system lifecycle + render items for swarm mode

import { useState, useEffect, useRef, useMemo } from 'react';
import { ParticleSystem } from '../engine/particles.js';

const swarmSystem = new ParticleSystem();

export function useSwarmTick({ mode, safeParticles, activeAssets, palette, seed, layoutParams, canvasW, canvasH, scaleMul, alphaBoost, caps }) {
  const [tick, setTick] = useState(0);
  const attractorRef = useRef(null);

  // Live values the loop reads each frame. Keeping them in a ref means a
  // slider drag tunes the swarm instead of re-seeding it from scratch.
  const liveRef = useRef({ layoutParams, activeAssets, palette, seed });
  useEffect(() => {
    liveRef.current = { layoutParams, activeAssets, palette, seed };
  });

  useEffect(() => {
    if (mode !== 'swarm') return;

    const l = liveRef.current;
    swarmSystem.init(safeParticles, canvasW, canvasH, l.activeAssets, l.palette, l.seed);

    let animId;
    const step = () => {
      const c = liveRef.current;
      swarmSystem.update(c.layoutParams, c.activeAssets, c.palette, c.seed, Date.now(), attractorRef.current);
      setTick(t => (t + 1) % 1000000);
      animId = requestAnimationFrame(step);
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
    // Only a genuine identity change (mode / seed / population / canvas) re-seeds.
  }, [mode, seed, safeParticles, canvasW, canvasH]);

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
    // `tick` is the intentional invalidation signal for the mutable particle system.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeAssets, layoutParams.overlap, layoutParams.mirror, tick, canvasW, palette.swatches, caps.allowMirror, scaleMul, alphaBoost]);

  return { tick, swarmItems, attractorRef };
}

export { swarmSystem };
