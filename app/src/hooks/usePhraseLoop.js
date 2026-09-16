// usePhraseLoop — phrase clock. Audio rising edge or internal metro.
import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';

export function usePhraseLoop() {
  const phraseEnabled = useStore(s => s.phraseEnabled);
  const phraseLength = useStore(s => s.phraseLength);
  const phraseMode = useStore(s => s.phraseMode);
  const phraseClock = useStore(s => s.phraseClock || 'audio');
  const phraseBpm = useStore(s => s.phraseBpm || 120);
  const beatPulse = useStore(s => s.beatPulse);
  const audioEnabled = useStore(s => s.audioEnabled);

  const prevPulseRef = useRef(0);
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

  useEffect(() => {
    if (!phraseEnabled || phraseClock === 'metro' || !audioEnabled) return;
    const prev = prevPulseRef.current;
    prevPulseRef.current = beatPulse;
    if (beatPulse > prev + 0.2 && beatPulse > 0.3) {
      useStore.getState().tickPhraseBeat();
    }
  }, [beatPulse, phraseEnabled, audioEnabled, phraseClock, phraseLength, phraseMode]);
}
