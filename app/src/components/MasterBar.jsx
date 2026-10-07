// MasterBar — bottom toolbar (tape readout, FPS, budget), below the view
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { TapeCounter } from './TapeCounter.jsx';
import { TallyLight } from './TallyLight.jsx';
import { BudgetKnob } from './BudgetKnob.jsx';
import { activeFxKinds, sceneFxCost } from '../hooks/sceneCost.js';
import * as A from '../state/actions.js';
import { QUALITY_PRESETS } from '../data/quality.js';
import { helpText } from '../data/helpCopy.js'; // #158: hover titles read the single map
import { LoisPill } from './LoisPill.jsx';
import { lostLine } from '../hooks/audioLoss.mjs';

export function MasterBar() {
  const { dispatch, history } = useApp();
  const { state } = useApp(s => ({
    running: s.running, fps: s.fps, stageTimings: s.stageTimings, governorShedFps: s.governorShedFps,
    seed: s.seed, nodeCount: s.nodeCount, quality: s.quality,
    isRecording: s.isRecording, persistStatus: s.persistStatus, frameLock: s.frameLock,
    bootNotice: s.bootNotice, setBootNotice: s.setBootNotice,
    setFrameLock: s.setFrameLock, audioDenied: s.audioDenied, audioLost: s.audioLost, glContext: s.glContext,
    curatorConfidence: s.curatorConfidence, curatorActive: s.curatorActive,
    layers: s.layers,
  }));
  const {
    running, fps, nodeCount = 0, quality = 'balanced', persistStatus = 'ok',
    frameLock = false, audioDenied = false, audioLost = null, glContext = 'ok', governorShedFps = 28,
  } = state;
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
  // #485 R4 — registry-driven FX-stack weight (bench ms, attribution only).
  // Neutral by design: no invented bands — the needle keeps the warn job and
  // the tape fill stays the only live truth.
  const fxKinds = activeFxKinds(state.layers);
  const fxCost = sceneFxCost(fxKinds);
  const fxTitle = `FX-stack weight ≈ ${fxCost.totalMs.toFixed(1)}ms bench (${fxCost.count} fx` +
    `${fxCost.shedFirstMs > 0 ? ` · ${fxCost.shedFirstMs.toFixed(1)}ms shed-first` : ''}` +
    `${fxCost.unknown.length ? ` · unknown: ${fxCost.unknown.join(',')}` : ''}). ` +
    `512²-bench estimates from the cost registry + measured costs — attribution, not frame math.`;

  // #33, #53: brief green SAVED flash when autosave succeeds.
  const [showSaved, setShowSaved] = useState(false);
  const prevPersist = useRef(persistStatus);
  useEffect(() => {
    if (persistStatus === 'ok' && prevPersist.current !== 'ok') {
      setShowSaved(true);
      const t = setTimeout(() => setShowSaved(false), 1500);
      prevPersist.current = persistStatus;
      return () => clearTimeout(t);
    }
    prevPersist.current = persistStatus;
  }, [persistStatus]);

  // #534: boot notice pill (share-link applied, bad link, palette fallback).
  // Shows for a few seconds, then clears itself from the store.
  const bootNotice = state.bootNotice;
  const setBootNotice = state.setBootNotice;
  useEffect(() => {
    if (!bootNotice) return;
    const t = setTimeout(() => setBootNotice(null), 8000);
    return () => clearTimeout(t);
  }, [bootNotice, setBootNotice]);

  return (
    <div className="master-bar">
      <div className="master-left">
        <LoisPill />
        {state.isRecording ? (
          <div className="status-pill" style={{ background: 'rgba(255, 45, 111, 0.2)', color: 'var(--kc-live)', borderColor: 'var(--kc-live)' }}
            title={helpText('output-webm')}>
            <span className="status-dot beat-flash" style={{ background: 'var(--kc-live)', animationIterationCount: 'infinite' }} />
            REC WEBM
          </div>
        ) : (
          <div className="status-pill"
            style={running
              ? { background: 'rgba(255, 45, 111, 0.2)', color: 'var(--kc-live)', borderColor: 'var(--kc-live)' }
              : { background: 'rgba(0, 255, 136, 0.12)', color: 'var(--kc-ok)', borderColor: 'var(--kc-ok)' }}
            title={running ? 'Live loop is running — Space pauses' : 'Live loop is paused — Space resumes'}>
            <span className={`status-dot ${running ? 'live' : ''}`}
              style={{ background: running ? 'var(--kc-live)' : 'var(--kc-ok)', boxShadow: running ? '0 0 5px rgba(255,45,111,0.7)' : 'none' }} />
            {running ? 'LIVE' : 'PAUSED'}
          </div>
        )}

        {persistStatus !== 'ok' && (
          <div className="status-pill" style={{ background: 'rgba(255, 176, 0, 0.18)', color: 'var(--kc-warn)', borderColor: 'var(--kc-warn)' }}
            title={persistStatus === 'quarantined' ? 'Last autosave could not be read.' : 'Autosave is failing.'}>
            <span className="status-dot" style={{ background: '#ffb000' }} />
            {persistStatus === 'quarantined' ? 'RESTORE FAILED' : 'UNSAVED'}
          </div>
        )}

        {showSaved && (
          <div className="status-pill" style={{ background: 'rgba(0, 255, 136, 0.12)', color: 'var(--kc-ok)', borderColor: 'var(--kc-ok)' }}
            title="Project autosaved to pipeline backup.">
            <span className="status-dot" style={{ background: '#00ff88' }} />
            SAVED
          </div>
        )}

        {bootNotice && (
          <div className="status-pill" style={{ background: 'rgba(0, 217, 255, 0.12)', color: '#00d9ff', borderColor: '#00d9ff' }}
            title={bootNotice}>
            <span className="status-dot" style={{ background: '#00d9ff' }} />
            {bootNotice.length > 48 ? `${bootNotice.slice(0, 47)}…` : bootNotice}
          </div>
        )}

        {glContext !== 'ok' && (
          <div className="status-pill"
            style={{ background: 'rgba(255, 176, 0, 0.18)', color: 'var(--kc-warn)', borderColor: 'var(--kc-warn)' }}
            title={glContext === 'lost' ? 'GPU context lost' : 'GPU context restored — rebuilding'}>
            <span className="status-dot" style={{ background: 'var(--kc-warn)' }} />
            {glContext === 'lost' ? 'GL CONTEXT LOST' : 'GL RESTORING'}
          </div>
        )}

        {audioDenied && (
          <div className="status-pill" style={{ background: 'rgba(255, 176, 0, 0.18)', color: 'var(--kc-warn)', borderColor: 'var(--kc-warn)' }}
            title="Browser denied mic access.">
            <span className="status-dot" style={{ background: '#ffb000' }} />
            MIC BLOCKED
          </div>
        )}

        {audioLost && (
          <div className="status-pill" style={{ background: 'rgba(255, 176, 0, 0.18)', color: 'var(--kc-warn)', borderColor: 'var(--kc-warn)' }}
            title={`${lostLine(audioLost.name)} — switch AUDIO on in STIMULI to reconnect.`}>
            <span className="status-dot" style={{ background: '#ffb000' }} />
            AUDIO INPUT LOST
          </div>
        )}

        <TallyLight confidence={state.curatorConfidence ?? 0} active={!!state.curatorActive} />

        <TapeCounter />

        <div className="meter" title={headroomTitle}>
          <span className="meter-label lbl">fps</span>
          <div className={`fps-bar ${fpsClass}`}>
            <span className="fps-bar-fill" style={{ width: `${fpsWidth}%` }} />
            <span className={`fps-needle ${needleState}`} style={{ left: `${needlePct}%` }} />
          </div>
          <span className="meter-value">{Number(fps).toFixed(1)}</span>
        </div>

        <div className="meter" title="Live placement / instance count">
          <span className="meter-label lbl">nodes</span>
          <span className={`meter-value ${nodeClass}`}>{nodeCount}</span>
        </div>

        <div className="meter" title={fxTitle}>
          <span className="meter-label lbl">fx ms</span>
          <span className="meter-value">{fxCost.count > 0 ? fxCost.totalMs.toFixed(0) : '—'}</span>
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
        <button className="run-btn" onClick={() => dispatch({ type: A.SET_RUNNING, payload: !running })}>
          {running ? '■ STOP' : '▶ RUN'}
        </button>
      </div>
    </div>
  );
}
