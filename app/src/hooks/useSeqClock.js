// useSeqClock — the sequencer's clock. Drives the playhead on the SHARED
// phrase BPM (Matt's decision: one tempo for everything) via the same
// freeze-safe accumulator the phrase metro uses: loopIntervalTick on the
// loop clock holds through a freeze and fires at most once per threshold
// crossing on thaw (decision 6: hold and resume).
//
// Slice seq-clocked wires the metro source; seq-clock-sources adds the
// phrase/audio/euclid picker. The hook only fires when seqPlaying and the
// clock source is metro.

import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';
import { loopClock, loopIntervalTick } from '../gl/loopClock.js';
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

export function useSeqClock() {
  const seqPlaying = useStore((s) => s.seqPlaying);
  const seqClock = useStore((s) => s.seqClock);
  const phraseBpm = useStore((s) => s.phraseBpm);

  const liveRef = useRef({ seqPlaying, seqClock, phraseBpm });
  useEffect(() => {
    liveRef.current = { seqPlaying, seqClock, phraseBpm };
  });

  useEffect(() => {
    let raf = 0;
    let lastTick = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const { seqPlaying, seqClock, phraseBpm } = liveRef.current;
      // Only the metro source lives here; anything else re-arms the
      // accumulator so a source switch lands on the downbeat.
      if (!seqPlaying || seqClock !== 'metro') {
        lastTick = -1;
        return;
      }
      const acc = loopIntervalTick(lastTick, loopClock.ms, seqStepMs(phraseBpm));
      lastTick = acc.lastFire;
      if (acc.fire) fireSeqStep();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}
