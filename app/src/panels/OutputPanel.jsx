// OutputPanel (P05) — export + quality (emit-only actions)
import { useRef } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { exportSnapshot, useVideoRecorder } from '../hooks/useMediaExport.js';
import { QUALITY_PRESETS } from '../data/quality.js';
import { emit, Events } from '../composition/eventBus.js';

export function OutputPanel() {
  const { palette, svgRef } = useApp();
  const { state } = useApp(s => ({
    snapshots: s.snapshots,
    exportResolution: s.exportResolution,
    isRecording: s.isRecording,
    seed: s.seed,
    layoutParams: s.layoutParams,
    quality: s.quality,
    autoQuality: s.autoQuality,
  }));
  const { snapshots, exportResolution, isRecording, seed, layoutParams, quality, autoQuality } = state;

  useVideoRecorder({
    svgRef,
    isRecording,
    seedStr: seed.toString(16),
    fps: 15,
  });

  const addSnapshot = () => {
    exportSnapshot(svgRef.current, exportResolution, seed.toString(16), palette.bg, (thumb) => {
      emit(Events.EXPORT_SNAPSHOT, {
        seed,
        format: 'PNG',
        resolution: exportResolution === 1 ? '1920×1080' : exportResolution === 2 ? '3840×2160' : '7680×4320',
        timestamp: new Date().toISOString().slice(11, 19),
        config: { layout: { ...layoutParams }, palette: { id: palette.id } },
        thumb,
      });
    });
  };

  const exportJSON = () => {
    const config = {
      seed: seed.toString(16),
      palette: palette.id,
      layout: layoutParams,
      timestamp: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kinetic-curator-${seed.toString(16)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const fileInputRef = useRef(null);
  const importConfig = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const config = JSON.parse(ev.target.result);
        if (config.seed) {
          const seedVal = typeof config.seed === 'string' ? parseInt(config.seed, 16) : config.seed;
          if (!isNaN(seedVal)) emit(Events.EXPORT_SEED, seedVal);
        }
        if (config.palette) emit(Events.EXPORT_PALETTE, config.palette);
        if (config.layout) {
          emit(Events.EXPORT_IMPORT_LAYOUT, { id: config.layout.composition || 'praystation', params: config.layout });
        }
      } catch (err) {
        console.warn('Failed to import config:', err);
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

        <div className="output-row">
          <select
            value={exportResolution}
            onChange={e => emit(Events.EXPORT_RESOLUTION, parseInt(e.target.value))}
            style={{ padding: '4px', fontSize: '10px', background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)', flex: 1 }}
          >
            <option value={1}>1x (1920×1080)</option>
            <option value={2}>2x (3840×2160)</option>
            <option value={4}>4x (7680×4320)</option>
          </select>
          <button className="big-btn" onClick={addSnapshot} style={{ flex: 2 }}>↓ SNAP</button>
        </div>

        <div className="output-row">
          <button
            className="big-btn"
            onClick={() => emit(Events.EXPORT_RECORD, !isRecording)}
            style={isRecording ? { background: '#ff2d6f', color: '#fff', borderColor: '#ff2d6f', flex: 2 } : { flex: 2 }}
          >
            {isRecording ? '⏹ STOP REC' : '⏺ REC WEBM'}
          </button>
          <button className="big-btn dl" onClick={exportJSON} style={{ flex: 1 }}>↓ JSON</button>
          <button className="big-btn" onClick={() => fileInputRef.current?.click()} style={{ flex: 1 }}>↑ IMPORT</button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={importConfig} style={{ display: 'none' }} />
        </div>

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
          <div className="output-hint">Press <b>S</b> to capture · JSON sidecar included</div>
        )}
      </div>
    </div>
  );
}
