// RefineDial.jsx — the tuning dial for refine mutations (#1144, Matt's "C"). TEMPORARY: it only mounts when the URL
// carries ?tune=refine, so the shipped instrument has no extra chrome. It reads the live phase (a measured state) and
// drives the module-level spread that curateUnlocked reads. When Matt has felt out the value, the shipped default is a
// one-line change in refineMutate.js and this file is deleted.
import { useEffect, useState } from 'react';
import { getRefineSpread, setRefineSpread } from './refineSpread.js';
import { MIN_SPREAD, MAX_SPREAD, DEFAULT_SPREAD } from './refineMutate.js';
import { getPhase } from './phase.js';
import { RangeRow } from '../components/RangeRow.jsx';

export function RefineDial() {
  const [value, setValue] = useState(getRefineSpread());
  const [phase, setPhase] = useState(getPhase());
  // The phase is a module singleton (no subscription API): a light poll keeps the readout honest.
  useEffect(() => {
    const id = setInterval(() => setPhase(getPhase()), 250);
    return () => clearInterval(id);
  }, []);
  const refining = phase === 'refine';
  return (
    <div
      role="group"
      aria-label="Refine spread (tuning)"
      style={{
        position: 'fixed', left: 12, bottom: 44, zIndex: 9999, padding: '8px 10px',
        background: 'rgba(12,12,14,0.92)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 6,
        font: '11px ui-monospace, Menlo, monospace', color: '#e8e8ea', minWidth: 220,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <span>REFINE SPREAD {value.toFixed(2)}</span>
        <span style={{ color: refining ? '#ffb347' : '#8a8a90' }}>{refining ? 'refine: active' : `phase: ${phase || 'none'}`}</span>
      </div>
      <RangeRow
        label="spread"
        value={value}
        min={MIN_SPREAD}
        max={MAX_SPREAD}
        step={0.01}
        defaultValue={DEFAULT_SPREAD}
        readout={value.toFixed(2)}
        hint="How far a refine variation may wander from the keep. Double-click resets."
        ariaLabel="Refine spread"
        onChange={(v) => setValue(setRefineSpread(v))}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#8a8a90', marginTop: 2 }}>
        <span>tight</span>
        <span>wide</span>
      </div>
    </div>
  );
}
