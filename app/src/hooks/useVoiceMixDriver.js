// useVoiceMixDriver (#280) — advances an in-flight voice MIX toward t=1.
//
// The mix itself is render-side (the live loop interpolates via
// resolveLiveRenderState); this driver just moves the blend position and
// commits the target when the dissolve completes. Mounted once in App.

import { useEffect } from 'react';
import { useStore } from '../state/store.js';
import { loopClock } from '../gl/loopClock.js';

export function useVoiceMixDriver() {
  useEffect(() => {
    let raf = 0;
    // Ticks spent observing a dissolve that can never start (engine held,
    // t still 0). We hold the bar for a short beat before cutting so it
    // paints and the name is readable — then cut to the target.
    // (20 rAF ticks ≈ 1/3s at 60fps; the e2e polls on rAF too.)
    let heldTicks = 0;
    const HELD_CUT_TICKS = 20;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const s = useStore.getState();
      const mix = s.voiceMix;
      if (!mix || !mix.auto) { heldTicks = 0; return; }
      // #806: the dissolve rides the loop clock — but a dissolve needs presented
      // frames. If the engine is held (paused / watchdog trip) the loop clock is
      // frozen, so a dissolve that never started can never progress: cut to the
      // target instead of hanging the mix-bar forever. A dissolve already in
      // flight (t > 0) keeps holding per the freeze-holds-dissolve law and
      // resumes when the engine does. No wall clock here — this is a held-clock
      // cut, not a wall timeout.
      if (!s.running && mix.t <= 0) {
        if (++heldTicks >= HELD_CUT_TICKS) s.commitVoiceMix();
        return;
      }
      heldTicks = 0;
      // #806: MIX dissolve is a must-loop performer — advance off the loop
      // clock, not wall clock, so a freeze/pause holds the dissolve instead
      // of completing it invisibly. Unobserved clock (<= 0) holds at t=0.
      const nowMs = loopClock.ms > 0 ? loopClock.ms : mix.startedAt;
      const t = Math.min(1, Math.max(0, nowMs - mix.startedAt) / mix.durationMs);
      if (t >= 1) {
        // commitVoiceMix is a plain store action — no setState-in-effect.
        s.commitVoiceMix();
        return;
      }
      // advanceVoiceMix (not setVoiceMixT): the driver's own writes must not
      // pause the auto-advance it is driving.
      s.advanceVoiceMix(t);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}
