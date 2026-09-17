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
  // #107 §4: swarm physics run every rAF frame regardless of the app's
  // `running` flag — the performance governor's pause has to reach in here
  // directly rather than through a prop, since nothing upstream already
  // threads a pause signal into this hook.
  const slowRender = useStore((s) => s.slowRender);

  const liveRef = useRef({ layoutParams, activeAssets, palette, seed, slowRender, caps });
  useEffect(() => {
    liveRef.current = { layoutParams, activeAssets, palette, seed, slowRender, caps };
  });

  useEffect(() => {
    if (!isLiveSwarmMode(mode)) return;
    const l = liveRef.current;
    swarmSystem.init(safeParticles, canvasW, canvasH, l.activeAssets, l.palette, l.seed);
    let animId;
    const step = () => {
      const c = liveRef.current;
      // Read slowRender fresh each frame (not as an effect dependency) so
      // pausing never re-runs this setup and re-inits the particle system —
      // it would otherwise reset positions/velocities on every perf dip.
      if (!c.slowRender) {
        // #167 — the quality cap rides on layoutParams so breed() can gate
        // population growth without changing update()'s signature. Read off
        // liveRef (not the effect deps) so a quality-tier change can't
        // re-init the particle system mid-flight.
        swarmSystem.update({ ...c.layoutParams, maxParticles: c.caps?.maxParticles },
          c.activeAssets, c.palette, c.seed, Date.now(), attractorRef?.current);
        setTick((t) => (t + 1) % 1000000);
      }
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
