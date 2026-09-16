import { emit, Events } from '../../composition/eventBus.js';

const PHRASE_MODES = [
  { id: 'reset-seed', label: 'RESET', title: 'On wrap, seed returns to the armed origin.' },
  { id: 'cycle-seed', label: 'CYCLE', title: 'On wrap, seed becomes origin+1 and origin follows.' },
  { id: 'step-ca', label: 'CA', title: 'On wrap, step the CA grid. Only paints when layout is Cellular.' },
];

export function PhraseControls({
  phraseEnabled, phraseLength, phraseMode, phraseBeat, phraseProgress,
  layoutMode, audioEnabled, phraseClock = 'audio', phraseBpm = 120,
  beatPulse = 0, rms = 0,
}) {
  const caLive = layoutMode === 'ca';
  const metro = phraseClock === 'metro';
  const waiting = phraseEnabled && !metro && !audioEnabled;
  const noAttack = phraseEnabled && !metro && audioEnabled && phraseBeat === 0 && rms > 0.2;
  return (
    <div style={{ marginTop: 10, padding: '8px 6px', border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span className="davis-label" style={{ margin: 0 }} title="Counts a bar. Does not push SCALE/ALPHA — that is Stimuli.">PHRASE LOOP</span>
        <button
          className={`chip-btn ${phraseEnabled ? 'active' : ''}`}
          title={phraseEnabled ? 'Stop the bar.' : 'Arm the bar. AUDIO needs a clap; METRO ticks alone.'}
          onClick={() => emit(Events.DAVIS_PHRASE, { enabled: !phraseEnabled })}
          style={phraseEnabled ? { borderColor: '#00d9ff', color: '#00d9ff' } : {}}
        >
          {phraseEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="davis-source-row">
        <span className="davis-label">CLOCK</span>
        <button className={`chip-btn ${phraseClock === 'audio' ? 'active' : ''}`}
          title="Tick on a mic attack. Held noise is not a beat — you will see no attack."
          onClick={() => emit(Events.DAVIS_PHRASE, { clock: 'audio' })}>AUDIO</button>
        <button className={`chip-btn ${phraseClock === 'metro' ? 'active' : ''}`}
          title="Internal BPM. No mic."
          onClick={() => emit(Events.DAVIS_PHRASE, { clock: 'metro' })}>METRO</button>
      </div>
      {metro && (
        <div className="davis-interval-row" title="Metronome speed.">
          <span className="davis-label">BPM</span>
          <input type="range" min={40} max={240} step={1} value={phraseBpm}
            onChange={(e) => emit(Events.DAVIS_PHRASE, { bpm: Number(e.target.value) })} />
          <span className="davis-readout">{phraseBpm}</span>
        </div>
      )}
      <div className="davis-interval-row" title="Beats in the bar before wrap.">
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
              title={blocked ? 'CA wrap only affects the picture when layout mode is Cellular' : m.title}
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
            <span title={noAttack ? 'RMS is up but there was no rising edge. Clap, or use METRO.' : undefined}>
              {waiting
                ? 'waiting for beat · audio off'
                : noAttack
                  ? 'armed · no attack'
                  : metro
                    ? `METRO ${phraseBeat}/${phraseLength}`
                    : `BEAT ${phraseBeat}/${phraseLength}`}
            </span>
            <button className="micro-btn" title="Beat 0. RESET mode also homes the seed." onClick={() => emit(Events.DAVIS_RESET_PHRASE)}>RESET NOW</button>
          </div>
          <div style={{ position: 'relative', height: 4, background: 'var(--line-2)', borderRadius: 2, overflow: 'hidden' }}
            title="Bar fill = count. White pip = last audio attack.">
            <div style={{
              height: '100%', width: `${phraseProgress}%`,
              background: 'linear-gradient(90deg, #00d9ff, #00ff88)',
              transition: 'width 0.1s linear',
            }} />
            <div style={{
              position: 'absolute', top: 0, right: 0, width: 6, height: '100%',
              background: '#fff',
              opacity: metro ? 0 : Math.max(0, Math.min(1, beatPulse)),
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
