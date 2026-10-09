// useMetroPulse — the BEAT dial's honest pulse (#1144). While the artist has the metro on, the instrument is running
// and audio is not the beat, fire `onBeat` (the SAME callback an audio onset fires: one attack, one ordered spike,
// routed through the beat arbiter) once per beat at the dialed BPM. Audio on, paused, or the switch off: no timer at all.
import { useEffect } from 'react';
import { metroIntervalMs, metroRunning } from '../gl/beatClock.mjs';

export function useMetroPulse({ beatMetro, audioEnabled, running, beatBpm, onBeat }) {
  const on = metroRunning({ beatMetro, audioEnabled, running });
  useEffect(() => {
    if (!on) return undefined;
    const id = setInterval(() => {
      // test hook (same shape as __KC_EXPOSE_STORE): count the attacks, which a starved CI page cannot read back from a decaying value
      if (typeof window !== 'undefined' && window.__KC_EXPOSE_STORE === true) window.__kcMetroBeats = (window.__kcMetroBeats || 0) + 1;
      onBeat();
    }, metroIntervalMs(beatBpm));
    return () => clearInterval(id);
  }, [on, beatBpm, onBeat]);
}
