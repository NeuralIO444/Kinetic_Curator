import { emit, Events } from '../../composition/eventBus.js';

const PHRASE_MODES = [
  { id: 'reset-seed', label: 'RESET' },
  { id: 'cycle-seed', label: 'CYCLE' },
  { id: 'step-ca', label: 'CA' },
];

export function PhraseControls({
  phraseEnabled, phraseLength, phraseMode, phraseBeat, phraseProgress,
  layoutMode, audioEnabled, phraseClock = 'audio', phraseBpm = 120,
}) {
  const caLive = layoutMode === 'ca';
  const metro = phraseClock === 'metro';
  const waiting = phraseEnabled && !metro && !audioEnabled;
  return (
    <div style={{ marginTop: 10, padding: '8px 6px', border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span className="davis-label" style={{ margin: 0 }}>PHRASE LOOP</span>
        <button
          className={`chip-btn ${phraseEnabled ? 'active' : ''}`}
          onClick={() => emit(Events.DAVIS_PHRASE, { enabled: !phraseEnabled })}
          style={phraseEnabled ? { borderColor: '#00d9ff', color: '#00d9ff' } : {}}
        >
          {phraseEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="davis-source-row">
        <span className="davis-label">CLOCK</span>
        {['audio', 'metro'].map((c) => (
          <button
            key={c}
            className={`chip-btn ${phraseClock === c ? 'active' : ''}`}
            onClick={() => emit(Events.DAVIS_PHRASE, { clock: c })}
          >
            {c.toUpperCase()}
          </button>
        ))}
      </div>
      {metro && (
        <div className="davis-interval-row">
          <span className="davis-label">BPM</span>
          <input type="range" min={40} max={240} step={1} value={phraseBpm}
            onChange={(e) => emit(Events.DAVIS_PHRASE, { bpm: Number(e.target.value) })} />
          <span className="davis-readout">{phraseBpm}</span>
        </div>
      )}
      <div className="davis-interval-row">
        <span className="davis-label">LENGTH</span>
        <input type="range" min={4} max={32} step={1} value={phraseLength || 8}
          onChange={e => emit(Events.DAVIS_PHRASE, { length: Number(e.target.value) })} />
        <span className="davis-readout">{phraseLength || 8} beats</span>
      </div>
      <div className="davis-source-row" style={{ marginTop: 4 }}>
        <span className="davis-label">MODE</span>
        {PHRASE_MODES.map(m => {
          const blocked = m.id === 'step-ca' && !caLive;
          return (
            <button
              key={m.id}
              className={`chip-btn ${phraseMode === m.id ? 'active' : ''}`}
              disabled={blocked}
              title={blocked ? 'CA wrap only affects the picture when layout mode is Cellular' : undefined}
              onClick={() => { if (!blocked) emit(Events.DAVIS_PHRASE, { mode: m.id }); }}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      {phraseEnabled && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--dim)', marginBottom: 3 }}>
            <span>
              {waiting
                ? 'waiting for beat · audio off'
                : metro
                  ? `METRO ${phraseBeat}/${phraseLength}`
                  : `BEAT ${phraseBeat}/${phraseLength}`}
            </span>
            <button className="micro-btn" onClick={() => emit(Events.DAVIS_RESET_PHRASE)}>RESET NOW</button>
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
