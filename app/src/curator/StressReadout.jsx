// StressReadout.jsx — #1354: the DEV-ONLY stress and band readout. It mounts only with ?debug=stress on the URL, so
// the shipped instrument has no extra chrome (roadmap: a dev overlay, never shipped). It shows measurements: the
// three signals, the smoothed stress and the band. Nothing reads the band yet (Phase 4).
import { useEffect, useState } from 'react';
import { getStressState } from './stressLive.js';
import { getFormationState, getLimbPairs } from './formationLive.js'; // #1355 step 3
import { FORM_HOLD_FRAMES, thresholdsFor } from './formation.js';

const pct = (v) => `${Math.round((Number.isFinite(v) ? v : 0) * 100)}`.padStart(3, ' ');

export function StressReadout() {
  const [s, setS] = useState(getStressState());
  const [f, setF] = useState(getFormationState());
  // The tracker is a module singleton with no subscription API: a light poll keeps the readout current.
  useEffect(() => {
    const id = setInterval(() => { setS(getStressState()); setF(getFormationState()); }, 200);
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
      {/* #1355 step 3 — one line per pin: the two conditions against this band's thresholds, and the hold. */}
      {(f.states || []).map((p, i) => {
        if (!p) return null;
        const t = thresholdsFor(f.band);
        const state = p.formed ? 'FORMED' : `spore ${String(p.hold).padStart(2, ' ')}/${FORM_HOLD_FRAMES}`;
        const pairs = p.formed ? `  wings x${(getLimbPairs()[i] || 1) * 2}` : '';
        return `\npin ${i + 1}  attract ${pct(p.attraction)}/${pct(t.attraction)}  crowd ${pct(p.density)}/${pct(t.density)}  ${state}${pairs}`;
      })}
    </div>
  );
}
