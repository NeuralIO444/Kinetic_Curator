import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';
import { createCultureWorld, advanceCultureWorld, setStandingCultureWorld } from '../engine/cultureWorld.mjs';

// CULTURE Phase 0 — the app shell's seam for the dish gate (state.cultureDish, carried by
// the project document only while on). While the gate is ON, the shell owns one CULTURE
// world and feeds it accumulated frame time from rAF; the world's own scheduler turns
// that into fixed 120 Hz steps (engine/cultureWorld.mjs). While the gate is OFF — the
// default, and every project that predates the gate — this hook creates nothing, starts
// no rAF, and costs nothing: the stage is exactly the stage it was. The world is empty
// in Phase 0 (no bodies, no rendering); it exists so later phases immigrate into a
// running world, not a cold one. A seed change rebuilds the world empty — the Lab casts
// fresh each take (spec §4), and Phase 0 has no population to preserve.
export function useCultureWorld() {
  const on = useStore((s) => s.cultureDish === true);
  const seed = useStore((s) => s.seed);
  const ref = useRef(null);

  useEffect(() => {
    if (!on) {
      ref.current = null;
      setStandingCultureWorld(null);
      return undefined;
    }
    const world = createCultureWorld({ seed });
    ref.current = world;
    setStandingCultureWorld(world);
    let raf = 0;
    let last = null;
    const tick = (now) => {
      if (last !== null) advanceCultureWorld(world, Math.max(0, (now - last) / 1000));
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (ref.current === world) {
        ref.current = null;
        setStandingCultureWorld(null);
      }
    };
  }, [on, seed]);

  return ref;
}
