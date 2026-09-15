import { emit, Events } from '../../composition/eventBus.js';

export function EvolveControls({ evolveTarget, evolveSource, evolveInterval, autoSnapshot, motionSmoothing }) {
  return (
    <>
      <div className="davis-source-row">
        <span className="davis-label">TARGET</span>
        <select
          value={evolveTarget}
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
        {['time', 'beat'].map(s => (
          <button key={s} className={`chip-btn ${evolveSource === s ? 'active' : ''}`}
            onClick={() => emit(Events.DAVIS_EVOLVE, { source: s })}>
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="davis-interval-row" style={evolveSource !== 'time' ? { opacity: 0.4 } : undefined}>
        <span className="davis-label">INTERVAL</span>
        <input type="range" min={200} max={10000} step={100} value={evolveInterval}
          disabled={evolveSource !== 'time'}
          title={evolveSource !== 'time' ? 'Interval applies when SOURCE is TIME' : undefined}
          onChange={e => emit(Events.DAVIS_EVOLVE, { interval: Number(e.target.value) })} />
        <span className="davis-readout">{(evolveInterval / 1000).toFixed(1)}s</span>
      </div>

      <div className="davis-interval-row" style={{ marginTop: '8px' }}>
        <span className="davis-label">AUTO-SNAP</span>
        <input type="checkbox" checked={autoSnapshot} onChange={e => emit(Events.DAVIS_EVOLVE, { autoSnapshot: e.target.checked })} />
      </div>
      <div className="davis-interval-row" style={{ marginTop: '4px' }}>
        <span className="davis-label">SMOOTHING</span>
        <input type="checkbox" checked={motionSmoothing} onChange={e => emit(Events.DAVIS_EVOLVE, { motionSmoothing: e.target.checked })} />
      </div>
    </>
  );
}
