import * as A from '../../state/actions.js';

const PHRASE_MODES = [
  { id: 'reset-seed', label: 'RESET' },
  { id: 'cycle-seed', label: 'CYCLE' },
  { id: 'step-ca', label: 'CA' },
];

export function PhraseControls({ phraseEnabled, phraseLength, phraseMode, phraseBeat, phraseProgress, onDispatch }) {
  return (
    <div style={{ marginTop: 10, padding: '8px 6px', border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span className="davis-label" style={{ margin: 0 }}>PHRASE LOOP</span>
        <button
          className={`chip-btn ${phraseEnabled ? 'active' : ''}`}
          onClick={() => onDispatch({ type: A.SET_PHRASE_ENABLED, payload: !phraseEnabled })}
          style={phraseEnabled ? { borderColor: '#00d9ff', color: '#00d9ff' } : {}}
        >
          {phraseEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="davis-interval-row">
        <span className="davis-label">LENGTH</span>
        <input type="range" min={4} max={32} step={1} value={phraseLength || 8}
          onChange={e => onDispatch({ type: A.SET_PHRASE_LENGTH, payload: Number(e.target.value) })} />
        <span className="davis-readout">{phraseLength || 8} beats</span>
      </div>
      <div className="davis-source-row" style={{ marginTop: 4 }}>
        <span className="davis-label">MODE</span>
        {PHRASE_MODES.map(m => (
          <button key={m.id} className={`chip-btn ${phraseMode === m.id ? 'active' : ''}`}
            onClick={() => onDispatch({ type: A.SET_PHRASE_MODE, payload: m.id })}>
            {m.label}
          </button>
        ))}
      </div>
      {phraseEnabled && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--dim)', marginBottom: 3 }}>
            <span>BEAT {phraseBeat}/{phraseLength}</span>
            <button className="micro-btn" onClick={() => onDispatch({ type: A.RESET_PHRASE })}>RESET NOW</button>
          </div>
          <div style={{ height: 4, background: 'var(--line-2)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${phraseProgress}%`,
              background: 'linear-gradient(90deg, #00d9ff, #00ff88)',
              transition: 'width 0.1s linear',
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
