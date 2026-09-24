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
import { QualityRow } from './pipeline/QualityRow.jsx';
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
    canvasBg: s.canvasBg,
  }));
  const {
    snapshots, exportResolution, isRecording, seed, seedOffsets, layoutParams,
    quality, autoQuality, paletteId, enabledAssets, assetWeightOverrides,
    paletteOverrides, lockedParams, caGrid, customAssets, layers, activeLayerId, layerSnapshots,
    userPalettes, favorites, rendering, watchdogTripGen, canvasBg,
  } = state;
  const setRendering = (v) => emit(Events.EXPORT_RENDERING, v);

  const [message, setMessage] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null);
  const cancelBatchRef = useRef(false);
  const watchdogGenRef = useRef(watchdogTripGen);
  // #172: print desk modal, lazy-loaded like Asset Studio (AssetPoolPanel).
  const [PrintDesk, setPrintDesk] = useState(null);
  const openPrintDesk = async () => {
    const mod = await import('./PrintDeskModal.jsx');
    setPrintDesk(() => mod.PrintDeskModal);
  };

  const accumOn = !!layoutParams.accumulation;

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
    <div className="panel panel-pipeline">
      <PanelHeader tag="P05" title="PIPELINE" subtitle={`${snapshots.length} snaps`}>
        {/* #310: canvas background cycle lives here now (was CANVAS header) */}
        <button className="chip-btn" onClick={() => emit(Events.CANVAS_BG_CYCLE)} title="Toggle canvas background">BG: {canvasBg.toUpperCase()}</button>
      </PanelHeader>
      <div className="panel-body pipeline-body">
        {/* ── IN: import, load, paste ── */}
        <div className="pipeline-section-label">IN</div>
        <RecipeRow onMessage={setMessage} />
        <DataExportRow
          seed={seed} paletteId={paletteId} paletteOverrides={paletteOverrides}
          layoutParams={layoutParams} lockedParams={lockedParams} caGrid={caGrid}
          enabledAssets={enabledAssets} quality={quality} assetWeightOverrides={assetWeightOverrides}
          customAssets={customAssets} layers={layers} activeLayerId={activeLayerId}
          layerSnapshots={layerSnapshots} userPalettes={userPalettes} favorites={favorites}
          onMessage={setMessage}
        />

        {/* ── PROCESS: quality, render, post ── */}
        <div className="pipeline-section-label">PROCESS</div>
        <QualityRow quality={quality} autoQuality={autoQuality} />

        <RenderFinalBlock
          glLoopRef={glLoopRef} palette={palette} seed={seed} layoutParams={layoutParams}
          exportResolution={exportResolution} accumOn={accumOn}
          rendering={rendering} setRendering={setRendering}
          batchActive={!!batchProgress}
        />

        <PrintDeskBlock rendering={rendering} onOpen={openPrintDesk} />

        {/* ── OUT: batch, capture, gallery ── */}
        <div className="pipeline-section-label">OUT</div>
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
