import { useState } from 'react';
// MasterBar — top toolbar
import { useApp } from '../state/AppContext.jsx';
import * as A from '../state/actions.js';
import { emit, Events } from '../composition/eventBus.js';
import { QUALITY_PRESETS } from '../data/quality.js';
import { SCHEME_IDS } from '../engine/harmony.js';

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
function ActivePaletteStrip({ palette, dirty, locks, onSwatch, onBg, onInk, onReset, onLock }) {
  const swatches = palette.swatches || [];
  return (
    <span className="palette-active-strip" aria-label={`${palette.name} palette editor`}>
      <span className="palette-active-swatches">
        {swatches.map((s, i) => (
          <span key={i} className={`palette-sw-cell ${locks?.[i] ? 'locked' : ''}`}>
            <label
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
            <button
              type="button"
              className="palette-lock-pip"
              title={locks?.[i] ? `S${i + 1} locked — harmony and shuffle skip it` : `Lock S${i + 1}`}
              aria-pressed={!!locks?.[i]}
              onClick={(e) => { e.stopPropagation(); onLock(i); }}
            >
              {locks?.[i] ? '▪' : ''}
            </button>
          </span>
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
  const { dispatch, palette, history, palettes, paletteLocks } = useApp();
  const { state } = useApp(s => ({
    running: s.running,
    fps: s.fps,
    seed: s.seed,
    nodeCount: s.nodeCount,
    quality: s.quality,
    autoQuality: s.autoQuality,
    isRecording: s.isRecording,
    persistStatus: s.persistStatus,
    slowRender: s.slowRender,
  }));
  // Default to 'ok' rather than showing the warning for an undefined value:
  // this selector is explicit, so a field missing from it reads as undefined,
  // and a pill that fails open would cry UNSAVED on every boot.
  const {
    running, fps, seed, nodeCount = 0, quality = 'balanced', persistStatus = 'ok',
    slowRender = false,
  } = state;
  const [harmonyScheme, setHarmonyScheme] = useState('analogous');

  const fpsClass = fps >= 50 ? 'good' : fps >= 30 ? 'mid' : 'bad';
  const fpsWidth = Math.min(100, (fps / 60) * 100);
  const nodeClass = nodeCount > 700 ? 'bad' : nodeCount > 450 ? 'mid' : 'good';
  const q = QUALITY_PRESETS[quality] || QUALITY_PRESETS.balanced;
  const buildId = import.meta.env.VITE_BUILD_ID || 'dev';

  return (
    <div className="master-bar">
      <div className="master-left">
        <div className="logo">
          <span className="logo-mark">◈</span>
          <span className="logo-text">KINETIC<span className="logo-accent">_</span>CURATOR</span>
          <span className="logo-version">v0.9.0</span>
          <span className="logo-build" title="Build id from VITE_BUILD_ID">Build: {buildId}</span>
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

        {/* #107 §6: never let the operator assume a long set is being saved
            when localStorage refused the write, or when boot could not read
            their last document. */}
        {persistStatus !== 'ok' && (
          <div
            className="status-pill"
            style={{ background: 'rgba(255, 176, 0, 0.18)', color: '#ffb000', borderColor: '#ffb000' }}
            title={persistStatus === 'quarantined'
              ? 'Last autosave could not be read. Started from defaults; the file is kept at kc:project:quarantine.'
              : 'Autosave is failing (storage full or blocked). This session will not be restored.'}
          >
            <span className="status-dot" style={{ background: '#ffb000' }} />
            {persistStatus === 'quarantined' ? 'RESTORE FAILED' : 'UNSAVED'}
          </div>
        )}

        {/* #107 §4: the governor paused evolve/life/ACCUM/swarm because FPS
            is on the floor — otherwise this looks like the app just stopped
            breathing for no reason. */}
        {slowRender && (
          <div
            className="status-pill"
            style={{ background: 'rgba(255, 45, 111, 0.18)', color: '#ff2d6f', borderColor: '#ff2d6f' }}
            title="FPS is sustained near zero. Evolve, ambient life drift, ACCUM and swarm are paused until it recovers."
          >
            <span className="status-dot" style={{ background: '#ff2d6f' }} />
            PERF PAUSED
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
                    locks={paletteLocks}
                    onLock={(i) => emit(Events.PALETTE_LOCK, { index: i })}
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
          <select
            className="palette-harmony-select"
            value={harmonyScheme}
            onChange={(e) => setHarmonyScheme(e.target.value)}
            title="Colour harmony scheme — locked swatches are preserved"
            onClick={(e) => e.stopPropagation()}
          >
            {SCHEME_IDS.map((id) => (
              <option key={id} value={id}>{id.toUpperCase()}</option>
            ))}
          </select>
          <button
            type="button"
            className="palette-save-btn"
            title="Regenerate unlocked swatches from the scheme, built around your locked colour"
            onClick={() => emit(Events.PALETTE_HARMONY, { scheme: harmonyScheme })}
          >
            ⟳ SHUFFLE
          </button>
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
