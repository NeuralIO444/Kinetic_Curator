// MasterBar — top toolbar
import { useApp } from '../state/AppContext.jsx';
import * as A from '../state/actions.js';
import { QUALITY_PRESETS } from '../data/quality.js';

/** Compact preview for inactive chips */
function CompactSwatches({ swatches }) {
  return (
    <span className="palette-chip-swatches">
      {swatches.slice(0, 5).map((s, i) => (
        <span key={i} className="palette-chip-sw" style={{ background: s }} title={s} />
      ))}
    </span>
  );
}

/** Full strip for active palette: all swatches + BG + INK with hex tooltips (#51) */
function ActivePaletteStrip({ palette }) {
  const swatches = palette.swatches || [];
  return (
    <span className="palette-active-strip" aria-label={`${palette.name} full palette`}>
      <span className="palette-active-swatches">
        {swatches.map((s, i) => (
          <span
            key={i}
            className="palette-chip-sw palette-sw-full"
            style={{ background: s }}
            title={`S${i + 1} ${s}`}
          />
        ))}
      </span>
      <span
        className="palette-meta-sw"
        style={{ background: palette.bg }}
        title={`BG ${palette.bg}`}
      >
        <span className="palette-meta-label">BG</span>
      </span>
      <span
        className="palette-meta-sw"
        style={{ background: palette.ink }}
        title={`INK ${palette.ink}`}
      >
        <span className="palette-meta-label">INK</span>
      </span>
    </span>
  );
}

export function MasterBar() {
  const { dispatch, palette, history, palettes } = useApp();
  const { state } = useApp(s => ({
    running: s.running,
    fps: s.fps,
    seed: s.seed,
    nodeCount: s.nodeCount,
    quality: s.quality,
    autoQuality: s.autoQuality,
    isRecording: s.isRecording,
  }));
  const { running, fps, seed, nodeCount = 0, quality = 'balanced' } = state;

  const fpsClass = fps >= 50 ? 'good' : fps >= 30 ? 'mid' : 'bad';
  const fpsWidth = Math.min(100, (fps / 60) * 100);
  const nodeClass = nodeCount > 700 ? 'bad' : nodeCount > 450 ? 'mid' : 'good';
  const q = QUALITY_PRESETS[quality] || QUALITY_PRESETS.balanced;

  return (
    <div className="master-bar">
      <div className="master-left">
        <div className="logo">
          <span className="logo-mark">◈</span>
          <span className="logo-text">KINETIC<span className="logo-accent">_</span>CURATOR</span>
          <span className="logo-version">v0.9</span>
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
          <span className="meter-value">{Number(fps).toFixed(1)}</span>
        </div>

        <div className="meter" title="Live placement / SVG node count">
          <span className="meter-label">NODES</span>
          <span className={`meter-value ${nodeClass}`}>{nodeCount}</span>
        </div>

        <div className="meter" title={q.description}>
          <span className="meter-label">Q</span>
          <span className="meter-value" style={{ letterSpacing: '0.06em' }}>{q.label}</span>
          {state.autoQuality && <span style={{ fontSize: '9px', opacity: 0.6, marginLeft: 4 }}>AUTO</span>}
        </div>

        <div className="meter">
          <span className="meter-label">SEED</span>
          <span className="meter-value">{seed.toString(16).padStart(8, '0')}</span>
        </div>

        <div className="undo-group">
          <button className={`undo-btn ${history.canUndo ? '' : 'disabled'}`} onClick={history.undo} disabled={!history.canUndo} title="Undo">
            ↶{history.undoDepth > 0 ? ` ${history.undoDepth}` : ''}
          </button>
          <button className={`undo-btn ${history.canRedo ? '' : 'disabled'}`} onClick={history.redo} disabled={!history.canRedo} title="Redo">
            ↷{history.redoDepth > 0 ? ` ${history.redoDepth}` : ''}
          </button>
        </div>
      </div>
      <div className="master-right">
        <div className="palette-switch">
          <span className="palette-switch-label">PALETTE</span>

          {palettes.map(p => {
            const active = p.id === palette.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`palette-chip ${active ? 'active' : ''}`}
                onClick={() => dispatch({ type: A.SET_PALETTE_ID, payload: p.id })}
                title={active ? `${p.name} · ${p.swatches?.length || 0} swatches + BG + INK` : p.name}
              >
                {active ? (
                  <ActivePaletteStrip palette={palette.id === p.id ? palette : p} />
                ) : (
                  <CompactSwatches swatches={p.swatches || []} />
                )}
                {p.name}
              </button>
            );
          })}
        </div>
        <button className="run-btn" onClick={() => dispatch({ type: A.SET_RUNNING, payload: !running })}>
          {running ? '■ STOP' : '▶ RUN'}
        </button>
      </div>
    </div>
  );
}
