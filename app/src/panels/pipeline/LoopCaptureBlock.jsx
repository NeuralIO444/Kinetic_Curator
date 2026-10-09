// LoopCaptureBlock — #284 Loop Capture UI, promoted to RENDER MOVIE (#1217).
// Fixed-length take of the live canvas → seamless looping WebM (the tail
// dissolves into the head — no visible cut). Loop length is an amber stepper
// value; the freeform REC WEBM toggle (SnapRecordRow) is untouched.
import { useRef, useState } from "react";
import {
  captureLoop,
  LOOP_CAPTURE_FPS,
  LOOP_CAPTURE_DISSOLVE_SECONDS,
} from "../../hooks/useLoopCapture.js";
import { AmberValue } from "./ds.jsx";

const PHASE_LABEL = { preroll: "LEAD-IN", body: "TAKE", tail: "DISSOLVE" };

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
      setDoneMsg(
        cancelled
          ? "Loop capture cancelled — no file written."
          : `Loop captured — ${seconds}s seamless WebM downloaded (${LOOP_CAPTURE_FPS}fps, 1s tail→head dissolve).`,
      );
    } catch (e) {
      console.error("[loop] capture failed:", e);
      setError(e && e.message ? e.message : String(e));
    } finally {
      if (setRendering) setRendering(false);
      setProgress(null);
    }
  };

  const elapsed = progress
    ? progress.phase === "preroll"
      ? progress.done
      : progress.phase === "body"
        ? LOOP_CAPTURE_DISSOLVE_SECONDS * LOOP_CAPTURE_FPS + progress.done
        : seconds * LOOP_CAPTURE_FPS + progress.done
    : 0;
  const totalFrames =
    (seconds + LOOP_CAPTURE_DISSOLVE_SECONDS) * LOOP_CAPTURE_FPS;

  return (
    <div
      style={{
        marginBottom: 8,
        padding: 8,
        border: "1px solid var(--line-2)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div
        className="ttl"
        style={{
          fontSize: 9,
          letterSpacing: "0.12em",
          color: "var(--dim)",
          marginBottom: 6,
        }}
      >
        render · movie
      </div>
      <div className="pipeline-row" style={{ gap: 6 }}>
        <button
          type="button"
          className="big-btn"
          onClick={() => {
            if (capturing) cancelRef.current = true;
            else start();
          }}
          disabled={rendering}
          title="Record a fixed-length take of the live canvas and export it as a seamless looping WebM — the tail dissolves into the head so there is no visible cut. What plays is what loops."
          style={
            capturing
              ? {
                  background: "var(--kc-live)",
                  color: "#fff",
                  borderColor: "var(--kc-live)",
                  flex: 2,
                }
              : { flex: 2 }
          }
        >
          {capturing ? "⏹ CANCEL" : "▶ RENDER MOVIE"}
        </button>
        <AmberValue
          label="loop seconds"
          value={seconds}
          min={1}
          max={30}
          format={(v) => `${v}s`}
          onChange={setSeconds}
          disabled={capturing || rendering}
        />
      </div>
      {capturing && (
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1,
            opacity: 0.85,
            marginTop: 6,
          }}
          role="status"
        >
          ● {PHASE_LABEL[progress.phase] || progress.phase}{" "}
          {(elapsed / LOOP_CAPTURE_FPS).toFixed(1)}s /{" "}
          {(totalFrames / LOOP_CAPTURE_FPS).toFixed(1)}s — hold still, the take
          is recording
        </div>
      )}
      {doneMsg && !capturing && (
        <div
          style={{ fontSize: 11, color: "#00ff88", marginTop: 6 }}
          role="status"
        >
          {doneMsg}
        </div>
      )}
      {error && !capturing && (
        <div
          style={{ fontSize: 11, color: "#ff5d7a", marginTop: 6 }}
          role="alert"
        >
          Loop capture failed: {error}
        </div>
      )}
      <div className="pipeline-hint" style={{ marginTop: 6 }}>
        1s lead-in, then the loop body — total record time is length + 1s.
      </div>
    </div>
  );
}
