// MasterBar — top toolbar with logo, palette, status, controls
import { useApp } from '../state/AppContext.jsx';
import * as A from '../state/actions.js';

export function MasterBar() {
  const { dispatch, palette } = useApp();
  const state = useApp(s => ({
    running: s.running,
    fps: s.fps,
    seed: s.seed,
    isRecording: s.isRecording,
    audioEnabled: s.audioEnabled,
    beatPulse: s.beatPulse,
  }));
  const { running, fps, seed } = state;

  const fpsClass = fps >= 50 ? 'good' : fps >= 30 ? 'mid' : 'bad';
  const fpsWidth = Math.min(100, (fps / 60) * 100);

  return (
    <div className="master-bar">
      <div className="master-left">
        <div className="logo">
          <span className="logo-mark">◈</span>
          <span className="logo-text">KINETIC<span className="logo-accent">_</span>CURATOR</span>
          <span className="logo-version">v0.5</span>
        </div>
        
        {state.isRecording ? (
          <div className="status-pill" style={{ background: 'rgba(255, 45, 111, 0.2)', color: '#ff2d6f', borderColor: '#ff2d6f' }}>
            <span className="status-dot beat-flash" style={{ background: '#ff2d6f', animationIterationCount: 'infinite' }} />
            REC WEBM
          </div>
        ) : (
          <div className="status-pill">
            <span className={`status-dot ${running ? 'live' : ''}`} />
            {running ? 'LIVE' : 'PAUSED'}
          </div>
        )}

        <div className="meter">
          <span className="meter-label">FPS</span>
          <div className={`fps-bar ${fpsClass}`}>
            <span className="fps-bar-fill" style={{ width: `${fpsWidth}%` }} />
          </div>
          <span className="meter-value">{fps.toFixed(1)}</span>
        </div>
        <div className="meter">
          <span className="meter-label">SEED</span>
          <span className="meter-value">{seed.toString(16).padStart(8, '0')}</span>
        </div>
        <div className="undo-group">
          <button
            className={`undo-btn ${history.canUndo ? '' : 'disabled'}`}
            onClick={history.undo}
            disabled={!history.canUndo}
            title="Undo (⌘Z)"
          >
            ↶{history.undoDepth > 0 ? ` ${history.undoDepth}` : ''}
          </button>
          <button
            className={`undo-btn ${history.canRedo ? '' : 'disabled'}`}
            onClick={history.redo}
            disabled={!history.canRedo}
            title="Redo (⌘⇧Z)"
          >
            ↷{history.redoDepth > 0 ? ` ${history.redoDepth}` : ''}
          </button>
        </div>
      </div>
      <div className="master-right">
        <div className="palette-switch">
          <span className="palette-switch-label">PALETTE</span>
          {palettes.map(p => (
            <button
              key={p.id}
              className={`palette-chip ${p.id === palette.id ? 'active' : ''}`}
              onClick={() => dispatch({ type: A.SET_PALETTE_ID, payload: p.id })}
            >
              <span className="palette-chip-swatches">
                {p.swatches.slice(0, 5).map((s, i) => (
                  <span key={i} className="palette-chip-sw" style={{ background: s }} />
                ))}
              </span>
              {p.name}
            </button>
          ))}
        </div>
        <button className="run-btn" onClick={() => dispatch({ type: A.SET_RUNNING, payload: !running })}>
          {running ? '■ STOP' : '▶ RUN'}
        </button>
      </div>
    </div>
  );
}
