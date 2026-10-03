// useSeqClock — the sequencer's clock. Drives the playhead from one of four
// sources (Matt's clock-source picker), all through the existing phrase
// machinery:
//
// - metro:  rAF + loopIntervalTick on the loop-clock mirror at the shared
//           phrase BPM (the same primitive the phrase metro uses).
// - phrase: watches phraseWrapGen — steps once per phrase wrap.
// - audio:  stepped from App.jsx's onBeat (every detected mic attack).
// - euclid: metro ticks gated by euclidHit — hits step, misses are rests.
//
// All interval sources are freeze-safe: loopIntervalTick holds on a held
// clock and fires at most once per threshold crossing on thaw (decision 6:
// hold and resume). Switching sources re-arms the accumulator so the new
// source lands on the downbeat.

import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';
import { loopClock, loopIntervalTick } from '../gl/loopClock.js';
import { euclidHit } from '../state/euclid.js';
import { seqStepMs } from '../state/seqEngine.mjs';
import { emit, Events } from '../composition/eventBus.js';

/** One sequencer step: advance the playhead, fire the gap's transition. */
export function fireSeqStep() {
  const res = useStore.getState().seqStep();
  if (!res || res.stopped || !res.favorite) return false;
  emit(Events.DAVIS_FAVORITE, {
    action: res.mode === 'cut' ? 'recall' : 'morph',
    favorite: res.favorite,
  });
  return true;
}

export const SEQ_CLOCKS = ['metro', 'phrase', 'audio', 'euclid'];
export const SEQ_CLOCK_LABELS = { metro: 'MTR', phrase: 'PHR', audio: 'AUD', euclid: 'EUC' };

export function useSeqClock() {
  const seqPlaying = useStore((s) => s.seqPlaying);
  const seqClock = useStore((s) => s.seqClock);
  const phraseBpm = useStore((s) => s.phraseBpm);
  const phraseWrapGen = useStore((s) => s.phraseWrapGen);
  const euclidBeats = useStore((s) => s.euclidBeats);
  const euclidSteps = useStore((s) => s.euclidSteps);
  const euclidRotate = useStore((s) => s.euclidRotate);

  const liveRef = useRef({ seqPlaying, seqClock, phraseBpm, euclidBeats, euclidSteps, euclidRotate });
  useEffect(() => {
    liveRef.current = { seqPlaying, seqClock, phraseBpm, euclidBeats, euclidSteps, euclidRotate };
  });

  // Interval sources: metro steps every tick, euclid steps on hits only.
  useEffect(() => {
    let raf = 0;
    let lastTick = -1;
    let euclidStep = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const { seqPlaying, seqClock, phraseBpm, euclidBeats, euclidSteps, euclidRotate } = liveRef.current;
      // Only interval sources live here; anything else re-arms so a source
      // switch lands on the downbeat.
      if (!seqPlaying || (seqClock !== 'metro' && seqClock !== 'euclid')) {
        lastTick = -1;
        euclidStep = 0;
        return;
      }
      const acc = loopIntervalTick(lastTick, loopClock.ms, seqStepMs(phraseBpm));
      lastTick = acc.lastFire;
      if (!acc.fire) return;
      if (seqClock === 'euclid') {
        const hit = euclidHit(euclidStep, euclidBeats, euclidSteps, euclidRotate);
        euclidStep += 1;
        if (!hit) return; // miss = rest
      }
      fireSeqStep();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Phrase source: step once per phrase wrap.
  const lastWrapRef = useRef(phraseWrapGen);
  useEffect(() => {
    if (phraseWrapGen === lastWrapRef.current) return;
    lastWrapRef.current = phraseWrapGen;
    const { seqPlaying, seqClock } = liveRef.current;
    if (seqPlaying && seqClock === 'phrase') fireSeqStep();
  }, [phraseWrapGen]);
}
