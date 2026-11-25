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
// Browser law (issue 2490 in the session report's numbering; Matt's ruling
// 2026-11-24): in the browser build every control below stays visible but
// disabled, labelled "Native app only", and no click reaches the Tauri bridge
// — the calls live behind nativeLab.mjs, which shares the app's one desktop
// gate (platform/desktop.mjs). In the desktop app a genuine native failure
// shows plain words via onMessage; the raw error string goes to nativeLab's
// diagnostic log, never to the panel.
//
// Code moved verbatim; not yet routed through the event bus (follow-up).
import { useEffect, useState } from 'react';
import { useApp } from '../../state/AppContext.jsx';
import { isTauriRuntime } from '../../platform/desktop.mjs';
import { createNativeLab, NATIVE_APP_ONLY_LABEL } from './nativeLab.mjs';

const nativeLab = createNativeLab();

export function NativeLabBlock({ onMessage }) {
  const setMessage = onMessage;
  const { state } = useApp((s) => ({
    curatorConfidence: s.curatorConfidence,
    curatorActive: s.curatorActive,
    curatorLatencyMs: s.curatorLatencyMs,
  }));

  // The desktop shell is fixed for the life of the window; read the shared
  // gate once per render. False in a browser: controls render disabled.
  const desktop = isTauriRuntime();
  const naSuffix = desktop ? '' : ` — ${NATIVE_APP_ONLY_LABEL}`;
  const naTitle = desktop ? undefined : NATIVE_APP_ONLY_LABEL;

  const [metalStats, setMetalStats] = useState(null);
  const [metalDispatchTime, setMetalDispatchTime] = useState(null);
  const [metalBusy, setMetalBusy] = useState(false);

  const handleTestNativeIO = async () => {
    // 1x1 valid PNG binary header & chunk payload (67 bytes)
    const dummyBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49,
      0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const res = await nativeLab.testDiskIO(Array.from(dummyBytes), '/tmp/kc_native_test.png');
    if (res.ok) {
      setMessage(`Native I/O OK: ${res.value} bytes -> /tmp/kc_native_test.png`);
    } else {
      setMessage(res.plain);
    }
  };

  const handleMetalInit = async () => {
    setMetalBusy(true);
    const res = await nativeLab.metalInit({
      width: 1440,
      height: 900,
      particleCount: 2048,
    });
    setMetalBusy(false);
    if (res.ok) {
      setMetalStats(res.value);
      setMessage(`Metal Ready: ${res.value.device_name} (UMA: ${res.value.has_unified_memory ? 'YES' : 'NO'})`);
    } else {
      setMessage(res.plain);
    }
  };

  const handleMetalStep = async () => {
    setMetalBusy(true);
    const t0 = performance.now();
    const res = await nativeLab.metalStep(
      {
        deltaTime: 0.016,
        maxSpeed: 60.0,
        attractorX: 720.0,
        attractorY: 450.0,
        strength: 650.0,
      },
      {
        fade: 0.96,
        bgR: 0.0,
        bgG: 0.0,
        bgB: 0.0,
        bgA: 1.0,
      },
    );
    const dt = performance.now() - t0;
    setMetalBusy(false);
    if (res.ok) {
      setMetalDispatchTime(dt.toFixed(2));
      setMetalStats(res.value);
      setMessage(`Metal Pass #${res.value.frame_counter} dispatched in ${dt.toFixed(2)}ms`);
    } else {
      setMessage(res.plain);
    }
  };

  const [curatorBusy, setCuratorBusy] = useState(false);

  const handleCuratorEval = async () => {
    setCuratorBusy(true);
    const res = await nativeLab.curatorEval();
    setCuratorBusy(false);
    if (res.ok) {
      setMessage(
        `ANE Curation: ${(res.value.score * 100).toFixed(1)}% (${res.value.latency_ms.toFixed(1)}ms on ${res.value.compute_units})`,
      );
    } else {
      setMessage(res.plain);
    }
  };

  const [mediaProgress, setMediaProgress] = useState(null);
  const [mediaBusy, setMediaBusy] = useState(false);

  useEffect(() => {
    // The progress event only exists in the desktop shell; in a browser there
    // is no bridge to listen on.
    if (!isTauriRuntime()) return undefined;
    let unlisten = null;
    let cancelled = false;

    async function initMediaListener() {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        if (cancelled) return;
        unlisten = await listen('media-export-progress', (event) => {
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
      if (typeof unlisten === 'function') unlisten();
    };
  }, []);

  const handleMediaVideoExport = async () => {
    setMediaBusy(true);
    const res = await nativeLab.mediaExport({
      path: '/tmp/kc_export_media_engine.mov',
      frameCount: 60,
      fps: 60,
      codec: 'hevc',
    });
    setMediaBusy(false);
    if (res.ok) {
      setMessage(`Media Engine: ${res.value}`);
    } else {
      setMessage(res.plain);
    }
  };

  const handleECoreBatchDump = async () => {
    setMediaBusy(true);
    const res = await nativeLab.ecoreDump({
      targetDir: '/tmp/kc_batch_export_ecore',
      count: 60,
      format: 'raw', // #1744: the dump writes raw RGBA32F frames; it never encoded PNG
    });
    setMediaBusy(false);
    if (res.ok) {
      setMessage(`E-Core Dump: ${res.value}`);
    } else {
      setMessage(res.plain);
    }
  };

  return (
    <>
      {!desktop && (
        <div
          style={{
            marginTop: '4px',
            marginBottom: '8px',
            color: 'var(--text-muted, #aaa)',
            fontSize: '10px',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          {NATIVE_APP_ONLY_LABEL} — these controls run in the desktop app; here they are shown disabled.
        </div>
      )}

      <div
        style={{
          marginTop: '4px',
          marginBottom: '8px',
          padding: '8px',
          background: 'rgba(0, 229, 255, 0.04)',
          border: '1px solid rgba(0, 229, 255, 0.25)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '6px',
          }}
        >
          <span style={{ color: '#00e5ff', fontWeight: 600 }}>APPLE MEDIA ENGINE &amp; E-CORES</span>
          <span className="pipeline-status">
            {mediaBusy || (mediaProgress && !mediaProgress.finished) ? '● STREAMING' : '○ READY'}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            marginBottom: '8px',
            color: 'var(--text-muted, #aaa)',
            fontSize: '10px',
          }}
        >
          <div>
            VIDEO CODEC: <span style={{ color: '#fff' }}>AVAssetWriter (HEVC hvc1 / ProRes 4444)</span>
          </div>
          <div>
            BATCH QUEUE: <span style={{ color: '#00e5ff' }}>Pinned to E-Cores (QOS_CLASS_BACKGROUND)</span>
          </div>
          {mediaProgress && (
            <div>
              PROGRESS:{' '}
              <span style={{ color: '#00e5ff' }}>
                {mediaProgress.completed}/{mediaProgress.total} frames
              </span>{' '}
              ({mediaProgress.fps.toFixed(1)} fps)
            </div>
          )}
        </div>

        {mediaProgress && (
          <div
            style={{
              height: '4px',
              background: 'rgba(255,255,255,0.1)',
              overflow: 'hidden',
              marginBottom: '8px',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.round((mediaProgress.completed / Math.max(1, mediaProgress.total)) * 100))}%`,
                height: '100%',
                background: '#00e5ff',
                transition: 'width 0.08s linear',
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{
              flex: 1,
              fontSize: '10px',
              fontFamily: 'var(--font-mono, monospace)',
              border: '1px solid #00e5ff',
              background: 'rgba(0, 229, 255, 0.08)',
              color: '#00e5ff',
              padding: '4px 6px',
              cursor: !desktop ? 'not-allowed' : mediaBusy ? 'wait' : 'pointer',
            }}
            disabled={!desktop || mediaBusy}
            title={naTitle}
            onClick={handleMediaVideoExport}
          >
            {mediaBusy ? 'STREAMING...' : `⚡ RECORD HEVC VIDEO${naSuffix}`}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{
              flex: 1,
              fontSize: '10px',
              fontFamily: 'var(--font-mono, monospace)',
              border: '1px solid #00e5ff',
              background: 'rgba(0, 229, 255, 0.08)',
              color: '#00e5ff',
              padding: '4px 6px',
              cursor: !desktop ? 'not-allowed' : mediaBusy ? 'wait' : 'pointer',
            }}
            disabled={!desktop || mediaBusy}
            title={naTitle}
            onClick={handleECoreBatchDump}
          >
            {mediaBusy ? 'DUMPING...' : `⚡ DUMP BATCH (E-CORES)${naSuffix}`}
          </button>
        </div>
      </div>

      <div style={{ marginTop: '6px', marginBottom: '6px' }}>
        <button
          type="button"
          className="btn btn-block btn-ghost"
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '11px',
            border: '1px dashed var(--accent, #00ff88)',
            color: 'var(--accent, #00ff88)',
            padding: '6px 8px',
            cursor: !desktop ? 'not-allowed' : 'pointer',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
          disabled={!desktop}
          title={naTitle}
          onClick={handleTestNativeIO}
        >
          {`⚡ TEST NATIVE DISK I/O${naSuffix}`}
        </button>
      </div>

      <div
        style={{
          marginTop: '8px',
          marginBottom: '8px',
          padding: '8px',
          background: 'rgba(0, 255, 136, 0.04)',
          border: '1px solid rgba(0, 255, 136, 0.25)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '6px',
          }}
        >
          <span style={{ color: 'var(--accent, #00ff88)', fontWeight: 600 }}>METAL ZERO-COPY (UMA)</span>
          <span className="pipeline-status">{metalStats ? '● ACTIVE' : '○ STANDBY'}</span>
        </div>

        {metalStats ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              marginBottom: '8px',
              color: 'var(--text-muted, #aaa)',
              fontSize: '10px',
            }}
          >
            <div>
              DEVICE: <span style={{ color: '#fff' }}>{metalStats.device_name}</span>
            </div>
            <div>
              UMA SHARED:{' '}
              <span
                style={{
                  color: metalStats.has_unified_memory ? '#00ff88' : '#ffaa00',
                }}
              >
                {metalStats.has_unified_memory ? 'YES (Coherent)' : 'NO'}
              </span>
            </div>
            <div>
              ACCUM PTR: <span className="pipeline-hex">{metalStats.accum_buffer_ptr}</span> (
              {(metalStats.accum_buffer_bytes / 1048576).toFixed(2)} MB)
            </div>
            <div>
              BOIDS PTR: <span className="pipeline-hex">{metalStats.boids_buffer_ptr}</span> (
              {(metalStats.boids_buffer_bytes / 1024).toFixed(1)} KB)
            </div>
            <div>
              FRAMES DISPATCHED: <span style={{ color: '#fff' }}>#{metalStats.frame_counter}</span>{' '}
              {metalDispatchTime ? `(${metalDispatchTime}ms)` : ''}
            </div>
          </div>
        ) : (
          <div style={{ color: '#888', fontSize: '10px', marginBottom: '8px' }}>
            Direct Apple Silicon hardware pipeline for zero-copy accumulation and physics compute.
          </div>
        )}

        <div style={{ display: 'flex', gap: '6px' }}>
          {!metalStats ? (
            <button
              type="button"
              className="btn btn-ghost"
              style={{
                flex: 1,
                fontSize: '10px',
                fontFamily: 'var(--font-mono, monospace)',
                border: '1px solid var(--accent, #00ff88)',
                color: 'var(--accent, #00ff88)',
                padding: '4px 6px',
                cursor: !desktop ? 'not-allowed' : metalBusy ? 'wait' : 'pointer',
              }}
              disabled={!desktop || metalBusy}
              title={naTitle}
              onClick={handleMetalInit}
            >
              {metalBusy ? 'INITIALIZING...' : `⚡ INIT METAL UMA${naSuffix}`}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost"
              style={{
                flex: 1,
                fontSize: '10px',
                fontFamily: 'var(--font-mono, monospace)',
                border: '1px solid var(--accent, #00ff88)',
                background: 'rgba(0, 255, 136, 0.1)',
                color: 'var(--accent, #00ff88)',
                padding: '4px 6px',
                cursor: !desktop ? 'not-allowed' : metalBusy ? 'wait' : 'pointer',
              }}
              disabled={!desktop || metalBusy}
              title={naTitle}
              onClick={handleMetalStep}
            >
              {metalBusy ? 'COMPUTING...' : `⚡ DISPATCH METAL PASS${naSuffix}`}
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: '8px',
          marginBottom: '8px',
          padding: '8px',
          background: 'rgba(255, 170, 0, 0.04)',
          border: '1px solid rgba(255, 170, 0, 0.25)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '6px',
          }}
        >
          <span style={{ color: '#ffaa00', fontWeight: 600 }}>ANE CURATION ENGINE (CORE ML)</span>
          <span className="pipeline-status">{state.curatorActive ? '● ANE ACTIVE' : '○ IDLE'}</span>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            marginBottom: '8px',
            color: 'var(--text-muted, #aaa)',
            fontSize: '10px',
          }}
        >
          <div>
            TARGET: <span style={{ color: '#fff' }}>.cpuAndNeuralEngine (16-Core ANE)</span>
          </div>
          <div>
            INGEST: <span style={{ color: '#00ff88' }}>Zero-Copy CVPixelBuffer (UMA)</span>
          </div>
          <div>
            TASTE CONFIDENCE:{' '}
            <span
              style={{
                fontWeight: 600,
                color:
                  (state.curatorConfidence || 0) >= 0.85
                    ? '#00ff88'
                    : (state.curatorConfidence || 0) >= 0.5
                      ? '#ffaa00'
                      : '#aaa',
              }}
            >
              {((state.curatorConfidence || 0) * 100).toFixed(1)}%
            </span>
            {state.curatorLatencyMs > 0 ? ` (${state.curatorLatencyMs.toFixed(1)}ms)` : ''}
          </div>
        </div>

        <button
          type="button"
          className="btn btn-ghost"
          style={{
            width: '100%',
            fontSize: '10px',
            fontFamily: 'var(--font-mono, monospace)',
            border: '1px solid #ffaa00',
            background: 'rgba(255, 170, 0, 0.08)',
            color: '#ffaa00',
            padding: '6px 8px',
            cursor: !desktop ? 'not-allowed' : curatorBusy ? 'wait' : 'pointer',
          }}
          disabled={!desktop || curatorBusy}
          title={naTitle}
          onClick={handleCuratorEval}
        >
          {curatorBusy ? 'EVALUATING ON ANE...' : `⚡ EVALUATE FRAME ON ANE${naSuffix}`}
        </button>
      </div>
    </>
  );
}
