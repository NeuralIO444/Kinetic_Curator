import { useState, useRef, useEffect } from 'react';
// MasterBar — top toolbar
import { useApp } from '../state/AppContext.jsx';
import { TapeCounter } from './TapeCounter.jsx';
import { BudgetKnob } from './BudgetKnob.jsx';
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

const SWATCH_WIN = 5;
const SWATCH_STEP = 10;
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
      <label className="palette-sw-edit" title={`S${i + 1} ${sw} — click to edit`} onClick={(e) => e.stopPropagation()}>
        <span className="palette-chip-sw palette-sw-full" style={{ background: sw }} />
        <input type="color" className="palette-color-input" value={sw} onChange={(e) => onSwatch(i, e.target.value)} onClick={(e) => e.stopPropagation()} />
      </label>
      <button type="button" className="palette-lock-pip" title={locks?.[i] ? `S${i + 1} locked` : `Lock S${i + 1}`} aria-pressed={!!locks?.[i]} onClick={(e) => { e.stopPropagation(); onLock(i); }}>
        {locks?.[i] ? '▪' : ''}
      </button>
    </span>
  );
  return (
    <span className="palette-active-strip" aria-label={`${palette.name} palette editor`}>
      {overflow && (<button type="button" className="palette-nav-btn" title="Previous swatches" disabled={s <= 0} onClick={slide(-1)}>‹</button>)}
      {overflow ? (
        <span className="palette-sw-viewport"><span className="palette-sw-track" style={{ transform: `translateX(${-s * SWATCH_STEP}px)` }}>{swatches.map(cell)}</span></span>
      ) : (
        <span className="palette-active-swatches">{swatches.map(cell)}</span>
      )}
      {overflow && (<button type="button" className="palette-nav-btn" title="Next swatches" disabled={s >= maxStart} onClick={slide(1)}>›</button>)}
      <label className="palette-meta-sw palette-sw-edit" style={{ background: palette.bg }} title={`BG ${palette.bg}`} onClick={(e) => e.stopPropagation()}>
        <span className="palette-meta-label">BG</span>
        <input type="color" className="palette-color-input" value={palette.bg} onChange={(e) => onBg(e.target.value)} onClick={(e) => e.stopPropagation()} />
      </label>
      <label className="palette-meta-sw palette-sw-edit" style={{ background: palette.ink }} title={`INK ${palette.ink}`} onClick={(e) => e.stopPropagation()}>
        <span className="palette-meta-label">INK</span>
        <input type="color" className="palette-color-input" value={palette.ink} onChange={(e) => onInk(e.target.value)} onClick={(e) => e.stopPropagation()} />
      </label>
      {dirty && (<button type="button" className="palette-reset-btn" title="Reset to catalog colors" onClick={(e) => { e.stopPropagation(); onReset(); }}>↺</button>)}
    </span>
  );
}

