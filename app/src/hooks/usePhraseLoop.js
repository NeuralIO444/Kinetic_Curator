// usePhraseLoop — performable generative phrase / loop clock
// Advances on each beat when phrase is enabled. At phrase boundary,
// applies phraseMode: reset-seed | step-ca | cycle-seed.

import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';

export function usePhraseLoop() {
  const phraseEnabled = useStore(s => s.phraseEnabled);
  const phraseLength = useStore(s => s.phraseLength);
  const phraseMode = useStore(s => s.phraseMode);
  const beatPulse = useStore(s => s.beatPulse);
  const audioEnabled = useStore(s => s.audioEnabled);

  const prevPulseRef = useRef(0);
  const armedRef = useRef(false);

  // Arm: capture origin seed when phrase is turned on
  useEffect(() => {
    if (phraseEnabled && !armedRef.current) {
      const seed = useStore.getState().seed;
      useStore.getState().armPhrase(seed);
      armedRef.current = true;
    }
    if (!phraseEnabled) {
      armedRef.current = false;
    }
  }, [phraseEnabled]);

  // Detect beat rising edge (pulse jumps up)
  useEffect(() => {
    if (!phraseEnabled || !audioEnabled) return;

    const prev = prevPulseRef.current;
    prevPulseRef.current = beatPulse;

    // Rising edge: pulse increased significantly
    if (beatPulse > prev + 0.2 && beatPulse > 0.3) {
      useStore.getState().tickPhraseBeat();
    }
  }, [beatPulse, phraseEnabled, audioEnabled, phraseLength, phraseMode]);
}
