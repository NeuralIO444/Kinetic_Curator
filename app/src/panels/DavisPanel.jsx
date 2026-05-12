// DavisPanel (P07) — evolve / favorite / curate workflow
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { useCollapse } from '../hooks/useCollapse.js';
import * as A from '../state/actions.js';

export function DavisPanel() {
  const { dispatch, palette } = useApp();
  const { state } = useApp(s => ({
    evolveMode: s.evolveMode,
    evolveSource: s.evolveSource,
    evolveTarget: s.evolveTarget,
    evolveInterval: s.evolveInterval,
    autoSnapshot: s.autoSnapshot,
    motionSmoothing: s.motionSmoothing,
    favorites: s.favorites,
    keyframePlay: s.keyframePlay,
    keyframeDuration: s.keyframeDuration,
    seed: s.seed,
    layoutParams: s.layoutParams,
    mode: s.mode,
  }));
  const { evolveMode, evolveSource, evolveTarget, evolveInterval, autoSnapshot, motionSmoothing, favorites, keyframePlay, keyframeDuration, seed, layoutParams, mode } = state;
  const isLive = mode === 'live';
  const { open, toggle } = useCollapse(false);

  const favoriteCurrent = () => {
    dispatch({
      type: A.ADD_FAVORITE,
      favorite: {
        seed,
        timestamp: new Date().toISOString().slice(11, 19),
        config: { layout: { ...layoutParams }, palette: { id: palette.id } },
      },
    });
  };

  return (
    <div className="panel panel-davis">
      <PanelHeader tag="P07" title="DAVIS MODE" subtitle={evolveMode ? 'evolving' : 'paused'} collapsed={!open} onToggle={toggle} />
      {open && (
        <div className="davis-body">
          <div className="davis-source-row">
            <span className="davis-label">TARGET</span>
            <select 
              value={evolveTarget} 
              onChange={e => dispatch({ type: A.SET_EVOLVE_TARGET, payload: e.target.value })}
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
            {['time', 'beat', 'motion'].map(s => {
              // beat + motion only available in LIVE mode (they need audio/webcam).
              const disabled = !isLive && (s === 'beat' || s === 'motion');
              return (
                <button
                  key={s}
                  className={`chip-btn ${evolveSource === s ? 'active' : ''}`}
                  onClick={() => !disabled && dispatch({ type: A.SET_EVOLVE_SOURCE, payload: s })}
                  disabled={disabled}
                  title={disabled ? 'LIVE mode only — turn on STUDIO/LIVE toggle in the masthead' : undefined}
                  style={disabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                >
                  {s.toUpperCase()}
                </button>
              );
            })}
            <button className="chip-btn" disabled style={{ opacity: 0.4, cursor: 'not-allowed' }} title="Coming Soon">MIDI</button>
            <button className="chip-btn" disabled style={{ opacity: 0.4, cursor: 'not-allowed' }} title="Coming Soon">OSC</button>
          </div>

          <div className="davis-interval-row">
            <span className="davis-label">INTERVAL</span>
            <input type="range" min={200} max={10000} step={100} value={evolveInterval}
              onChange={e => dispatch({ type: A.SET_EVOLVE_INTERVAL, payload: Number(e.target.value) })} />
            <span className="davis-readout">{(evolveInterval / 1000).toFixed(1)}s</span>
          </div>

          <div className="davis-interval-row" style={{ marginTop: '8px' }}>
            <span className="davis-label">AUTO-SNAP</span>
            <input type="checkbox" checked={autoSnapshot} onChange={e => dispatch({ type: A.SET_AUTO_SNAPSHOT, payload: e.target.checked })} />
            <span className="davis-readout" style={{ fontSize: '9px', opacity: 0.6 }}>(saves PNG on evolve)</span>
          </div>

          <div className="davis-interval-row" style={{ marginTop: '8px' }}>
            <span className="davis-label">SMOOTHING</span>
            <input type="checkbox" checked={motionSmoothing} onChange={e => dispatch({ type: A.SET_MOTION_SMOOTHING, payload: e.target.checked })} />
            <span className="davis-readout" style={{ fontSize: '9px', opacity: 0.6 }}>(fluid CSS transitions)</span>
          </div>

          <div className="davis-actions">
            <button className={`big-btn ${evolveMode ? 'active' : ''}`}
              onClick={() => dispatch({ type: A.SET_EVOLVE_MODE, payload: !evolveMode })}>
              {evolveMode ? '■ STOP' : '▶ EVOLVE'}
            </button>
            <button className={`big-btn ${autoSnapshot ? 'active' : ''}`}
              onClick={() => dispatch({ type: A.SET_AUTO_SNAPSHOT, payload: !autoSnapshot })}>
              {autoSnapshot ? '◉ AUTO-SNAP' : '○ AUTO-SNAP'}
            </button>
            <button className="big-btn" onClick={favoriteCurrent}>★ FAVORITE</button>
            <button className="big-btn" onClick={() => dispatch({ type: A.BUMP_SEED })}>⟳ NEW SEED</button>
          </div>
          <div className="davis-hint">
            <b>Evolve</b> runs generative engine · <b>Auto-Snap</b> captures every change
          </div>

          {favorites.length > 0 && (
            <div className="favorites-list">
              <div className="favorites-header">★ FAVORITES ({favorites.length})</div>
              {favorites.length >= 2 && isLive && (
                <div className="davis-interval-row" style={{ marginBottom: 6 }}>
                  <button
                    className={`big-btn ${keyframePlay ? 'active' : ''}`}
                    onClick={() => dispatch({ type: A.SET_KEYFRAME_PLAY, payload: !keyframePlay })}
                    style={{ flex: 1 }}
                  >
                    {keyframePlay ? '⏸ STOP PLAYBACK' : '▶ PLAY KEYFRAMES'}
                  </button>
                  <input
                    type="range"
                    min={500} max={10000} step={100}
                    value={keyframeDuration}
                    onChange={e => dispatch({ type: A.SET_KEYFRAME_DURATION, payload: Number(e.target.value) })}
                    title="Transition duration"
                    style={{ flex: 1 }}
                  />
                  <span className="davis-readout">{(keyframeDuration / 1000).toFixed(1)}s</span>
                </div>
              )}
              {favorites.map((f, i) => (
                <div key={i} className="fav-row">
                  <span className="fav-id">#{i + 1}</span>
                  <span className="fav-seed">{f.seed.toString(16)}</span>
                  <span className="fav-meta">{f.config?.layout?.mode || '—'} · {f.config?.palette?.id || '—'}</span>
                  <span className="fav-ts">{f.timestamp}</span>
                  <button className="micro-btn" onClick={() => dispatch({ type: A.RECALL_FAVORITE, favorite: f })}>↻</button>
                  <button className="micro-btn" onClick={() => dispatch({ type: A.REMOVE_FAVORITE, index: i })}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
