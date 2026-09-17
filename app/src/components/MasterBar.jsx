import { useState, useRef, useEffect } from 'react';
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

/** Editable strip: sliding window of 5 swatches + pinned BG + INK (#51 / #52).
 *  Palettes with more than 5 swatches get ‹ › arrows fixed on each side;
 *  the swatch track physically slides one cell per click. */
const SWATCH_WIN = 5;
const SWATCH_STEP = 10; // 9px cell + 1px gap
function ActivePaletteStrip({ palette, dirty, locks, onSwatch, onBg, onInk, onReset, onLock }) {
  const swatches = palette.swatches || [];
  const [start, setStart] = useState(0);
  const maxStart = Math.max(0, swatches.length - SWATCH_WIN);
  const s = Math.min(start, maxStart);
  const overflow = swatches.length > SWATCH_WIN;
  const slide = (d) => (e) => {
    e.stopPropagation();
    setStart(Math.max(0, Math.min(maxStart, s + d)));
  };
  const cell = (sw, i) => (
    <span key={i} className={`palette-sw-cell ${locks?.[i] ? 'locked' : ''}`}>
      <label
        className="palette-sw-edit"
        title={`S${i + 1} ${sw} — click to edit`}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="palette-chip-sw palette-sw-full" style={{ background: sw }} />
        <input
          type="color"
          className="palette-color-input"
          value={sw}
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
  );
  return (
    <span className="palette-active-strip" aria-label={`${palette.name} palette editor`}>
      {overflow && (
        <button
          type="button"
          className="palette-nav-btn"
          title="Previous swatches"
          disabled={s <= 0}
          onClick={slide(-1)}
        >
          ‹
        </button>
      )}
      {overflow ? (
        <span className="palette-sw-viewport" aria-hidden={false}>
          <span
            className="palette-sw-track"
            style={{ transform: `translateX(${-s * SWATCH_STEP}px)` }}
          >
            {swatches.map(cell)}
          </span>
        </span>
      ) : (
        <span className="palette-active-swatches">
          {swatches.map(cell)}
        </span>
      )}
      {overflow && (
        <button
          type="button"
          className="palette-nav-btn"
          title="Next swatches"
          disabled={s >= maxStart}
          onClick={slide(1)}
        >
          ›
        </button>
      )}
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
    perfTier1: s.perfTier1,
    frameLock: s.frameLock,
    setFrameLock: s.setFrameLock,
    audioDenied: s.audioDenied,
  }));
  // Default to 'ok' rather than showing the warning for an undefined value:
  // this selector is explicit, so a field missing from it reads as undefined,
  // and a pill that fails open would cry UNSAVED on every boot.
  const {
    running, fps, nodeCount = 0, quality = 'balanced', persistStatus = 'ok',
    slowRender = false, perfTier1 = false, frameLock = false, audioDenied = false,
  } = state;
  const [harmonyScheme, setHarmonyScheme] = useState('analogous');

  // Palette-chip carousel: ~4 chips visible, ‹ › arrows slide the track.
  const CHIP_WIN = 4;
  const chipTrackRef = useRef(null);
  const activeChipRef = useRef(null);
  const [canChipPrev, setCanChipPrev] = useState(false);
  const [canChipNext, setCanChipNext] = useState(false);
  const chipOverflow = palettes.length > CHIP_WIN;
  const syncChipNav = (t) => {
    if (!t) return;
    setCanChipPrev(t.scrollLeft > 4);
    setCanChipNext(t.scrollLeft < t.scrollWidth - t.clientWidth - 4);
  };
  const handleChipTrackScroll = (e) => syncChipNav(e.currentTarget);
  const handleChipSlide = (e, dir) => {
    const track = e.currentTarget.parentElement?.querySelector('.palette-chip-track');
    if (!track) return;
    const first = track.querySelector(':scope > *');
    const step = first ? first.getBoundingClientRect().width + 3 : 120;
    track.scrollBy({ left: dir * step, behavior: 'smooth' });
  };
  // Keep the active palette chip in view when switching.
  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    syncChipNav(chipTrackRef.current);
  }, [palette.id]);

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
          <span className="logo-version">v0.9.0</span>
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

        {/* #107 §5: the browser denied mic access — audioEnabled has already
            been forced off (see useAudioInput's onDenied), so without this
            the operator just sees AUDIO silently do nothing. Clears itself
            on a successful retry (turn AUDIO back on). */}
        {audioDenied && (
          <div
            className="status-pill"
            style={{ background: 'rgba(255, 176, 0, 0.18)', color: '#ffb000', borderColor: '#ffb000' }}
            title="Browser denied mic access. Turning AUDIO back on will retry."
          >
            <span className="status-dot" style={{ background: '#ffb000' }} />
            MIC BLOCKED
          </div>
        )}

        {/* #107 §4: the watchdog tripped (tier 2 — FPS ~0, or a critical
            render-error) — running/evolve are OFF and do not resume on their
            own, otherwise this looks like the app just stopped for no
            reason and the operator waits for a recovery that never comes. */}
        {slowRender && (
          <div
            className="status-pill"
            style={{ background: 'rgba(255, 45, 111, 0.18)', color: '#ff2d6f', borderColor: '#ff2d6f' }}
            title="Watchdog tripped: running and evolve are off and will not resume on their own. Press space or ▶ RUN to resume."
          >
            <span className="status-dot" style={{ background: '#ff2d6f' }} />
            PERF PAUSED
          </div>
        )}

        {/* #107 §4 tier 1: a milder, self-clearing shed (FPS < 16 sustained
            2s) — ACCUM/gloss/mirror are off across every visible layer.
            Suppressed once tier 2 has tripped: PERF PAUSED above already
            covers that, and this would just be a redundant second pill. */}
        {perfTier1 && !slowRender && (
          <div
            className="status-pill"
            style={{ background: 'rgba(255, 176, 0, 0.18)', color: '#ffb000', borderColor: '#ffb000' }}
            title="FPS is sustained below 16. ACCUM, gloss and mirror are off across all visible layers — clears automatically once FPS recovers."
          >
            <span className="status-dot" style={{ background: '#ffb000' }} />
            LOAD SHED
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

        {/* Showrunner frame-lock: a user-chosen 30fps show mode, not a
            degradation. Gates the life tick (the dominant re-render driver)
            to ~30Hz — a locked 30 reads smoother than a fluctuating 40–60
            and roughly halves React render work. Never auto-cleared. */}
        <button
          className={`undo-btn ${frameLock ? '' : 'disabled'}`}
          onClick={() => state.setFrameLock(!frameLock)}
          title="Frame-lock show mode: gate the live loop to a locked 30fps (user choice, never auto-cleared)"
          style={{ fontSize: '10px', letterSpacing: '0.06em' }}
        >
          30FPS{frameLock ? '' : ' · OFF'}
        </button>

        <div className="undo-group">
          <button className={`undo-btn ${history.canUndo ? '' : 'disabled'}`} onClick={history.undo} disabled={!history.canUndo} title="Undo the last parameter, layer, or palette action (Ctrl/⌘+Z)">
            ↶{history.undoDepth > 0 ? ` ${history.undoDepth}` : ''}
          </button>
          <button className={`undo-btn ${history.canRedo ? '' : 'disabled'}`} onClick={history.redo} disabled={!history.canRedo} title="Redo (Ctrl/⌘+Shift+Z)">
            ↷{history.redoDepth > 0 ? ` ${history.redoDepth}` : ''}
          </button>
        </div>
      </div>
      <div className="master-right">
        <div className="palette-switch">
          <span className="palette-switch-label">PALETTE</span>
          {chipOverflow && (
            <button type="button" className="palette-nav-btn" title="Previous palettes"
              disabled={!canChipPrev} onClick={(e) => handleChipSlide(e, -1)}>‹</button>
          )}
          <div className="palette-chip-viewport">
            <div ref={chipTrackRef} className="palette-chip-track" onScroll={handleChipTrackScroll}>
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
                  ref={activeChipRef}
                  className={`palette-chip active ${palette.dirty ? 'dirty' : ''}`}
                  title={`${p.name} · edit swatches · switch palette clears customs`}
                >
                  <ActivePaletteStrip
                    key={palette.id}
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
            </div>
          </div>
          {chipOverflow && (
            <button type="button" className="palette-nav-btn" title="Next palettes"
              disabled={!canChipNext} onClick={(e) => handleChipSlide(e, 1)}>›</button>
          )}
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
