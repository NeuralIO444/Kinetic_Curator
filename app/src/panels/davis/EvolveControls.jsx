import { emit, Events } from '../../composition/eventBus.js';

export function EvolveControls({ evolveTarget, evolveSource, evolveInterval, autoSnapshot, motionSmoothing }) {
  return (
    <>
      <div className="davis-source-row" title="What jumps when Evolve fires.">
        <span className="davis-label">TARGET</span>
        <select
          value={evolveTarget}
          title="What jumps when Evolve fires."
          onChange={e => emit(Events.DAVIS_EVOLVE, { target: e.target.value })}
          style={{ padding: '4px', fontSize: '10px', background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)', flex: 1 }}
        >
          <option value="seed">Seed Only</option>
          <option value="layout">Layout Params</option>
          <option value="palette">Palette</option>
          <option value="all">All Parameters</option>
        </select>
      </div>

      <div className="davis-source-row">
        <span className="davis-label">SOURCE</span>
        <button className={`chip-btn ${evolveSource === 'time' ? 'active' : ''}`}
          title="Fire Evolve on INTERVAL. No mic."
          onClick={() => emit(Events.DAVIS_EVOLVE, { source: 'time' })}>TIME</button>
        <button className={`chip-btn ${evolveSource === 'beat' ? 'active' : ''}`}
          title="Fire Evolve on a mic attack. Same edge as phrase AUDIO. INTERVAL is ignored."
          onClick={() => emit(Events.DAVIS_EVOLVE, { source: 'beat' })}>BEAT</button>
      </div>

      <div className="davis-interval-row" style={evolveSource !== 'time' ? { opacity: 0.4 } : undefined}
        title={evolveSource !== 'time' ? 'Dead while SOURCE is BEAT. Switch to TIME.' : 'Seconds between Evolve fires.'}>
        <span className="davis-label">INTERVAL</span>
        <input type="range" min={200} max={10000} step={100} value={evolveInterval}
          disabled={evolveSource !== 'time'}
          title={evolveSource !== 'time' ? 'Dead while SOURCE is BEAT. Switch to TIME.' : 'Seconds between Evolve fires.'}
          onChange={e => emit(Events.DAVIS_EVOLVE, { interval: Number(e.target.value) })} />
        <span className="davis-readout">{(evolveInterval / 1000).toFixed(1)}s</span>
      </div>

      <div className="davis-interval-row" style={{ marginTop: '8px' }} title="Snapshot a hit after Evolve, not after phrase wrap.">
        <span className="davis-label">AUTO-SNAP</span>
        <input type="checkbox" checked={autoSnapshot} title="Snapshot a hit after Evolve, not after phrase wrap." onChange={e => emit(Events.DAVIS_EVOLVE, { autoSnapshot: e.target.checked })} />
      </div>
      <div className="davis-interval-row" style={{ marginTop: '4px' }} title="CSS ease on morph only. Does not smooth the life LFO.">
        <span className="davis-label">SMOOTHING</span>
        <input type="checkbox" checked={motionSmoothing} title="CSS ease on morph only. Does not smooth the life LFO." onChange={e => emit(Events.DAVIS_EVOLVE, { motionSmoothing: e.target.checked })} />
      </div>
    </>
  );
}
