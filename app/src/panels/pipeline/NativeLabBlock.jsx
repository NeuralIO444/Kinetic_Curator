// NativeLabBlock — the Apple Silicon native paths (Metal UMA, ANE curation,
// Media Engine HEVC, E-core dump, raw disk I/O), moved out of the PIPELINE
// shell into DEV.
//
// Why DEV and not EXPORT: every one of these runs against the Metal shared
// accumulation buffer, which only exists after INIT METAL UMA. In EXPORT the
// HEVC / E-core buttons failed cold ("Metal engine not initialized") and wrote
// a fixed 60 frames to fixed /tmp paths. They stay here, unchanged, until they
// read the live canvas and pick a destination — then they can graduate.
//
// Code moved verbatim; not yet routed through the event bus (follow-up).
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { useApp } from "../../state/AppContext.jsx";

export function NativeLabBlock({ onMessage }) {
  const setMessage = onMessage;
  const { state } = useApp((s) => ({
    curatorConfidence: s.curatorConfidence,
    curatorActive: s.curatorActive,
    curatorLatencyMs: s.curatorLatencyMs,
  }));

  const [metalStats, setMetalStats] = useState(null);
  const [metalDispatchTime, setMetalDispatchTime] = useState(null);
  const [metalBusy, setMetalBusy] = useState(false);

  const handleTestNativeIO = async () => {
    try {
      // 1x1 valid PNG binary header & chunk payload (67 bytes)
      const dummyBytes = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
        0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);
      const bytesWritten = await invoke("write_batch_frame", {
        data: Array.from(dummyBytes),
        path: "/tmp/kc_native_test.png",
      });
      setMessage(
        `Native I/O OK: ${bytesWritten} bytes -> /tmp/kc_native_test.png`,
      );
    } catch (err) {
      console.error("Native I/O test failed:", err);
      setMessage(`Native I/O: ${err?.message || err}`);
    }
  };

  const handleMetalInit = async () => {
    try {
      setMetalBusy(true);
      const stats = await invoke("metal_init", {
        width: 1440,
        height: 900,
        particleCount: 2048,
      });
      setMetalStats(stats);
      setMessage(
        `Metal Ready: ${stats.device_name} (UMA: ${stats.has_unified_memory ? "YES" : "NO"})`,
      );
    } catch (err) {
      console.error("Metal Init failed:", err);
      setMessage(`Metal Error: ${err?.message || err}`);
    } finally {
      setMetalBusy(false);
    }
  };

  const handleMetalStep = async () => {
    try {
      setMetalBusy(true);
      const t0 = performance.now();
      await invoke("metal_step_boids", {
        deltaTime: 0.016,
        maxSpeed: 60.0,
        attractorX: 720.0,
        attractorY: 450.0,
        strength: 650.0,
      });
      const updatedStats = await invoke("metal_step_accum", {
        fade: 0.96,
        bgR: 0.0,
        bgG: 0.0,
        bgB: 0.0,
        bgA: 1.0,
      });
      const dt = performance.now() - t0;
      setMetalDispatchTime(dt.toFixed(2));
      setMetalStats(updatedStats);
      setMessage(
        `Metal Pass #${updatedStats.frame_counter} dispatched in ${dt.toFixed(2)}ms`,
      );
    } catch (err) {
      console.error("Metal Step failed:", err);
      setMessage(`Metal Step: ${err?.message || err}`);
    } finally {
      setMetalBusy(false);
    }
  };

  const [curatorBusy, setCuratorBusy] = useState(false);

  const handleCuratorEval = async () => {
    try {
      setCuratorBusy(true);
      const res = await invoke("curator_evaluate_frame");
      setMessage(
        `ANE Curation: ${(res.score * 100).toFixed(1)}% (${res.latency_ms.toFixed(1)}ms on ${res.compute_units})`,
      );
    } catch (err) {
      console.error("Curator ANE eval failed:", err);
      setMessage(`ANE Eval: ${err?.message || err}`);
    } finally {
      setCuratorBusy(false);
    }
  };

  const [mediaProgress, setMediaProgress] = useState(null);
  const [mediaBusy, setMediaBusy] = useState(false);

  useEffect(() => {
    let unlisten = null;
    let cancelled = false;

    async function initMediaListener() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        if (cancelled) return;
        unlisten = await listen("media-export-progress", (event) => {
          setMediaProgress(event.payload);
          if (event.payload?.finished) {
            setTimeout(() => {
              setMediaProgress((p) => (p?.finished ? null : p));
            }, 4000);
          }
        });
      } catch {
        // Fallback when outside Tauri desktop webview
      }
    }

    initMediaListener();
    return () => {
      cancelled = true;
      if (typeof unlisten === "function") unlisten();
    };
  }, []);

  const handleMediaVideoExport = async () => {
    try {
      setMediaBusy(true);
      const res = await invoke("start_media_engine_export", {
        path: "/tmp/kc_export_media_engine.mov",
        frameCount: 60,
        fps: 60,
        codec: "hevc",
      });
      setMessage(`Media Engine: ${res}`);
    } catch (err) {
      console.error("Media engine export failed:", err);
      setMessage(`Media Export: ${err?.message || err}`);
    } finally {
      setMediaBusy(false);
    }
  };

  const handleECoreBatchDump = async () => {
    try {
      setMediaBusy(true);
      const res = await invoke("dump_image_batch", {
        targetDir: "/tmp/kc_batch_export_ecore",
        count: 60,
        format: "png",
      });
      setMessage(`E-Core Dump: ${res}`);
    } catch (err) {
      console.error("E-Core dump failed:", err);
      setMessage(`E-Core Dump: ${err?.message || err}`);
    } finally {
      setMediaBusy(false);
    }
  };

  return (
    <>
    <div
      style={{
        marginTop: "4px",
        marginBottom: "8px",
        padding: "8px",
        background: "rgba(0, 229, 255, 0.04)",
        border: "1px solid rgba(0, 229, 255, 0.25)",
        fontSize: "11px",
        fontFamily: "var(--font-mono, monospace)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "6px",
        }}
      >
        <span style={{ color: "#00e5ff", fontWeight: 600 }}>
          APPLE MEDIA ENGINE &amp; E-CORES
        </span>
        <span className="pipeline-status">
          {mediaBusy || (mediaProgress && !mediaProgress.finished)
            ? "● STREAMING"
            : "○ READY"}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          marginBottom: "8px",
          color: "var(--text-muted, #aaa)",
          fontSize: "10px",
        }}
      >
        <div>
          VIDEO CODEC:{" "}
          <span style={{ color: "#fff" }}>
            AVAssetWriter (HEVC hvc1 / ProRes 4444)
          </span>
        </div>
        <div>
          BATCH QUEUE:{" "}
          <span style={{ color: "#00e5ff" }}>
            Pinned to E-Cores (QOS_CLASS_BACKGROUND)
          </span>
        </div>
        {mediaProgress && (
          <div>
            PROGRESS:{" "}
            <span style={{ color: "#00e5ff" }}>
              {mediaProgress.completed}/{mediaProgress.total} frames
            </span>{" "}
            ({mediaProgress.fps.toFixed(1)} fps)
          </div>
        )}
      </div>

      {mediaProgress && (
        <div
          style={{
            height: "4px",
            background: "rgba(255,255,255,0.1)",
            overflow: "hidden",
            marginBottom: "8px",
          }}
        >
          <div
            style={{
              width: `${Math.min(100, Math.round((mediaProgress.completed / Math.max(1, mediaProgress.total)) * 100))}%`,
              height: "100%",
              background: "#00e5ff",
              transition: "width 0.08s linear",
            }}
          />
        </div>
      )}

      <div style={{ display: "flex", gap: "6px" }}>
        <button
          type="button"
          className="btn btn-ghost"
          style={{
            flex: 1,
            fontSize: "10px",
            fontFamily: "var(--font-mono, monospace)",
            border: "1px solid #00e5ff",
            background: "rgba(0, 229, 255, 0.08)",
            color: "#00e5ff",
            padding: "4px 6px",
            cursor: mediaBusy ? "wait" : "pointer",
          }}
          disabled={mediaBusy}
          onClick={handleMediaVideoExport}
        >
          {mediaBusy ? "STREAMING..." : "⚡ RECORD HEVC VIDEO"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{
            flex: 1,
            fontSize: "10px",
            fontFamily: "var(--font-mono, monospace)",
            border: "1px solid #00e5ff",
            background: "rgba(0, 229, 255, 0.08)",
            color: "#00e5ff",
            padding: "4px 6px",
            cursor: mediaBusy ? "wait" : "pointer",
          }}
          disabled={mediaBusy}
          onClick={handleECoreBatchDump}
        >
          {mediaBusy ? "DUMPING..." : "⚡ DUMP BATCH (E-CORES)"}
        </button>
      </div>
    </div>

      <div style={{ marginTop: "6px", marginBottom: "6px" }}>
        <button
          type="button"
          className="btn btn-block btn-ghost"
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "11px",
            border: "1px dashed var(--accent, #00ff88)",
            color: "var(--accent, #00ff88)",
            padding: "6px 8px",
            cursor: "pointer",
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
          }}
          onClick={handleTestNativeIO}
        >
          ⚡ TEST NATIVE DISK I/O
        </button>
      </div>

      <div
        style={{
          marginTop: "8px",
          marginBottom: "8px",
          padding: "8px",
          background: "rgba(0, 255, 136, 0.04)",
          border: "1px solid rgba(0, 255, 136, 0.25)",
          fontSize: "11px",
          fontFamily: "var(--font-mono, monospace)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "6px",
          }}
        >
          <span
            style={{ color: "var(--accent, #00ff88)", fontWeight: 600 }}
          >
            METAL ZERO-COPY (UMA)
          </span>
          <span className="pipeline-status">
            {metalStats ? "● ACTIVE" : "○ STANDBY"}
          </span>
        </div>

        {metalStats ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              marginBottom: "8px",
              color: "var(--text-muted, #aaa)",
              fontSize: "10px",
            }}
          >
            <div>
              DEVICE:{" "}
              <span style={{ color: "#fff" }}>
                {metalStats.device_name}
              </span>
            </div>
            <div>
              UMA SHARED:{" "}
              <span
                style={{
                  color: metalStats.has_unified_memory
                    ? "#00ff88"
                    : "#ffaa00",
                }}
              >
                {metalStats.has_unified_memory ? "YES (Coherent)" : "NO"}
              </span>
            </div>
            <div>
              ACCUM PTR:{" "}
              <span className="pipeline-hex">
                {metalStats.accum_buffer_ptr}
              </span>{" "}
              ({(metalStats.accum_buffer_bytes / 1048576).toFixed(2)} MB)
            </div>
            <div>
              BOIDS PTR:{" "}
              <span className="pipeline-hex">
                {metalStats.boids_buffer_ptr}
              </span>{" "}
              ({(metalStats.boids_buffer_bytes / 1024).toFixed(1)} KB)
            </div>
            <div>
              FRAMES DISPATCHED:{" "}
              <span style={{ color: "#fff" }}>
                #{metalStats.frame_counter}
              </span>{" "}
              {metalDispatchTime ? `(${metalDispatchTime}ms)` : ""}
            </div>
          </div>
        ) : (
          <div
            style={{ color: "#888", fontSize: "10px", marginBottom: "8px" }}
          >
            Direct Apple Silicon hardware pipeline for zero-copy
            accumulation and physics compute.
          </div>
        )}

        <div style={{ display: "flex", gap: "6px" }}>
          {!metalStats ? (
            <button
              type="button"
              className="btn btn-ghost"
              style={{
                flex: 1,
                fontSize: "10px",
                fontFamily: "var(--font-mono, monospace)",
                border: "1px solid var(--accent, #00ff88)",
                color: "var(--accent, #00ff88)",
                padding: "4px 6px",
                cursor: metalBusy ? "wait" : "pointer",
              }}
              disabled={metalBusy}
              onClick={handleMetalInit}
            >
              {metalBusy ? "INITIALIZING..." : "⚡ INIT METAL UMA"}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost"
              style={{
                flex: 1,
                fontSize: "10px",
                fontFamily: "var(--font-mono, monospace)",
                border: "1px solid var(--accent, #00ff88)",
                background: "rgba(0, 255, 136, 0.1)",
                color: "var(--accent, #00ff88)",
                padding: "4px 6px",
                cursor: metalBusy ? "wait" : "pointer",
              }}
              disabled={metalBusy}
              onClick={handleMetalStep}
            >
              {metalBusy ? "COMPUTING..." : "⚡ DISPATCH METAL PASS"}
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: "8px",
          marginBottom: "8px",
          padding: "8px",
          background: "rgba(255, 170, 0, 0.04)",
          border: "1px solid rgba(255, 170, 0, 0.25)",
          fontSize: "11px",
          fontFamily: "var(--font-mono, monospace)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "6px",
          }}
        >
          <span style={{ color: "#ffaa00", fontWeight: 600 }}>
            ANE CURATION ENGINE (CORE ML)
          </span>
          <span className="pipeline-status">
            {state.curatorActive ? "● ANE ACTIVE" : "○ IDLE"}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            marginBottom: "8px",
            color: "var(--text-muted, #aaa)",
            fontSize: "10px",
          }}
        >
          <div>
            TARGET:{" "}
            <span style={{ color: "#fff" }}>
              .cpuAndNeuralEngine (16-Core ANE)
            </span>
          </div>
          <div>
            INGEST:{" "}
            <span style={{ color: "#00ff88" }}>
              Zero-Copy CVPixelBuffer (UMA)
            </span>
          </div>
          <div>
            TASTE CONFIDENCE:{" "}
            <span
              style={{
                fontWeight: 600,
                color:
                  (state.curatorConfidence || 0) >= 0.85
                    ? "#00ff88"
                    : (state.curatorConfidence || 0) >= 0.5
                      ? "#ffaa00"
                      : "#aaa",
              }}
            >
              {((state.curatorConfidence || 0) * 100).toFixed(1)}%
            </span>
            {state.curatorLatencyMs > 0
              ? ` (${state.curatorLatencyMs.toFixed(1)}ms)`
              : ""}
          </div>
        </div>

        <button
          type="button"
          className="btn btn-ghost"
          style={{
            width: "100%",
            fontSize: "10px",
            fontFamily: "var(--font-mono, monospace)",
            border: "1px solid #ffaa00",
            background: "rgba(255, 170, 0, 0.08)",
            color: "#ffaa00",
            padding: "6px 8px",
            cursor: curatorBusy ? "wait" : "pointer",
          }}
          disabled={curatorBusy}
          onClick={handleCuratorEval}
        >
          {curatorBusy
            ? "EVALUATING ON ANE..."
            : "⚡ EVALUATE FRAME ON ANE"}
        </button>
      </div>
    </>
  );
}
