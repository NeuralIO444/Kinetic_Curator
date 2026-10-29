// TrailReadout.jsx — #1807: the DEV-ONLY buffer-statistics readout. It mounts only with ?debug=stats on
// the URL (the StressReadout/AgeReadout pattern), so the shipped instrument has no extra chrome. While it
// is mounted the live loop requests the ACCUM buffer statistics (statsLive.mjs) and this shows them as
// measured numbers — trail energy, the channel means, saturation pressure — with the reading's frame
// stamp and its age against the loop's step count, because a stat without its staleness is a claim, not
// a measurement. The pressure governor's (data-only) report rides below. Davis-continuous territory
// rendered as plain digits: these are readings, and readings are TE.
import { useEffect, useState } from 'react';
import { getStatsGovernorReport, getStatsSnapshot } from '../gl/statsLive.mjs';
import { STALE_MAX_FRAMES } from './trailStats.js';

const f3 = (v) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(3) : '—');

export function TrailReadout() {
  const [view, setView] = useState({ snap: null, gov: null });

  // The stats wire is a registered snapshot with no subscription API: a
  // light poll keeps the readout current (the AgeReadout pattern).
  useEffect(() => {
    const tick = () => setView({ snap: getStatsSnapshot(), gov: getStatsGovernorReport() });
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, []);

  const { snap, gov } = view;
  const st = snap && snap.stats ? snap.stats : null;
  const age = st ? snap.frame - st.frame : null;
  const stale = age !== null && age > STALE_MAX_FRAMES;

  return (
    <div
      role="status"
      aria-label="Trail statistics (debug)"
      style={{
        position: 'fixed',
        right: 12,
        bottom: 44,
        zIndex: 9999,
        padding: '8px 10px',
        background: 'rgba(12,12,14,0.92)',
        border: '1px solid rgba(255,255,255,0.18)',
        font: '11px ui-monospace, Menlo, monospace',
        color: '#e8e8ea',
        whiteSpace: 'pre',
      }}
    >
      {st ? (
        <>
          <div>{`TRAIL  energy ${f3(st.energy)}  rgb ${f3(st.channels[0])} ${f3(st.channels[1])} ${f3(st.channels[2])}`}</div>
          <div>{`SAT    pressure ${f3(st.saturation)}  (pixels above the #1801 knee)`}</div>
          <div>{`STAMP  frame ${st.frame}  age ${age} frame${age === 1 ? '' : 's'}${stale ? '  STALE' : ''}`}</div>
        </>
      ) : (
        <div>{'TRAIL  no statistics (ACCUM off, or first reading not yet due)'}</div>
      )}
      {gov ? (
        <div>{`GOV    ${gov.enabled ? 'ACTUATING' : 'data-only'}  scale ${f3(gov.scale)}  obs ${gov.observations}  sheds ${gov.sheds.length}  stale ${gov.stale.length}`}</div>
      ) : null}
    </div>
  );
}
