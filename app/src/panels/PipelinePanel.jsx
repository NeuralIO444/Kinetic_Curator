// PipelinePanel (P05) — thin composition shell. Split into panels/pipeline/
// to match panels/layout/ and panels/davis/. This file owns only what's
// genuinely shared across those pieces:
//   - rendering — now store-backed (s.isRendering / EXPORT_RENDERING), not
//     local state, so the App-level hotkey map can debounce N/E while a
//     render is in flight (#107 §7)
//   - batchProgress / cancelBatchRef — BatchEditionBlock owns the run, but
//     the watchdog-trip effect below also needs to flip cancelBatchRef and
//     clear batchProgress from outside any child, so both live here
//   - accumOn — RenderFinalBlock, BatchEditionBlock, and SnapRecordRow all
//     branch on it
//   - message — one status line, written by both data-export and batch
//     completion, exactly as before
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { emit, Events } from '../composition/eventBus.js';
import { invoke } from '@tauri-apps/api/tauri';
import { RenderFinalBlock } from './pipeline/RenderFinalBlock.jsx';
import { PrintDeskBlock } from './pipeline/PrintDeskBlock.jsx';
import { BatchEditionBlock } from './pipeline/BatchEditionBlock.jsx';
import { SnapRecordRow } from './pipeline/SnapRecordRow.jsx';
import { LoopCaptureBlock } from './pipeline/LoopCaptureBlock.jsx';
import { DataExportRow } from './pipeline/DataExportRow.jsx';
import { RecipeRow } from './pipeline/RecipeRow.jsx';
import { SnapshotGallery } from './pipeline/SnapshotGallery.jsx';

