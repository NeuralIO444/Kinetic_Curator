// MasterBar — bottom toolbar (tape readout, FPS, budget), below the view
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { TapeCounter } from './TapeCounter.jsx';
import { TallyLight } from './TallyLight.jsx';
import { BudgetKnob } from './BudgetKnob.jsx';
import * as A from '../state/actions.js';
import { QUALITY_PRESETS } from '../data/quality.js';
import { helpText } from '../data/helpCopy.js'; // #158: hover titles read the single map

export function MasterBar() {
  const { dispatch, history } = useApp();
  const { state } = useApp(s => ({
    running: s.running, fps: s.fps, stageTimings: s.stageTimings, governorShedFps: s.governorShedFps,
    seed: s.seed, nodeCount: s.nodeCount, quality: s.quality,
    isRecording: s.isRecording, persistStatus: s.persistStatus, frameLock: s.frameLock,
    setFrameLock: s.setFrameLock, audioDenied: s.audioDenied, glContext: s.glContext,
    curatorConfidence: s.curatorConfidence, curatorActive: s.curatorActive,
  }));
  const {
    running, fps, nodeCount = 0, quality = 'balanced', persistStatus = 'ok',
    frameLock = false, audioDenied = false, glContext = 'ok', governorShedFps = 28,
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

  return (
    <div className="master-bar">
      <div className="master-left">
        {state.isRecording ? (
          <div className="status-pill" style={{ background: 'rgba(255, 45, 111, 0.2)', color: '#ff2d6f', borderColor: '#ff2d6f' }}
            title={helpText('output-webm')}>
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

        {showSaved && (
          <div className="status-pill" style={{ background: 'rgba(0, 255, 136, 0.12)', color: '#00ff88', borderColor: '#00ff88' }}
            title="Project autosaved to pipeline backup.">
            <span className="status-dot" style={{ background: '#00ff88' }} />
            SAVED
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

        <TallyLight confidence={state.curatorConfidence ?? 0} active={!!state.curatorActive} />

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
        <button className="run-btn" onClick={() => dispatch({ type: A.SET_RUNNING, payload: !running })}>
          {running ? '■ STOP' : '▶ RUN'}
        </button>
      </div>
    </div>
  );
}
