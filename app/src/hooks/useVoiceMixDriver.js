// useVoiceMixDriver (#280) — advances an in-flight voice MIX toward t=1.
//
// The mix itself is render-side (the live loop interpolates via
// resolveLiveRenderState); this driver just moves the blend position and
// commits the target when the dissolve completes. Mounted once in App.

import { useEffect } from 'react';
import { useStore } from '../state/store.js';

export function useVoiceMixDriver() {
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const s = useStore.getState();
      const mix = s.voiceMix;
      if (!mix || !mix.auto) return;
      const t = Math.min(1, (performance.now() - mix.startedAt) / mix.durationMs);
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
