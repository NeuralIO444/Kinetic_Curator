// useBeatDecay — exponential decay of beatPulse so hits feel musical

import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';

const DECAY = 0.90; // per frame at ~60fps → ~100ms half-life feel

export function useBeatDecay() {
  const setBeatPulse = useStore(s => s.setBeatPulse);
  const rafRef = useRef(null);

  useEffect(() => {
    const tick = () => {
      // Skip the store write once the pulse has settled at 0 — the old code
      // allocated a new state object and notified every subscriber on every
      // frame for the life of the app. The value trajectory is unchanged.
      const p = useStore.getState().beatPulse;
      if (p > 0.002) setBeatPulse(p * DECAY);
      else if (p !== 0) setBeatPulse(0);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [setBeatPulse]);
}
