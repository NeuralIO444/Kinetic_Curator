// OutputPanel (P05) — export + quality (emit-only actions)
import { useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { exportSnapshot, renderFinal, renderBatch, useVideoRecorder } from '../hooks/useMediaExport.js';
import { exportAccumulationCanvas } from '../hooks/useAccumulationBuffer.js';
import { QUALITY_PRESETS, FINAL_CAPS } from '../data/quality.js';
import { emit, Events } from '../composition/eventBus.js';
import {
  serializeProject,
  parseProject,
  downloadProject,
} from '../state/projectDocument.js';

export function OutputPanel() {
  const { palette, svgRef, accumRef } = useApp();
  const { state } = useApp(s => ({
    snapshots: s.snapshots,
    exportResolution: s.exportResolution,
    isRecording: s.isRecording,
    rendering: s.isRendering,
    seed: s.seed,
    layoutParams: s.layoutParams,
    quality: s.quality,
    autoQuality: s.autoQuality,
    paletteId: s.paletteId,
    enabledAssets: s.enabledAssets,
    assetWeightOverrides: s.assetWeightOverrides,
    paletteOverrides: s.paletteOverrides,
    lockedParams: s.lockedParams,
    caGrid: s.caGrid,
    layers: s.layers,
    activeLayerId: s.activeLayerId,
    layerSnapshots: s.layerSnapshots,
    userPalettes: s.userPalettes,
    favorites: s.favorites,
  }));
  const {
    snapshots, exportResolution, isRecording, seed, layoutParams,
    quality, autoQuality, paletteId, enabledAssets, assetWeightOverrides,
    paletteOverrides, lockedParams, caGrid, layers, activeLayerId, layerSnapshots,
    userPalettes, favorites, rendering,
  } = state;
  // #107 §7: this lives in the store (not local state) so the App-level
  // hotkey map can debounce N/E while a render is in flight — a seed bump
  // or evolve toggle mid-encode would change what RENDER FINAL is capturing.
  const setRendering = (v) => emit(Events.EXPORT_RENDERING, v);

  const [uncapped, setUncapped] = useState(false);
  const [importMsg, setImportMsg] = useState(null);
  const [batchCount, setBatchCount] = useState(8);
  const [batchProgress, setBatchProgress] = useState(null);
  const cancelBatchRef = useRef(false);
  const restoreRef = useRef(null);

  const accumOn = !!layoutParams.accumulation;

  useVideoRecorder({
    svgRef,
    isRecording,
    seedStr: seed.toString(16),
    fps: 15,
  });

  const resLabel = `1000×700@${exportResolution}x`;

  /** Prefer accumulation buffer when ACCUM is on (#28). */
  const captureStill = async (onThumbnail) => {
    if (accumOn && accumRef?.current) {
      const result = await exportAccumulationCanvas(
        accumRef.current,
        exportResolution,
        seed.toString(16),
        palette.bg,
      );
      onThumbnail?.(result.thumb);
      return result;
    }
    return exportSnapshot(
      svgRef.current,
      exportResolution,
      seed.toString(16),
      palette.bg,
      onThumbnail,
    );
  };

  const addSnapshot = () => {
    captureStill((thumb) => {
      emit(Events.EXPORT_SNAPSHOT, {
        seed,
        format: 'PNG',
        resolution: `${resLabel}${accumOn ? ' · ACCUM' : ''}`,
        timestamp: new Date().toISOString().slice(11, 19),
        config: { layout: { ...layoutParams }, palette: { id: palette.id } },
        thumb,
      });
    }).catch(() => {});
  };

  const runRenderFinal = async () => {
    if (rendering) return;
    setRendering(true);
    const prev = {
      quality,
      count: layoutParams.count,
      mirror: layoutParams.mirror,
    };
    restoreRef.current = prev;

    const applyUncapped = () => {
      emit(Events.EXPORT_QUALITY, 'high');
      emit(Events.LAYOUT_PARAM, { key: 'count', value: FINAL_CAPS.maxCount });
      emit(Events.LAYOUT_PARAM, { key: 'mirror', value: true });
    };
    const restore = () => {
      const r = restoreRef.current;
      if (!r) return;
      emit(Events.EXPORT_QUALITY, r.quality);
      emit(Events.LAYOUT_PARAM, { key: 'count', value: r.count });
      emit(Events.LAYOUT_PARAM, { key: 'mirror', value: r.mirror });
      restoreRef.current = null;
    };

    try {
      if (accumOn) {
        await captureStill((thumb) => {
          emit(Events.EXPORT_SNAPSHOT, {
            seed,
            format: 'PNG',
            resolution: `${resLabel} · ACCUM`,
            timestamp: new Date().toISOString().slice(11, 19),
            config: { layout: { ...layoutParams }, palette: { id: palette.id }, accum: true },
            thumb,
          });
        });
      } else {
        await renderFinal({
          svgNode: svgRef.current,
          resolution: exportResolution,
          seedStr: seed.toString(16),
          background: palette.bg,
          uncapped,
          applyUncapped: uncapped ? applyUncapped : undefined,
          restore: uncapped ? restore : undefined,
          onThumbnail: (thumb) => {
            emit(Events.EXPORT_SNAPSHOT, {
              seed,
              format: 'PNG',
              resolution: `${resLabel}${uncapped ? ' · UNCAPPED' : ' · FINAL'}`,
              timestamp: new Date().toISOString().slice(11, 19),
              config: { layout: { ...layoutParams }, palette: { id: palette.id }, uncapped },
              thumb,
            });
          },
        });
      }
    } catch (e) {
      console.warn('[RENDER]', e);
      restore();
    } finally {
      setRendering(false);
    }
  };

  const runBatch = async () => {
    if (rendering) return;
    setRendering(true);
    cancelBatchRef.current = false;
    setBatchProgress({ done: 0, total: batchCount, seed });

    const prev = {
      quality,
      count: layoutParams.count,
      mirror: layoutParams.mirror,
      seed,
    };
    restoreRef.current = prev;

    const applyUncapped = () => {
      emit(Events.EXPORT_QUALITY, 'high');
      emit(Events.LAYOUT_PARAM, { key: 'count', value: FINAL_CAPS.maxCount });
      emit(Events.LAYOUT_PARAM, { key: 'mirror', value: true });
    };
    const restore = () => {
      const r = restoreRef.current;
      if (!r) return;
      emit(Events.EXPORT_QUALITY, r.quality);
      emit(Events.LAYOUT_PARAM, { key: 'count', value: r.count });
      emit(Events.LAYOUT_PARAM, { key: 'mirror', value: r.mirror });
      emit(Events.EXPORT_SEED, r.seed);
      restoreRef.current = null;
    };

    try {
      const results = await renderBatch({
        svgNode: svgRef.current,
        count: batchCount,
        startSeed: seed,
        resolution: exportResolution,
        background: palette.bg,
        uncapped,
        setSeed: (s) => emit(Events.EXPORT_SEED, s),
        applyUncapped: uncapped ? applyUncapped : undefined,
        restore: uncapped ? restore : undefined,
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
              resolution: `${resLabel} · BATCH ${done}/${total}`,
              timestamp: new Date().toISOString().slice(11, 19),
              config: { layout: { ...layoutParams }, palette: { id: palette.id }, batch: true },
              thumb,
            });
          }
        },
        shouldCancel: () => cancelBatchRef.current,
      });
      if (!uncapped) {
        emit(Events.EXPORT_SEED, prev.seed);
      } else {
        restore();
      }
      setImportMsg(`Batch done · ${results.length} files`);
      setTimeout(() => setImportMsg(null), 3000);
    } catch (e) {
      console.warn('[BATCH]', e);
      restore();
      setImportMsg('Batch failed');
    } finally {
      setRendering(false);
      setBatchProgress(null);
      cancelBatchRef.current = false;
    }
  };

  const exportProject = () => {
    const doc = serializeProject({
      seed,
      paletteId,
      paletteOverrides,
      layoutParams,
      lockedParams,
      caGrid,
      enabledAssets,
      quality,
      assetWeightOverrides,
      layers,
      activeLayerId,
      layerSnapshots,
    });
    downloadProject(doc);
  };

  const exportPalettes = () => {
    const blob = new Blob([JSON.stringify(userPalettes || [], null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kinetic-curator-palettes.json';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };

  const exportHits = () => {
    const doc = {
      version: 1,
      project: serializeProject({
        seed, paletteId, paletteOverrides, layoutParams, lockedParams, caGrid,
        enabledAssets, quality, assetWeightOverrides, layers, activeLayerId, layerSnapshots,
      }),
      hits: (favorites || []).map((f) => ({
        seed: f.seed >>> 0,
        timestamp: f.timestamp,
        layoutParams: f.config?.layout || null,
        paletteId: f.config?.palette?.id || null,
      })),
    };
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kinetic-curator-hits.json';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };

  const paletteInputRef = useRef(null);
  const importPalettes = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        emit(Events.PALETTE_IMPORT, list);
        setImportMsg(`Imported ${list.length} palette${list.length === 1 ? '' : 's'}`);
      } catch {
        setImportMsg('Invalid palette JSON');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const fileInputRef = useRef(null);
  const importProject = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target.result);
        const result = parseProject(raw);
        if (!result.ok) {
          setImportMsg(result.error);
          return;
        }
        emit(Events.EXPORT_LOAD_PROJECT, result.doc);
        setImportMsg('Project loaded');
        setTimeout(() => setImportMsg(null), 2000);
      } catch (err) {
        console.warn('Failed to import project:', err);
        setImportMsg('Invalid JSON');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="panel panel-output">
      <PanelHeader tag="P05" title="OUTPUT" subtitle={`${snapshots.length} snaps`} />
      <div className="panel-body output-body">
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--dim)', marginBottom: 4 }}>QUALITY</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {Object.values(QUALITY_PRESETS).map(q => (
              <button
                key={q.id}
                className={`chip-btn ${quality === q.id ? 'active' : ''}`}
                title={q.description}
                onClick={() => emit(Events.EXPORT_QUALITY, q.id)}
                style={quality === q.id ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
              >
                {q.label}
              </button>
            ))}
            <button
              className={`chip-btn ${autoQuality ? 'active' : ''}`}
              title="Automatically step quality down when FPS stays low"
              onClick={() => emit(Events.EXPORT_AUTO_QUALITY, !autoQuality)}
              style={autoQuality ? { borderColor: '#00ff88', color: '#00ff88' } : {}}
            >
              AUTO {autoQuality ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 8, padding: 8, border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--dim)', marginBottom: 6 }}>RENDER · FINAL STILL</div>
          <div className="output-row" style={{ marginBottom: 6 }}>
            <select
              value={exportResolution}
              onChange={e => emit(Events.EXPORT_RESOLUTION, parseInt(e.target.value, 10))}
              style={{ padding: '4px', fontSize: '10px', background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)', flex: 1 }}
            >
              <option value={1}>1x (1000×700@1x)</option>
              <option value={2}>2x (1000×700@2x)</option>
              <option value={4}>4x (1000×700@4x)</option>
            </select>
            <button
              type="button"
              className={`chip-btn ${uncapped ? 'active' : ''}`}
              title="Lift live quality caps for denser final. Less relevant when ACCUM is on."
              onClick={() => setUncapped(v => !v)}
              disabled={accumOn}
              style={uncapped && !accumOn ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
            >
              UNCAPPED {uncapped && !accumOn ? 'ON' : 'OFF'}
            </button>
          </div>
          <button
            type="button"
            className="big-btn"
            onClick={runRenderFinal}
            disabled={rendering}
            style={{
              width: '100%',
              background: rendering ? 'var(--line)' : 'var(--accent)',
              color: rendering ? 'var(--dim)' : '#000',
              borderColor: 'var(--accent)',
              fontWeight: 800,
              letterSpacing: '0.08em',
            }}
          >
            {rendering && !batchProgress ? 'RENDERING…' : accumOn ? '▶ RENDER ACCUM' : '▶ RENDER FINAL'}
          </button>
          <div className="output-hint" style={{ marginTop: 6 }}>
            {accumOn
              ? 'ACCUM on — export captures the trail buffer (history is pixels, not SVG).'
              : uncapped
                ? 'UNCAPPED densifies composition then restores live caps.'
                : 'Matches live preview. Toggle UNCAPPED for denser final.'}
          </div>
        </div>

        <div style={{ marginBottom: 8, padding: 8, border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--dim)', marginBottom: 6 }}>BATCH EDITION</div>
          <div className="output-row" style={{ marginBottom: 6, gap: 6 }}>
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
          <div className="output-row" style={{ gap: 6 }}>
            <button
              type="button"
              className="big-btn"
              onClick={runBatch}
              disabled={rendering || accumOn}
              style={{
                flex: 2,
                background: rendering && batchProgress ? 'var(--line)' : undefined,
                fontWeight: 700,
                letterSpacing: '0.06em',
              }}
              title={accumOn ? 'Batch uses SVG path — turn ACCUM off' : 'Render N sequential seeds as PNG + JSON sidecar'}
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
          <div className="output-hint" style={{ marginTop: 6 }}>
            {accumOn
              ? 'Batch disabled while ACCUM is on (buffer is continuous time, not per-seed).'
              : 'Downloads kc-edition-###-sXXXXXX.png + JSON. Max 48.'}
          </div>
        </div>

        <div className="output-row">
          <button className="big-btn" onClick={addSnapshot} style={{ flex: 2 }} disabled={rendering}>↓ SNAP</button>
          <button
            className="big-btn"
            onClick={() => emit(Events.EXPORT_RECORD, !isRecording)}
            disabled={rendering}
            style={isRecording ? { background: '#ff2d6f', color: '#fff', borderColor: '#ff2d6f', flex: 2 } : { flex: 2 }}
          >
            {isRecording ? '⏹ STOP REC' : '⏺ REC WEBM'}
          </button>
        </div>

        <div className="output-row">
          <button className="big-btn dl" onClick={exportProject} style={{ flex: 1 }} title="Export full project">↓ PROJECT</button>
          <button className="big-btn" onClick={() => fileInputRef.current?.click()} style={{ flex: 1 }} title="Import project JSON">↑ IMPORT</button>
          <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={importProject} style={{ display: 'none' }} />
        </div>
        <div className="output-row">
          <button className="big-btn dl" onClick={exportPalettes} style={{ flex: 1 }} title={`Export your ${(userPalettes || []).length} saved palettes`}>↓ PALETTES</button>
          <button className="big-btn" onClick={() => paletteInputRef.current?.click()} style={{ flex: 1 }} title="Import palette library JSON">↑ PALETTES</button>
          <input ref={paletteInputRef} type="file" accept=".json,application/json" onChange={importPalettes} style={{ display: 'none' }} />
        </div>
        <div className="output-row">
          <button
            className="big-btn dl"
            onClick={exportHits}
            style={{ width: '100%' }}
            title={`Export ${(favorites || []).length} favourited seed(s) for studio/hits_bridge.py (issue #91)`}
          >
            ↓ HITS ({(favorites || []).length})
          </button>
        </div>
        {importMsg && (
          <div className="output-hint" style={{ color: importMsg.includes('done') || importMsg === 'Project loaded' ? '#00ff88' : 'var(--accent)' }}>
            {importMsg}
          </div>
        )}

        <div className="output-row">
          <button className="big-btn dl" onClick={() => emit(Events.EXPORT_CLEAR_SNAPSHOTS)} style={{ width: '100%' }}>✕ CLEAR</button>
        </div>

        {snapshots.length > 0 && (
          <div className="snapshot-strip">
            {snapshots.map((s) => (
              <div key={s.id} className="snap">
                <div className="snap-thumb">
                  {s.thumb
                    ? <img src={s.thumb} alt={`Snapshot, seed ${s.seed.toString(16)}`} />
                    : <span className="snap-fmt">{s.format}</span>}
                </div>
                <div className="snap-meta">
                  <span>{s.seed.toString(16)}</span>
                  <span>{s.resolution}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {snapshots.length === 0 && (
          <div className="output-hint">Press <b>S</b> for snap · RENDER · BATCH · ACCUM for trails · PROJECT for state</div>
        )}
      </div>
    </div>
  );
}
