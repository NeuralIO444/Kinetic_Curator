import { useState } from 'react';
import { emit, Events } from '../../composition/eventBus.js';
import { useStore } from '../../state/store.js';
import { renderBatch } from '../../hooks/useMediaExport.js';
import { resolutionLabel } from '../../data/quality.js';

// cancelBatchRef is a prop, not local state — the parent's watchdog-trip
// effect (#107 §5) also needs to flip it when a render dies mid-batch, so
// the ref has to be created where that effect lives, not in here.
export function BatchEditionBlock({
  glLoopRef, palette, seed, layoutParams, quality, paletteId, exportResolution,
  accumOn, rendering, setRendering, batchProgress, setBatchProgress,
  cancelBatchRef, onDone,
}) {
  const [batchCount, setBatchCount] = useState(8);
  // #569 — batch settles on frame advance; a paused loop never advances,
  // so the run hangs ~12s then fails generic. Refuse with a reason instead.
  const running = useStore((s) => s.running);

  const runBatch = async () => {
    if (rendering) return;
    setRendering(true);
    cancelBatchRef.current = false;
    setBatchProgress({ done: 0, total: batchCount, seed });

    const startSeed = seed;

    // #107 §5: hold evolve/drift off for the whole batch, independent of the
    // watchdog's own slowRender/perfTier1 (which auto-clear on live FPS and
    // would fight a pause that must last the whole batch regardless).
    emit(Events.EXPORT_BATCH_PAUSE, true);
    try {
      const results = await renderBatch({
        loopRef: glLoopRef,
        count: batchCount,
        startSeed: seed,
        resolution: exportResolution,
        setSeed: (s) => emit(Events.EXPORT_SEED, s),
        getSidecar: () => ({
          layout: { ...layoutParams },
          palette: { id: paletteId },
          quality,
        }),
        onProgress: ({ done, total, seed: s, thumb }) => {
          setBatchProgress({ done, total, seed: s });
          if (thumb) {
            emit(Events.EXPORT_SNAPSHOT, {
              seed: s,
              format: 'PNG',
              resolution: `${resolutionLabel(exportResolution)} · BATCH ${done}/${total}`,
              timestamp: new Date().toISOString().slice(11, 19),
              config: { layout: { ...layoutParams }, palette: { id: palette.id }, batch: true },
              thumb,
            });
          }
        },
        shouldCancel: () => cancelBatchRef.current,
      });
      if (results.cancelled) {
        emit(Events.EXPORT_SEED, startSeed);
        onDone(`Batch stopped after ${results.done}`);
      } else {
        onDone(`Batch complete: ${results.done} stills`);
      }
    } catch (e) {
      console.warn('[BATCH]', e);
      emit(Events.EXPORT_SEED, startSeed);
      onDone('Batch failed');
    } finally {
      setRendering(false);
      setBatchProgress(null);
      cancelBatchRef.current = false;
      emit(Events.EXPORT_BATCH_PAUSE, false);
    }
  };

  return (
    <div style={{ marginBottom: 8, padding: 8, border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--dim)', marginBottom: 6 }}>BATCH EDITION</div>
      <div className="pipeline-row" style={{ marginBottom: 6, gap: 6 }}>
        <label style={{ fontSize: 10, color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
          N
          <input
            type="number"
            min={1}
            max={48}
            value={batchCount}
            disabled={rendering}
            onChange={(e) => setBatchCount(Math.max(1, Math.min(48, parseInt(e.target.value, 10) || 1)))}
            style={{ width: 48, padding: '4px', fontSize: 11, background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)' }}
          />
        </label>
        <span style={{ fontSize: 10, color: 'var(--dim)' }}>
          from seed <code>{seed.toString(16)}</code>
        </span>
      </div>
      <div className="pipeline-row" style={{ gap: 6 }}>
        <button
          type="button"
          className="big-btn"
          onClick={runBatch}
          disabled={rendering || accumOn || !running}
          style={{
            flex: 2,
            background: rendering && batchProgress ? 'var(--line)' : undefined,
            fontWeight: 700,
            letterSpacing: '0.06em',
          }}
          title={!running ? 'Batch needs the loop running — resume with Space first (a paused loop never settles)' : accumOn ? 'Batch needs ACCUM off — trails would bleed across seeds' : 'Render N sequential seeds as PNG + JSON sidecar'}
        >
          {batchProgress
            ? `BATCH ${batchProgress.done}/${batchProgress.total}…`
            : `▶ BATCH ×${batchCount}`}
        </button>
        {batchProgress && (
          <button
            type="button"
            className="chip-btn"
            onClick={() => { cancelBatchRef.current = true; }}
            title="Stop after current frame"
          >
            STOP
          </button>
        )}
      </div>
    </div>
  );
}
