// LoopCaptureBlock — #284 Loop Capture UI. Lives in the OUTPUT panel next
// to REC WEBM: pick a loop length, capture a fixed-length take, get a
// seamless looping WebM (tail dissolves into the head — no visible cut).
import { useRef, useState } from 'react';
import {
  captureLoop,
  LOOP_CAPTURE_FPS,
  LOOP_CAPTURE_DISSOLVE_SECONDS,
  LOOP_CAPTURE_LENGTHS,
} from '../../hooks/useLoopCapture.js';

const PHASE_LABEL = { preroll: 'LEAD-IN', body: 'TAKE', tail: 'DISSOLVE' };

export function LoopCaptureBlock({ glLoopRef, seed, rendering, setRendering }) {
  const [seconds, setSeconds] = useState(4);
  const [progress, setProgress] = useState(null); // { phase, done, total }
  const [error, setError] = useState(null);
  const [doneMsg, setDoneMsg] = useState(null);
  const cancelRef = useRef(false);
  const capturing = !!progress;

  const start = async () => {
    if (capturing || rendering) return;
    setError(null);
    setDoneMsg(null);
    cancelRef.current = false;
    if (setRendering) setRendering(true);
    try {
      const { cancelled } = await captureLoop({
        loopRef: glLoopRef,
        seconds,
        seedStr: (seed >>> 0).toString(16),
        onProgress: (p) => setProgress(p),
        shouldCancel: () => cancelRef.current,
      });
      setDoneMsg(cancelled
        ? 'Loop capture cancelled — no file written.'
        : `Loop captured — ${seconds}s seamless WebM downloaded (${LOOP_CAPTURE_FPS}fps, 1s tail→head dissolve).`);
    } catch (e) {
      console.error('[loop] capture failed:', e);
      setError(e && e.message ? e.message : String(e));
    } finally {
      if (setRendering) setRendering(false);
      setProgress(null);
    }
  };

  const elapsed = progress
    ? (progress.phase === 'preroll'
      ? progress.done
      : progress.phase === 'body'
        ? LOOP_CAPTURE_DISSOLVE_SECONDS * LOOP_CAPTURE_FPS + progress.done
        : (seconds * LOOP_CAPTURE_FPS) + progress.done)
    : 0;
  const totalFrames = (seconds + LOOP_CAPTURE_DISSOLVE_SECONDS) * LOOP_CAPTURE_FPS;

  return (
    <div className="output-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <div className="output-row" style={{ alignItems: 'center' }}>
        <span
          style={{ fontSize: 10, letterSpacing: 1, opacity: 0.7 }}
          title="Loop length in seconds. The take records a 1s lead-in first (dissolve source), then the loop body — total record time is length + 1s."
        >
          LOOP
        </span>
        {LOOP_CAPTURE_LENGTHS.map((s) => (
          <button
            key={s}
            className={`big-btn${seconds === s ? ' active' : ''}`}
            onClick={() => setSeconds(s)}
            disabled={capturing || rendering}
            title={`${s}-second seamless loop`}
            style={{ flex: 0 }}
          >
            {s}s
          </button>
        ))}
        <button
          className="big-btn"
          onClick={() => { if (capturing) cancelRef.current = true; else start(); }}
          disabled={rendering}
          title="Record a fixed-length take of the live canvas and export it as a seamless looping WebM — the tail dissolves into the head so there is no visible cut. What plays is what loops."
          style={capturing ? { background: '#ff2d6f', color: '#fff', borderColor: '#ff2d6f', flex: 2 } : { flex: 2 }}
        >
          {capturing ? '⏹ CANCEL LOOP' : '⏺ CAPTURE LOOP'}
        </button>
      </div>
      {capturing && (
        <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.85 }} role="status">
          ● {PHASE_LABEL[progress.phase] || progress.phase}{' '}
          {(elapsed / LOOP_CAPTURE_FPS).toFixed(1)}s / {(totalFrames / LOOP_CAPTURE_FPS).toFixed(1)}s
          {' '}— hold still, the take is recording
        </div>
      )}
      {doneMsg && !capturing && (
        <div style={{ fontSize: 11, color: '#00ff88' }} role="status">{doneMsg}</div>
      )}
      {error && !capturing && (
        <div style={{ fontSize: 11, color: '#ff5d7a' }} role="alert">Loop capture failed: {error}</div>
      )}
    </div>
  );
}
