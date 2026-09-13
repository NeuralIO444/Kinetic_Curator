import * as A from '../../state/actions.js';

export function EvolveControls({ evolveTarget, evolveSource, evolveInterval, autoSnapshot, motionSmoothing, evolveMode, onDispatch }) {
  return (
    <>
      <div className="davis-source-row">
        <span className="davis-label">TARGET</span>
        <select
          value={evolveTarget}
          onChange={e => onDispatch({ type: A.SET_EVOLVE_TARGET, payload: e.target.value })}
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
            onClick={() => onDispatch({ type: A.SET_EVOLVE_SOURCE, payload: s })}>
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="davis-interval-row">
        <span className="davis-label">INTERVAL</span>
        <input type="range" min={200} max={10000} step={100} value={evolveInterval}
          onChange={e => onDispatch({ type: A.SET_EVOLVE_INTERVAL, payload: Number(e.target.value) })} />
        <span className="davis-readout">{(evolveInterval / 1000).toFixed(1)}s</span>
      </div>

      <div className="davis-interval-row" style={{ marginTop: '8px' }}>
        <span className="davis-label">AUTO-SNAP</span>
        <input type="checkbox" checked={autoSnapshot} onChange={e => onDispatch({ type: A.SET_AUTO_SNAPSHOT, payload: e.target.checked })} />
      </div>
      <div className="davis-interval-row" style={{ marginTop: '4px' }}>
        <span className="davis-label">SMOOTHING</span>
        <input type="checkbox" checked={motionSmoothing} onChange={e => onDispatch({ type: A.SET_MOTION_SMOOTHING, payload: e.target.checked })} />
      </div>
    </>
  );
}
