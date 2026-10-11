// StressReadout.jsx — #1354: the DEV-ONLY stress and band readout. It mounts only with ?debug=stress on the URL, so
// the shipped instrument has no extra chrome (roadmap: a dev overlay, never shipped). It shows measurements: the
// three signals, the smoothed stress and the band. Nothing reads the band yet (Phase 4).
import { useEffect, useState } from 'react';
import { getStressState } from './stressLive.js';

const pct = (v) => `${Math.round((Number.isFinite(v) ? v : 0) * 100)}`.padStart(3, ' ');

export function StressReadout() {
  const [s, setS] = useState(getStressState());
  // The tracker is a module singleton with no subscription API: a light poll keeps the readout current.
  useEffect(() => {
    const id = setInterval(() => setS(getStressState()), 200);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      role="status"
      aria-label="Stress and band (debug)"
      style={{
        position: 'fixed', right: 12, bottom: 44, zIndex: 9999, padding: '8px 10px', whiteSpace: 'pre',
        background: 'rgba(12,12,14,0.92)', border: '1px solid rgba(255,255,255,0.18)',
        font: '11px ui-monospace, Menlo, monospace', color: '#e8e8ea',
      }}
    >
      {`STRESS ${pct(s.smoothed)}  BAND ${s.band || 'none'}\nactivity ${pct(s.activity)}  dish ${pct(s.dish)}  taste ${pct(s.taste)}`}
    </div>
  );
}
