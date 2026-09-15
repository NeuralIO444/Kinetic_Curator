// MasterBar — top toolbar
import { useApp } from '../state/AppContext.jsx';
import * as A from '../state/actions.js';
import { emit, Events } from '../composition/eventBus.js';
import { QUALITY_PRESETS } from '../data/quality.js';

function CompactSwatches({ swatches }) {
  return (
    <span className="palette-chip-swatches">
      {swatches.slice(0, 5).map((s, i) => (
        <span key={i} className="palette-chip-sw" style={{ background: s }} title={s} />
      ))}
    </span>
  );
}

/** Editable strip: all swatches + BG + INK (#51 / #52) */
function ActivePaletteStrip({ palette, dirty, onSwatch, onBg, onInk, onReset }) {
  const swatches = palette.swatches || [];
  return (
    <span className="palette-active-strip" aria-label={`${palette.name} palette editor`}>
      <span className="palette-active-swatches">
        {swatches.map((s, i) => (
          <label
            key={i}
            className="palette-sw-edit"
            title={`S${i + 1} ${s} — click to edit`}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="palette-chip-sw palette-sw-full" style={{ background: s }} />
            <input
              type="color"
              className="palette-color-input"
              value={s}
              onChange={(e) => onSwatch(i, e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </label>
        ))}
      </span>
      <label
        className="palette-meta-sw palette-sw-edit"
        style={{ background: palette.bg }}
        title={`BG ${palette.bg} — click to edit`}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="palette-meta-label">BG</span>
        <input
          type="color"
          className="palette-color-input"
          value={palette.bg}
          onChange={(e) => onBg(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
      </label>
      <label
        className="palette-meta-sw palette-sw-edit"
        style={{ background: palette.ink }}
        title={`INK ${palette.ink} — click to edit`}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="palette-meta-label">INK</span>
        <input
          type="color"
          className="palette-color-input"
          value={palette.ink}
          onChange={(e) => onInk(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
      </label>
      {dirty && (
        <button
          type="button"
          className="palette-reset-btn"
          title="Reset to catalog colors (clears overrides)"
          onClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
        >
          ↺
        </button>
      )}
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
            // The active chip hosts the editor (colour inputs + reset button),
            // so it must not itself be a <button> — nesting interactive
            // controls is invalid HTML and breaks keyboard/AT semantics.
            // Inactive chips stay buttons; switching is their only job.
            if (active) {
              return (
                <div
                  key={p.id}
                  className={`palette-chip active ${palette.dirty ? 'dirty' : ''}`}
                  title={`${p.name} · edit swatches · switch palette clears customs`}
                >
                  <ActivePaletteStrip
                    palette={palette}
                    dirty={!!palette.dirty}
                    onSwatch={(i, hex) =>
                      dispatch({ type: A.SET_PALETTE_SWATCH, index: i, hex })
                    }
                    onBg={(hex) => dispatch({ type: A.SET_PALETTE_BG, payload: hex })}
                    onInk={(hex) => dispatch({ type: A.SET_PALETTE_INK, payload: hex })}
                    onReset={() => dispatch({ type: A.CLEAR_PALETTE_OVERRIDES })}
                  />
                  {p.name}
                  {p.user && (
                    <button
                      type="button"
                      className="palette-del-btn"
                      title={`Delete ${p.name} from your library`}
                      onClick={() => emit(Events.PALETTE_DELETE, { id: p.id })}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            }
            return (
              <span key={p.id} className="palette-chip-wrap">
                <button
                  type="button"
                  className="palette-chip"
                  onClick={() => dispatch({ type: A.SET_PALETTE_ID, payload: p.id })}
                  title={`${p.name} (clears custom colors)`}
                >
                  <CompactSwatches swatches={p.swatches || []} />
                  {p.name}
                </button>
                {p.user && (
                  <button
                    type="button"
                    className="palette-del-btn"
                    title={`Delete ${p.name} from your library`}
                    onClick={() => emit(Events.PALETTE_DELETE, { id: p.id })}
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })}
          <button
            type="button"
            className="palette-save-btn"
            title="Save the palette on screen to your library (#55)"
            onClick={() => emit(Events.PALETTE_SAVE, {})}
          >
            + SAVE
          </button>
        </div>
        <button className="run-btn" onClick={() => dispatch({ type: A.SET_RUNNING, payload: !running })}>
          {running ? '■ STOP' : '▶ RUN'}
        </button>
      </div>
    </div>
  );
}
