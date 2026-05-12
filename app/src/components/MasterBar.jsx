// MasterBar — top toolbar with logo, palette, status, controls
import { useApp } from '../state/AppContext.jsx';
import * as A from '../state/actions.js';

export function MasterBar() {
  const { dispatch, palette, history, palettes } = useApp();
  const { state } = useApp(s => ({
    running: s.running,
    fps: s.fps,
    seed: s.seed,
    isRecording: s.isRecording,
    audioEnabled: s.audioEnabled,
    beatPulse: s.beatPulse,
    renderingMode: s.renderingMode,
    perfMode: s.perfMode,
    mode: s.mode,
    evolveMode: s.evolveMode,
    motionEnabled: s.motionEnabled,
    particlesEnabled: s.particlesEnabled,
  }));
  const { running, fps, seed, renderingMode, perfMode, mode, evolveMode, motionEnabled, particlesEnabled } = state;
  // Two independent toggles replacing the old KINESIS button:
  //   MOTION       — continuous particle/echo motion (canvas feels alive)
  //   AUTO-EVOLVE  — Davis-style parameter randomizer running on a timer
  // You can run either alone, both, or neither. Manual slider adjustments
  // always work; with AUTO-EVOLVE off, parameters stay where you set them.

  const motionActive = motionEnabled && particlesEnabled;
  const toggleMotion = () => {
    if (motionActive) {
      // Turn off motion + particles + echo. Leave smoothing alone so subsequent
      // changes still feel fluid.
      dispatch({ type: A.SET_PARTICLES_ENABLED, payload: false });
      dispatch({ type: A.SET_MOTION_ENABLED, payload: false });
      dispatch({ type: A.SET_ECHO_ENABLED, payload: false });
      return;
    }
    dispatch({ type: A.SET_MOTION_SMOOTHING, payload: true });
    dispatch({ type: A.SET_PARTICLES_ENABLED, payload: true });
    dispatch({ type: A.SET_MOTION_ENABLED, payload: true });
    dispatch({ type: A.SET_MOTION_TYPE, payload: 'swarm' });
    dispatch({ type: A.SET_PARTICLE_COUNT, payload: 300 });
    dispatch({ type: A.SET_PARTICLE_SPEED, payload: 1.2 });
    dispatch({ type: A.SET_ECHO_ENABLED, payload: true });
    dispatch({ type: A.SET_ECHO_COUNT, payload: 2 });
    dispatch({ type: A.SET_ECHO_DECAY, payload: 0.55 });
  };

  const toggleEvolve = () => {
    if (evolveMode) {
      dispatch({ type: A.SET_EVOLVE_MODE, payload: false });
      return;
    }
    // Sensible defaults; user can refine via DAVIS panel afterward.
    dispatch({ type: A.SET_MOTION_SMOOTHING, payload: true });
    dispatch({ type: A.SET_EVOLVE_TARGET, payload: 'all' });
    dispatch({ type: A.SET_EVOLVE_SOURCE, payload: 'time' });
    dispatch({ type: A.SET_EVOLVE_INTERVAL, payload: 2500 });
    dispatch({ type: A.SET_EVOLVE_MODE, payload: true });
  };

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
        <button
          className="run-btn"
          onClick={toggleMotion}
          title="MOTION: continuous particle motion + echo trails (canvas feels alive). Doesn't shuffle layout params."
          style={motionActive
            ? { background: '#00ff88', color: '#000', borderColor: '#00ff88', boxShadow: '0 0 8px rgba(0,255,136,0.4)' }
            : { background: 'transparent', color: 'var(--ink)', borderColor: 'var(--accent2)' }}
        >
          {motionActive ? '◉ MOTION' : '▶ MOTION'}
        </button>
        <button
          className="run-btn"
          onClick={toggleEvolve}
          title="AUTO-EVOLVE: Davis randomizer ticks every 2.5s. Marks 'K' params for evolution; falls back to all-unlocked if none."
          style={evolveMode
            ? { background: 'var(--accent)', color: '#000', borderColor: 'var(--accent)', boxShadow: '0 0 8px rgba(255,45,111,0.4)' }
            : { background: 'transparent', color: 'var(--ink)', borderColor: 'var(--accent)' }}
        >
          {evolveMode ? '◉ AUTO-EVOLVE' : '▶ AUTO-EVOLVE'}
        </button>
        <button
          className="run-btn"
          onClick={() => dispatch({ type: A.SET_RENDERING_MODE, payload: renderingMode === 'svg' ? 'webgl' : 'svg' })}
          title={`Rendering: ${renderingMode.toUpperCase()} — click to switch`}
          style={{
            background: renderingMode === 'webgl' ? 'var(--accent2)' : 'transparent',
            color: renderingMode === 'webgl' ? '#000' : 'var(--ink)',
            borderColor: renderingMode === 'webgl' ? 'var(--accent2)' : 'var(--line-2)',
          }}
        >
          {renderingMode === 'svg' ? 'SVG' : 'WEBGL'}
        </button>
        <button
          className="run-btn"
          onClick={() => dispatch({ type: A.SET_MODE, payload: mode === 'studio' ? 'live' : 'studio' })}
          title={mode === 'studio'
            ? 'STUDIO mode: SVG-output-focused workflow. Click to switch to LIVE.'
            : 'LIVE mode: audio/webcam reactive performance. Click to switch to STUDIO.'}
          style={mode === 'live'
            ? { background: 'var(--accent)', color: '#000', borderColor: 'var(--accent)' }
            : { background: 'transparent', color: 'var(--ink)', borderColor: 'var(--line-2)' }}
        >
          {mode === 'live' ? '◉ LIVE' : '○ STUDIO'}
        </button>
        <button
          className="run-btn"
          onClick={() => dispatch({ type: A.SET_PERF_MODE, payload: !perfMode })}
          title="Perf mode: caps particles to 200, disables echo + trails for higher FPS"
          style={perfMode
            ? { background: 'var(--accent3)', color: '#000', borderColor: 'var(--accent3)' }
            : { background: 'transparent', color: 'var(--ink)', borderColor: 'var(--line-2)' }}
        >
          {perfMode ? 'PERF ◉' : 'PERF ○'}
        </button>
      </div>
    </div>
  );
}
