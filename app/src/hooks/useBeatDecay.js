// useBeatDecay — exponential decay of beatPulse so hits feel musical

import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';

const DECAY = 0.90; // per frame at ~60fps → ~100ms half-life feel

export function useBeatDecay() {
  const setBeatPulse = useStore(s => s.setBeatPulse);
  const rafRef = useRef(null);

  useEffect(() => {
    const tick = () => {
      setBeatPulse(p => (p > 0.002 ? p * DECAY : 0));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [setBeatPulse]);
}
