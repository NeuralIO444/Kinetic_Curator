import * as A from '../../state/actions.js';

export function MorphControls({ morphEvolve, morphDurationMs, morphing, onDispatch }) {
  return (
    <div style={{ marginTop: 8, padding: '8px 6px', border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span className="davis-label" style={{ margin: 0 }}>MORPH EVOLVE</span>
        <button
          className={`chip-btn ${morphEvolve ? 'active' : ''}`}
          onClick={() => onDispatch({ type: A.SET_MORPH_EVOLVE, payload: !morphEvolve })}
          style={morphEvolve ? { borderColor: '#c084fc', color: '#c084fc' } : {}}
        >
          {morphEvolve ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="davis-interval-row">
        <span className="davis-label">DURATION</span>
        <input
          type="range" min={300} max={4000} step={100} value={morphDurationMs || 1200}
          onChange={e => onDispatch({ type: A.SET_MORPH_DURATION, payload: Number(e.target.value) })}
        />
        <span className="davis-readout">{((morphDurationMs || 1200) / 1000).toFixed(1)}s</span>
      </div>
      <div className="davis-hint" style={{ marginTop: 4, fontSize: 9 }}>
        Layout targets ease instead of hard-jump. Seed/palette still discrete.
        {morphing && <span style={{ color: '#c084fc' }}> · morphing now</span>}
      </div>
    </div>
  );
}
