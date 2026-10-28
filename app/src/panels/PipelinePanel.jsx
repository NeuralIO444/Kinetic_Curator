// PipelinePanel (P05) — composition shell. Split into panels/pipeline/
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
import { RenderFinalBlock } from './pipeline/RenderFinalBlock.jsx';
import { DisplayBlock } from './pipeline/DisplayBlock.jsx';
import { SetupBlock } from './pipeline/SetupBlock.jsx';
import { StageBlock } from './pipeline/StageBlock.jsx';
import { BatchEditionBlock } from './pipeline/BatchEditionBlock.jsx';
import { SnapRecordRow } from './pipeline/SnapRecordRow.jsx';
import { LoopCaptureBlock } from './pipeline/LoopCaptureBlock.jsx';
import { DataExportRow } from './pipeline/DataExportRow.jsx';
import { RecipeRow } from './pipeline/RecipeRow.jsx';
import { SnapshotGallery } from './pipeline/SnapshotGallery.jsx';
import { LatestCapture } from './pipeline/LatestCapture.jsx';
import { NativeLabBlock } from './pipeline/NativeLabBlock.jsx';
import { LootRow } from './pipeline/LootRow.jsx'; // #1479: the loot folder
import { ProjectFolderRow } from './pipeline/ProjectFolderRow.jsx'; // #1709: the project folder

export function PipelinePanel() {
  const { palette, glCanvasRef, glLoopRef } = useApp();
  const { state } = useApp((s) => ({
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
    assetKineme: s.assetKineme, // #781
    regionKinemes: s.regionKinemes, // #1434
    audioRoutes: s.audioRoutes, // #790
    midiMap: s.midiMap, // #617
    midiBanks: s.midiBanks, // #1720
    midiActiveBank: s.midiActiveBank, // #1720
    paletteOverrides: s.paletteOverrides,
    lockedParams: s.lockedParams,
    caGrid: s.caGrid,
    customAssets: s.customAssets,
    layers: s.layers,
    activeLayerId: s.activeLayerId,
    layerSnapshots: s.layerSnapshots,
    userPalettes: s.userPalettes,
    favorites: s.favorites,
    keeps: s.keeps,
    watchdogTripGen: s.watchdogTripGen,
  }));
  const {
    snapshots,
    exportResolution,
    isRecording,
    seed,
    seedOffsets,
    layoutParams,
    quality,
    autoQuality,
    paletteId,
    paletteLocks,
    enabledAssets,
    assetWeightOverrides,
    assetKineme,
    regionKinemes,
    audioRoutes,
    midiMap,
    midiBanks,
    midiActiveBank,
    paletteOverrides,
    lockedParams,
    caGrid,
    customAssets,
    layers,
    activeLayerId,
    layerSnapshots,
    userPalettes,
    favorites,
    keeps,
    rendering,
    watchdogTripGen,
  } = state;
  const setRendering = (v) => emit(Events.EXPORT_RENDERING, v);

  const [message, setMessage] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null);
  const cancelBatchRef = useRef(false);
  const watchdogGenRef = useRef(watchdogTripGen);

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
    <div className="panel panel-pipeline panel-output">
      <PanelHeader tag="P05" title="PIPELINE" subtitle={`${snapshots.length} snaps`} />
      <div className="panel-body pipeline-body output-body">
        {/* ESSENTIALS — the three things every session needs, with the
            result shown right under the buttons. */}
        <section className="pipeline-essentials" aria-label="Essentials">
          <div className="pipeline-section-label pipeline-essentials-label">ESSENTIALS</div>
          <SnapRecordRow
            glCanvasRef={glCanvasRef}
            glLoopRef={glLoopRef}
            palette={palette}
            seed={seed}
            seedOffsets={seedOffsets}
            layoutParams={layoutParams}
            exportResolution={exportResolution}
            accumOn={accumOn}
            isRecording={isRecording}
            rendering={rendering}
          />
          <RenderFinalBlock
            glLoopRef={glLoopRef}
            palette={palette}
            seed={seed}
            layoutParams={layoutParams}
            exportResolution={exportResolution}
            accumOn={accumOn}
            rendering={rendering}
            setRendering={setRendering}
            batchActive={!!batchProgress}
          />
          <LatestCapture snapshots={snapshots} message={message} />
        </section>

        <div className="pipeline-section-label">CAPTURE · MORE</div>
        <LoopCaptureBlock glLoopRef={glLoopRef} seed={seed} rendering={rendering} setRendering={setRendering} />
        <BatchEditionBlock
          glLoopRef={glLoopRef}
          palette={palette}
          seed={seed}
          layoutParams={layoutParams}
          quality={quality}
          paletteId={paletteId}
          exportResolution={exportResolution}
          accumOn={accumOn}
          rendering={rendering}
          setRendering={setRendering}
          batchProgress={batchProgress}
          setBatchProgress={setBatchProgress}
          cancelBatchRef={cancelBatchRef}
          onDone={setMessage}
        />

        <div className="pipeline-section-label">SNAPSHOTS</div>
        <SnapshotGallery snapshots={snapshots} />

        <div className="pipeline-section-label">PROJECT</div>
        <ProjectFolderRow />
        <RecipeRow onMessage={setMessage} />
        <DataExportRow
          seed={seed}
          seedOffsets={seedOffsets}
          paletteId={paletteId}
          paletteOverrides={paletteOverrides}
          paletteLocks={paletteLocks}
          layoutParams={layoutParams}
          lockedParams={lockedParams}
          caGrid={caGrid}
          enabledAssets={enabledAssets}
          quality={quality}
          autoQuality={autoQuality}
          assetWeightOverrides={assetWeightOverrides}
          assetKineme={assetKineme}
          regionKinemes={regionKinemes}
          audioRoutes={audioRoutes}
          midiMap={midiMap}
          midiBanks={midiBanks}
          midiActiveBank={midiActiveBank}
          customAssets={customAssets}
          layers={layers}
          activeLayerId={activeLayerId}
          layerSnapshots={layerSnapshots}
          userPalettes={userPalettes}
          favorites={favorites}
          keeps={keeps}
          onMessage={setMessage}
        />

        <div className="pipeline-section-label">SETUP</div>
        <SetupBlock />
        <DisplayBlock />
        <StageBlock />
        <LootRow />

        <details className="ds-dev">
          <summary>DEV · NATIVE</summary>
          <NativeLabBlock onMessage={setMessage} />
        </details>
      </div>
    </div>
  );
}
