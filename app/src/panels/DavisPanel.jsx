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
    seed: s.seed,
    layoutParams: s.layoutParams,
    phraseEnabled: s.phraseEnabled,
    phraseLength: s.phraseLength,
    phraseMode: s.phraseMode,
    phraseBeat: s.phraseBeat,
    morphEvolve: s.morphEvolve,
    morphDurationMs: s.morphDurationMs,
    morphing: s.morphing,
  }));
  const {
    evolveMode, evolveSource, evolveTarget, evolveInterval, autoSnapshot,
    motionSmoothing, favorites, seed, layoutParams,
    phraseEnabled, phraseLength, phraseMode, phraseBeat,
    morphEvolve, morphDurationMs, morphing,
  } = state;
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

  const phraseProgress = phraseLength > 0 ? (phraseBeat / phraseLength) * 100 : 0;

  return (
    <div className="panel panel-davis">
      <PanelHeader
        tag="P07"
        title="DAVIS MODE"
        subtitle={morphing ? 'morphing…' : phraseEnabled ? `phrase ${phraseBeat}/${phraseLength}` : evolveMode ? 'evolving' : 'paused'}
        collapsed={!open}
        onToggle={toggle}
      />
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
            {['time', 'beat'].map(s => (
              <button key={s} className={`chip-btn ${evolveSource === s ? 'active' : ''}`}
                onClick={() => dispatch({ type: A.SET_EVOLVE_SOURCE, payload: s })}>
                {s.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="davis-interval-row">
            <span className="davis-label">INTERVAL</span>
            <input type="range" min={200} max={10000} step={100} value={evolveInterval}
              onChange={e => dispatch({ type: A.SET_EVOLVE_INTERVAL, payload: Number(e.target.value) })} />
            <span className="davis-readout">{(evolveInterval / 1000).toFixed(1)}s</span>
          </div>

          {/* Morph */}
          <div style={{ marginTop: 8, padding: '8px 6px', border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span className="davis-label" style={{ margin: 0 }}>MORPH EVOLVE</span>
              <button
                className={`chip-btn ${morphEvolve ? 'active' : ''}`}
                onClick={() => dispatch({ type: A.SET_MORPH_EVOLVE, payload: !morphEvolve })}
                style={morphEvolve ? { borderColor: '#c084fc', color: '#c084fc' } : {}}
              >
                {morphEvolve ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="davis-interval-row">
              <span className="davis-label">DURATION</span>
              <input
                type="range" min={300} max={4000} step={100} value={morphDurationMs || 1200}
                onChange={e => dispatch({ type: A.SET_MORPH_DURATION, payload: Number(e.target.value) })}
              />
              <span className="davis-readout">{((morphDurationMs || 1200) / 1000).toFixed(1)}s</span>
            </div>
            <div className="davis-hint" style={{ marginTop: 4, fontSize: 9 }}>
              Layout targets ease instead of hard-jump. Seed/palette still discrete.
              {morphing && <span style={{ color: '#c084fc' }}> · morphing now</span>}
            </div>
          </div>

          {/* Phrase */}
          <div style={{ marginTop: 10, padding: '8px 6px', border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span className="davis-label" style={{ margin: 0 }}>PHRASE LOOP</span>
              <button
                className={`chip-btn ${phraseEnabled ? 'active' : ''}`}
                onClick={() => dispatch({ type: A.SET_PHRASE_ENABLED, payload: !phraseEnabled })}
                style={phraseEnabled ? { borderColor: '#00d9ff', color: '#00d9ff' } : {}}
              >
                {phraseEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="davis-interval-row">
              <span className="davis-label">LENGTH</span>
              <input type="range" min={4} max={32} step={1} value={phraseLength || 8}
                onChange={e => dispatch({ type: A.SET_PHRASE_LENGTH, payload: Number(e.target.value) })} />
              <span className="davis-readout">{phraseLength || 8} beats</span>
            </div>
            <div className="davis-source-row" style={{ marginTop: 4 }}>
              <span className="davis-label">MODE</span>
              {[
                { id: 'reset-seed', label: 'RESET' },
                { id: 'cycle-seed', label: 'CYCLE' },
                { id: 'step-ca', label: 'CA' },
              ].map(m => (
                <button key={m.id} className={`chip-btn ${phraseMode === m.id ? 'active' : ''}`}
                  onClick={() => dispatch({ type: A.SET_PHRASE_MODE, payload: m.id })}>
                  {m.label}
                </button>
              ))}
            </div>
            {phraseEnabled && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--dim)', marginBottom: 3 }}>
                  <span>BEAT {phraseBeat}/{phraseLength}</span>
                  <button className="micro-btn" onClick={() => dispatch({ type: A.RESET_PHRASE })}>RESET NOW</button>
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

          <div className="davis-interval-row" style={{ marginTop: '8px' }}>
            <span className="davis-label">AUTO-SNAP</span>
            <input type="checkbox" checked={autoSnapshot} onChange={e => dispatch({ type: A.SET_AUTO_SNAPSHOT, payload: e.target.checked })} />
          </div>
          <div className="davis-interval-row" style={{ marginTop: '4px' }}>
            <span className="davis-label">SMOOTHING</span>
            <input type="checkbox" checked={motionSmoothing} onChange={e => dispatch({ type: A.SET_MOTION_SMOOTHING, payload: e.target.checked })} />
          </div>

          <div className="davis-actions">
            <button className={`big-btn ${evolveMode ? 'active' : ''}`}
              onClick={() => dispatch({ type: A.SET_EVOLVE_MODE, payload: !evolveMode })}>
              {evolveMode ? 'STOP' : 'EVOLVE'}
            </button>
            <button className="big-btn" onClick={favoriteCurrent}>FAVORITE</button>
            <button className="big-btn" onClick={() => dispatch({ type: A.BUMP_SEED })}>NEW SEED</button>
          </div>

          {favorites.length > 0 && (
            <div className="favorites-list">
              <div className="favorites-header">FAVORITES ({favorites.length})</div>
              {favorites.map((f, i) => (
                <div key={i} className="fav-row">
                  <span className="fav-id">#{i + 1}</span>
                  <span className="fav-seed">{f.seed.toString(16)}</span>
                  <button className="micro-btn" onClick={() => dispatch({ type: A.RECALL_FAVORITE, favorite: f })}>R</button>
                  <button className="micro-btn" onClick={() => dispatch({ type: A.REMOVE_FAVORITE, index: i })}>X</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
