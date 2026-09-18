// usePhraseLoop — phrase clock. Arms the origin seed on enable; ticks on the
// internal metro. AUDIO-clock ticks no longer ride the beatPulse rising edge:
// App.jsx `onBeat` routes every mic attack through the beat arbiter
// (`app/src/state/beatArbiter.js`), which ticks the phrase directly — one
// attack, one ordered spike, no re-render race. beatPulse is readout-only now.
import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';

export function usePhraseLoop() {
  const phraseEnabled = useStore(s => s.phraseEnabled);
  const phraseLength = useStore(s => s.phraseLength);
  const phraseMode = useStore(s => s.phraseMode);
  const phraseClock = useStore(s => s.phraseClock || 'audio');
  const phraseBpm = useStore(s => s.phraseBpm || 120);

  const armedRef = useRef(false);

  useEffect(() => {
    if (phraseEnabled && !armedRef.current) {
      const seed = useStore.getState().seed;
      useStore.getState().armPhrase(seed);
      armedRef.current = true;
    }
    if (!phraseEnabled) armedRef.current = false;
  }, [phraseEnabled]);

  useEffect(() => {
    if (!phraseEnabled || phraseClock !== 'metro') return undefined;
    const bpm = Math.max(40, Math.min(240, Number(phraseBpm) || 120));
    const id = setInterval(() => {
      useStore.getState().tickPhraseBeat();
    }, 60000 / bpm);
    return () => clearInterval(id);
  }, [phraseEnabled, phraseClock, phraseBpm, phraseLength, phraseMode]);
}