export function PipelinePanel() {
  const { palette, glCanvasRef, glLoopRef } = useApp();
  const { state } = useApp(s => ({
    snapshots: s.snapshots,
    exportResolution: s.exportResolution,
    isRecording: s.isRecording,
    rendering: s.isRendering,
    seed: s.seed,
    seedOffsets: s.seedOffsets,
    layoutParams: s.layoutParams,
    quality: s.quality,
    autoQuality: s.autoQuality,
    paletteId: s.paletteId,
    paletteLocks: s.paletteLocks,
    enabledAssets: s.enabledAssets,
    assetWeightOverrides: s.assetWeightOverrides,
    paletteOverrides: s.paletteOverrides,
    lockedParams: s.lockedParams,
    caGrid: s.caGrid,
    customAssets: s.customAssets,
    layers: s.layers,
    activeLayerId: s.activeLayerId,
    layerSnapshots: s.layerSnapshots,
    userPalettes: s.userPalettes,
    favorites: s.favorites,
    watchdogTripGen: s.watchdogTripGen,
    curatorConfidence: s.curatorConfidence,
    curatorActive: s.curatorActive,
    curatorLatencyMs: s.curatorLatencyMs,
  }));
  const {
    snapshots, exportResolution, isRecording, seed, seedOffsets, layoutParams,
    quality, autoQuality, paletteId, paletteLocks, enabledAssets, assetWeightOverrides,
    paletteOverrides, lockedParams, caGrid, customAssets, layers, activeLayerId, layerSnapshots,
    userPalettes, favorites, rendering, watchdogTripGen,
  } = state;
  const setRendering = (v) => emit(Events.EXPORT_RENDERING, v);

  const [message, setMessage] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null);
  const cancelBatchRef = useRef(false);
  const watchdogGenRef = useRef(watchdogTripGen);
  // #172: print desk modal, lazy-loaded like Asset Studio (AssetPoolPanel).
  const [PrintDesk, setPrintDesk] = useState(null);
  const openPrintDesk = async () => {
    try {
      const mod = await import('./PrintDeskModal.jsx');
      setPrintDesk(() => mod.PrintDeskModal);
    } catch (e) {
      setMessage(`Print Desk failed to load — reload the page to retry. (${e && e.message ? e.message : String(e)})`);
    }
  };

  const accumOn = !!layoutParams.accumulation;

  const [metalStats, setMetalStats] = useState(null);
  const [metalDispatchTime, setMetalDispatchTime] = useState(null);
  const [metalBusy, setMetalBusy] = useState(false);

  const handleTestNativeIO = async () => {
    try {
      // 1x1 valid PNG binary header & chunk payload (67 bytes)
      const dummyBytes = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89,
        0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54,
        0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4,
        0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
        0xAE, 0x42, 0x60, 0x82,
      ]);
      const bytesWritten = await invoke('write_batch_frame', {
        data: Array.from(dummyBytes),
        path: '/tmp/kc_native_test.png',
      });
      setMessage(`Native I/O OK: ${bytesWritten} bytes -> /tmp/kc_native_test.png`);
    } catch (err) {
      console.error('Native I/O test failed:', err);
      setMessage(`Native I/O: ${err?.message || err}`);
    }
  };

  const handleMetalInit = async () => {
    try {
      setMetalBusy(true);
      const stats = await invoke('metal_init', {
        width: 1440,
        height: 900,
        particleCount: 2048,
      });
      setMetalStats(stats);
      setMessage(`Metal Ready: ${stats.device_name} (UMA: ${stats.has_unified_memory ? 'YES' : 'NO'})`);
    } catch (err) {
      console.error('Metal Init failed:', err);
      setMessage(`Metal Error: ${err?.message || err}`);
    } finally {
      setMetalBusy(false);
    }
  };

  const handleMetalStep = async () => {
    try {
      setMetalBusy(true);
      const t0 = performance.now();
      await invoke('metal_step_boids', {
        deltaTime: 0.016,
        maxSpeed: 60.0,
        attractorX: 720.0,
        attractorY: 450.0,
        strength: 650.0,
      });
      const updatedStats = await invoke('metal_step_accum', {
        fade: 0.96,
        bgR: 0.0,
        bgG: 0.0,
        bgB: 0.0,
        bgA: 1.0,
      });
      const dt = performance.now() - t0;
      setMetalDispatchTime(dt.toFixed(2));
      setMetalStats(updatedStats);
      setMessage(`Metal Pass #${updatedStats.frame_counter} dispatched in ${dt.toFixed(2)}ms`);
    } catch (err) {
      console.error('Metal Step failed:', err);
      setMessage(`Metal Step: ${err?.message || err}`);
    } finally {
      setMetalBusy(false);
    }
  };

  const [curatorBusy, setCuratorBusy] = useState(false);

  const handleCuratorEval = async () => {
    try {
      setCuratorBusy(true);
      const res = await invoke('curator_evaluate_frame');
      setMessage(`ANE Curation: ${(res.score * 100).toFixed(1)}% (${res.latency_ms.toFixed(1)}ms on ${res.compute_units})`);
    } catch (err) {
      console.error('Curator ANE eval failed:', err);
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
        const { listen } = await import('@tauri-apps/api/event');
        if (cancelled) return;
        unlisten = await listen('media-export-progress', (event) => {
          setMediaProgress(event.payload);
          if (event.payload?.finished) {
            setTimeout(() => {
              setMediaProgress(p => (p?.finished ? null : p));
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
    try {
      setMediaBusy(true);
      const res = await invoke('start_media_engine_export', {
        path: '/tmp/kc_export_media_engine.mov',
        frameCount: 60,
        fps: 60,
        codec: 'hevc',
      });
      setMessage(`Media Engine: ${res}`);
    } catch (err) {
      console.error('Media engine export failed:', err);
      setMessage(`Media Export: ${err?.message || err}`);
    } finally {
      setMediaBusy(false);
    }
  };

  const handleECoreBatchDump = async () => {
    try {
      setMediaBusy(true);
      const res = await invoke('dump_image_batch', {
        targetDir: '/tmp/kc_batch_export_ecore',
        count: 60,
        format: 'png',
      });
      setMessage(`E-Core Dump: ${res}`);
    } catch (err) {
      console.error('E-Core dump failed:', err);
      setMessage(`E-Core Dump: ${err?.message || err}`);
    } finally {
      setMediaBusy(false);
    }
  };

  // #107 §4 (flip mechanism deleted in #191): a watchdog trip (tier 2 — FPS
  // ~0 or a critical render-error) mid-export must not leave the UI stuck
  // showing RENDERING — running=false alone doesn't undo that. There is no
  // live-store flip left to undo; batch cancellation is the only restore.
  useEffect(() => {
    if (watchdogTripGen === watchdogGenRef.current) return;
    watchdogGenRef.current = watchdogTripGen;
    if (batchProgress) {
      cancelBatchRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBatchProgress(null);
    }
    setRendering(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchdogTripGen]);

  return (
    <div className="panel panel-pipeline panel-output">
      <PanelHeader tag="P05" title="PIPELINE" subtitle={`${snapshots.length} snaps`} />
      <div className="panel-body pipeline-body output-body">
        {/* ── IN: import, load, paste ── */}
        <div className="pipeline-section-label">IN</div>
        <RecipeRow onMessage={setMessage} />
        <DataExportRow
          seed={seed} seedOffsets={seedOffsets} paletteId={paletteId} paletteOverrides={paletteOverrides} paletteLocks={paletteLocks}
          layoutParams={layoutParams} lockedParams={lockedParams} caGrid={caGrid}
          enabledAssets={enabledAssets} quality={quality} autoQuality={autoQuality} assetWeightOverrides={assetWeightOverrides}
          customAssets={customAssets} layers={layers} activeLayerId={activeLayerId}
          layerSnapshots={layerSnapshots} userPalettes={userPalettes} favorites={favorites}
          onMessage={setMessage}
        />

        {/* ── PROCESS: render, post ── */}
        <div className="pipeline-section-label">PROCESS</div>

        <RenderFinalBlock
          glLoopRef={glLoopRef} palette={palette} seed={seed} layoutParams={layoutParams}
          exportResolution={exportResolution} accumOn={accumOn}
          rendering={rendering} setRendering={setRendering}
          batchActive={!!batchProgress}
        />

        <PrintDeskBlock rendering={rendering} onOpen={openPrintDesk} />

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
              cursor: 'pointer',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
            onClick={handleTestNativeIO}
          >
            ⚡ TEST NATIVE DISK I/O
          </button>
        </div>

        <div
          style={{
            marginTop: '8px',
            marginBottom: '8px',
            padding: '8px',
            background: 'rgba(0, 255, 136, 0.04)',
            border: '1px solid rgba(0, 255, 136, 0.25)',
            borderRadius: '4px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ color: 'var(--accent, #00ff88)', fontWeight: 600 }}>METAL ZERO-COPY (UMA)</span>
            <span style={{ color: metalStats ? '#00ff88' : '#888' }}>
              {metalStats ? '● ACTIVE' : '○ STANDBY'}
            </span>
          </div>

          {metalStats ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '8px', color: 'var(--text-muted, #aaa)', fontSize: '10px' }}>
              <div>DEVICE: <span style={{ color: '#fff' }}>{metalStats.device_name}</span></div>
              <div>UMA SHARED: <span style={{ color: metalStats.has_unified_memory ? '#00ff88' : '#ffaa00' }}>{metalStats.has_unified_memory ? 'YES (Coherent)' : 'NO'}</span></div>
              <div>ACCUM PTR: <span style={{ color: '#00ff88' }}>{metalStats.accum_buffer_ptr}</span> ({((metalStats.accum_buffer_bytes) / 1048576).toFixed(2)} MB)</div>
              <div>BOIDS PTR: <span style={{ color: '#00ff88' }}>{metalStats.boids_buffer_ptr}</span> ({((metalStats.boids_buffer_bytes) / 1024).toFixed(1)} KB)</div>
              <div>FRAMES DISPATCHED: <span style={{ color: '#fff' }}>#{metalStats.frame_counter}</span> {metalDispatchTime ? `(${metalDispatchTime}ms)` : ''}</div>
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
                  cursor: metalBusy ? 'wait' : 'pointer',
                }}
                disabled={metalBusy}
                onClick={handleMetalInit}
              >
                {metalBusy ? 'INITIALIZING...' : '⚡ INIT METAL UMA'}
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
                  cursor: metalBusy ? 'wait' : 'pointer',
                }}
                disabled={metalBusy}
                onClick={handleMetalStep}
              >
                {metalBusy ? 'COMPUTING...' : '⚡ DISPATCH METAL PASS'}
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
            borderRadius: '4px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ color: '#ffaa00', fontWeight: 600 }}>ANE CURATION ENGINE (CORE ML)</span>
            <span style={{ color: state.curatorActive ? '#00ff88' : '#888' }}>
              {state.curatorActive ? '● ANE ACTIVE' : '○ IDLE'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '8px', color: 'var(--text-muted, #aaa)', fontSize: '10px' }}>
            <div>TARGET: <span style={{ color: '#fff' }}>.cpuAndNeuralEngine (16-Core ANE)</span></div>
            <div>INGEST: <span style={{ color: '#00ff88' }}>Zero-Copy CVPixelBuffer (UMA)</span></div>
            <div>
              TASTE CONFIDENCE:{' '}
              <span
                style={{
                  fontWeight: 600,
                  color: (state.curatorConfidence || 0) >= 0.85 ? '#00ff88' : (state.curatorConfidence || 0) >= 0.5 ? '#ffaa00' : '#aaa',
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
              padding: '5px 8px',
              cursor: curatorBusy ? 'wait' : 'pointer',
            }}
            disabled={curatorBusy}
            onClick={handleCuratorEval}
          >
            {curatorBusy ? 'EVALUATING ON ANE...' : '⚡ EVALUATE FRAME ON ANE'}
          </button>
        </div>

        {/* ── OUT: batch, capture, gallery ── */}
        <div className="pipeline-section-label">OUT</div>

        <div
          style={{
            marginTop: '4px',
            marginBottom: '8px',
            padding: '8px',
            background: 'rgba(0, 229, 255, 0.04)',
            border: '1px solid rgba(0, 229, 255, 0.25)',
            borderRadius: '4px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ color: '#00e5ff', fontWeight: 600 }}>APPLE MEDIA ENGINE &amp; E-CORES</span>
            <span style={{ color: mediaBusy || (mediaProgress && !mediaProgress.finished) ? '#00e5ff' : '#888' }}>
              {mediaBusy || (mediaProgress && !mediaProgress.finished) ? '● STREAMING' : '○ READY'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '8px', color: 'var(--text-muted, #aaa)', fontSize: '10px' }}>
            <div>VIDEO CODEC: <span style={{ color: '#fff' }}>AVAssetWriter (HEVC hvc1 / ProRes 4444)</span></div>
            <div>BATCH QUEUE: <span style={{ color: '#00e5ff' }}>Pinned to E-Cores (QOS_CLASS_BACKGROUND)</span></div>
            {mediaProgress && (
              <div>
                PROGRESS: <span style={{ color: '#00e5ff' }}>{mediaProgress.completed}/{mediaProgress.total} frames</span>{' '}
                ({mediaProgress.fps.toFixed(1)} fps)
              </div>
            )}
          </div>

          {mediaProgress && (
            <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden', marginBottom: '8px' }}>
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
                cursor: mediaBusy ? 'wait' : 'pointer',
              }}
              disabled={mediaBusy}
              onClick={handleMediaVideoExport}
            >
              {mediaBusy ? 'STREAMING...' : '⚡ RECORD HEVC VIDEO'}
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
                cursor: mediaBusy ? 'wait' : 'pointer',
              }}
              disabled={mediaBusy}
              onClick={handleECoreBatchDump}
            >
              {mediaBusy ? 'DUMPING...' : '⚡ DUMP BATCH (E-CORES)'}
            </button>
          </div>
        </div>

        <BatchEditionBlock
          glLoopRef={glLoopRef} palette={palette} seed={seed} layoutParams={layoutParams}
          quality={quality} paletteId={paletteId} exportResolution={exportResolution}
          accumOn={accumOn} rendering={rendering} setRendering={setRendering}
          batchProgress={batchProgress} setBatchProgress={setBatchProgress}
          cancelBatchRef={cancelBatchRef} onDone={setMessage}
        />

        <SnapRecordRow
          glCanvasRef={glCanvasRef} glLoopRef={glLoopRef} palette={palette} seed={seed} seedOffsets={seedOffsets}
          layoutParams={layoutParams}
          exportResolution={exportResolution} accumOn={accumOn} isRecording={isRecording} rendering={rendering}
        />

        <LoopCaptureBlock
          glLoopRef={glLoopRef} seed={seed} rendering={rendering} setRendering={setRendering}
        />

        {message && (
          <div className="pipeline-hint" style={{ color: message.includes('done') || message === 'Project loaded' ? '#00ff88' : 'var(--accent)' }}>
            {message}
          </div>
        )}

        <SnapshotGallery snapshots={snapshots} />
      </div>
      {PrintDesk && <PrintDesk onClose={() => setPrintDesk(null)} />}
    </div>
  );
}