export function MasterBar() {
  const { dispatch, palette, history, palettes, paletteLocks } = useApp();
  const { state } = useApp(s => ({
    running: s.running, fps: s.fps, stageTimings: s.stageTimings, governorShedFps: s.governorShedFps,
    seed: s.seed, nodeCount: s.nodeCount, quality: s.quality,
    isRecording: s.isRecording, persistStatus: s.persistStatus, frameLock: s.frameLock,
    setFrameLock: s.setFrameLock, audioDenied: s.audioDenied, glContext: s.glContext,
  }));
  const {
    running, fps, nodeCount = 0, quality = 'balanced', persistStatus = 'ok',
    frameLock = false, audioDenied = false, glContext = 'ok', governorShedFps = 28,
  } = state;
  const [harmonyScheme, setHarmonyScheme] = useState('analogous');
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
  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    syncChipNav(chipTrackRef.current);
  }, [palette.id]);

  const fpsClass = fps >= 50 ? 'good' : fps >= 30 ? 'mid' : 'bad';
  const fpsWidth = Math.min(100, (fps / 60) * 100);
  // #297: headroom needle — effective frame rate the governor watches
  const gpuFrameMs = Number(state.stageTimings?.gpuFrame) || 0;
  const effFps = gpuFrameMs > 0 ? Math.min(fps, 1000 / gpuFrameMs) : fps;
  const shedFloor = Number(governorShedFps) || 28;
  const needlePct = Math.max(0, Math.min(100, (effFps / 60) * 100));
  const headroomFps = effFps - shedFloor;
  const needleState = headroomFps <= 0 ? 'bad' : headroomFps <= 7 ? 'warn' : 'quiet';
  const headroomTitle = `Effective frame rate ${effFps.toFixed(1)} fps — the worse of display fps and GPU-implied fps. ` +
    `The governor sheds below ${shedFloor} fps: the needle shows the shed coming. ` +
    (needleState === 'quiet'
      ? 'Comfortably above the shed floor.'
      : needleState === 'warn'
        ? 'Headroom is thinning — a shed may be approaching.'
        : 'At or below the shed floor — the governor is shedding or about to.');
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
          <div className="status-pill" style={{ background: 'rgba(255, 45, 111, 0.2)', color: '#ff2d6f', borderColor: '#ff2d6f' }}
            title="Recording the live canvas to WEBM">
            <span className="status-dot beat-flash" style={{ background: '#ff2d6f', animationIterationCount: 'infinite' }} />
            REC WEBM
          </div>
        ) : (
          <div className="status-pill" title={running ? 'Live loop is running — Space pauses' : 'Live loop is paused — Space resumes'}>
            <span className={`status-dot ${running ? 'live' : ''}`} />
            {running ? 'LIVE' : 'PAUSED'}
          </div>
        )}

        {persistStatus !== 'ok' && (
          <div className="status-pill" style={{ background: 'rgba(255, 176, 0, 0.18)', color: '#ffb000', borderColor: '#ffb000' }}
            title={persistStatus === 'quarantined' ? 'Last autosave could not be read.' : 'Autosave is failing.'}>
            <span className="status-dot" style={{ background: '#ffb000' }} />
            {persistStatus === 'quarantined' ? 'RESTORE FAILED' : 'UNSAVED'}
          </div>
        )}

        {glContext !== 'ok' && (
          <div className="status-pill"
            style={glContext === 'lost'
              ? { background: 'rgba(255, 45, 111, 0.18)', color: '#ff2d6f', borderColor: '#ff2d6f' }
              : { background: 'rgba(255, 176, 0, 0.18)', color: '#ffb000', borderColor: '#ffb000' }}
            title={glContext === 'lost' ? 'GPU context lost' : 'GPU context restored — rebuilding'}>
            <span className="status-dot" style={{ background: glContext === 'lost' ? '#ff2d6f' : '#ffb000' }} />
            {glContext === 'lost' ? 'GL CONTEXT LOST' : 'GL RESTORING'}
          </div>
        )}

        {audioDenied && (
          <div className="status-pill" style={{ background: 'rgba(255, 176, 0, 0.18)', color: '#ffb000', borderColor: '#ffb000' }}
            title="Browser denied mic access.">
            <span className="status-dot" style={{ background: '#ffb000' }} />
            MIC BLOCKED
          </div>
        )}

        <TapeCounter />

        <div className="meter" title={headroomTitle}>
          <span className="meter-label">FPS</span>
          <div className={`fps-bar ${fpsClass}`}>
            <span className="fps-bar-fill" style={{ width: `${fpsWidth}%` }} />
            <span className={`fps-needle ${needleState}`} style={{ left: `${needlePct}%` }} />
          </div>
          <span className="meter-value">{Number(fps).toFixed(1)}</span>
        </div>

        <div className="meter" title="Live placement / instance count">
          <span className="meter-label">NODES</span>
          <span className={`meter-value ${nodeClass}`}>{nodeCount}</span>
        </div>

        <div className="meter" title={q.description}>
          <span className="meter-label">Q</span>
          <span className="meter-value" style={{ letterSpacing: '0.06em' }}>{q.budget || q.label}</span>
        </div>

        <button
          className={`undo-btn ${frameLock ? '' : 'disabled'}`}
          onClick={() => state.setFrameLock(!frameLock)}
          title="Frame-lock show mode: gate the UI life tick to a locked 30fps."
          style={{ fontSize: '10px', letterSpacing: '0.06em' }}
        >
          30FPS{frameLock ? '' : ' · OFF'}
        </button>

        <BudgetKnob />

        <div className="undo-group">
          <button className={`undo-btn ${history.canUndo ? '' : 'disabled'}`} onClick={history.undo} disabled={!history.canUndo} title="Undo (Ctrl/⌘+Z)">
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
            <button type="button" className="palette-nav-btn" title="Previous palettes" disabled={!canChipPrev} onClick={(e) => handleChipSlide(e, -1)}>‹</button>
          )}
          <div className="palette-chip-viewport">
            <div ref={chipTrackRef} className="palette-chip-track" onScroll={handleChipTrackScroll}>
          {palettes.map(p => {
            const active = p.id === palette.id;
            if (active) {
              return (
                <div key={p.id} ref={activeChipRef} className={`palette-chip active ${palette.dirty ? 'dirty' : ''}`} title={`${p.name}`}>
                  <ActivePaletteStrip
                    key={palette.id}
                    palette={palette}
                    dirty={!!palette.dirty}
                    locks={paletteLocks}
                    onLock={(i) => emit(Events.PALETTE_LOCK, { index: i })}
                    onSwatch={(i, hex) => dispatch({ type: A.SET_PALETTE_SWATCH, index: i, hex })}
                    onBg={(hex) => dispatch({ type: A.SET_PALETTE_BG, payload: hex })}
                    onInk={(hex) => dispatch({ type: A.SET_PALETTE_INK, payload: hex })}
                    onReset={() => dispatch({ type: A.CLEAR_PALETTE_OVERRIDES })}
                  />
                  {p.name}
                  {p.user && (
                    <button type="button" className="palette-del-btn" title={`Delete ${p.name}`} onClick={() => emit(Events.PALETTE_DELETE, { id: p.id })}>×</button>
                  )}
                </div>
              );
            }
            return (
              <span key={p.id} className="palette-chip-wrap">
                <button type="button" className="palette-chip" onClick={() => dispatch({ type: A.SET_PALETTE_ID, payload: p.id })} title={p.name}>
                  <CompactSwatches swatches={p.swatches || []} />
                  {p.name}
                </button>
                {p.user && (
                  <button type="button" className="palette-del-btn" title={`Delete ${p.name}`} onClick={() => emit(Events.PALETTE_DELETE, { id: p.id })}>×</button>
                )}
              </span>
            );
          })}
            </div>
          </div>
          {chipOverflow && (
            <button type="button" className="palette-nav-btn" title="Next palettes" disabled={!canChipNext} onClick={(e) => handleChipSlide(e, 1)}>›</button>
          )}
          <select className="palette-harmony-select" value={harmonyScheme} onChange={(e) => setHarmonyScheme(e.target.value)} title="Colour harmony scheme" onClick={(e) => e.stopPropagation()}>
            {SCHEME_IDS.map((id) => (<option key={id} value={id}>{id.toUpperCase()}</option>))}
          </select>
          <button type="button" className="palette-save-btn" title="Shuffle unlocked swatches" onClick={() => emit(Events.PALETTE_HARMONY, { scheme: harmonyScheme })}>⟳ SHUFFLE</button>
          <button type="button" className="palette-save-btn" title="Save palette" onClick={() => emit(Events.PALETTE_SAVE, {})}>+ SAVE</button>
        </div>
        <button className="run-btn" onClick={() => dispatch({ type: A.SET_RUNNING, payload: !running })}>
          {running ? '■ STOP' : '▶ RUN'}
        </button>
      </div>
    </div>
  );
}
