import { emit, Events } from '../../composition/eventBus.js';

export function MorphControls({ morphEvolve, morphDurationMs, morphing }) {
  return (
    <div style={{ marginTop: 8, padding: '8px 6px', border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span className="davis-label" style={{ margin: 0 }}>MORPH EVOLVE</span>
        <button
          className={`chip-btn ${morphEvolve ? 'active' : ''}`}
          onClick={() => emit(Events.DAVIS_MORPH, { enabled: !morphEvolve })}
          style={morphEvolve ? { borderColor: '#c084fc', color: '#c084fc' } : {}}
        >
          {morphEvolve ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="davis-interval-row" style={morphEvolve ? undefined : { opacity: 0.4 }}
        title={morphEvolve ? 'Seconds for layout targets to ease in.' : 'Dead while MORPH EVOLVE is off. It only shapes the ease.'}>
        <span className="davis-label">DURATION</span>
        <input
          type="range" min={300} max={4000} step={100} value={morphDurationMs || 1200}
          disabled={!morphEvolve}
          title={morphEvolve ? 'Seconds for layout targets to ease in.' : 'Dead while MORPH EVOLVE is off. It only shapes the ease.'}
          onChange={e => emit(Events.DAVIS_MORPH_DURATION, { duration: Number(e.target.value) })}
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
