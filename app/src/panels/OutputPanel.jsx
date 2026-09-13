// OutputPanel (P05) — export + quality controls
import { useRef } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { useCollapse } from '../hooks/useCollapse.js';
import { usePanelResize } from '../hooks/usePanelResize.js';
import { exportSnapshot, useVideoRecorder } from '../hooks/useMediaExport.js';
import { QUALITY_PRESETS } from '../data/quality.js';
import * as A from '../state/actions.js';

export function OutputPanel() {
  const { dispatch, palette, svgRef } = useApp();
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
  const { open, toggle } = useCollapse(false);
  const { height, handleProps } = usePanelResize(200, { min: 100, max: 500 });

  useVideoRecorder({
    svgRef,
    isRecording,
    seedStr: seed.toString(16),
    fps: 15,
  });

  const addSnapshot = () => {
    exportSnapshot(svgRef.current, exportResolution, seed.toString(16));
    dispatch({
      type: A.ADD_SNAPSHOT,
      snapshot: {
        seed,
        format: 'PNG',
        resolution: exportResolution === 1 ? '1920×1080' : exportResolution === 2 ? '3840×2160' : '7680×4320',
        timestamp: new Date().toISOString().slice(11, 19),
        config: { layout: { ...layoutParams }, palette: { id: palette.id } },
      },
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
          if (!isNaN(seedVal)) dispatch({ type: A.SET_SEED, payload: seedVal });
        }
        if (config.palette) dispatch({ type: A.SET_PALETTE_ID, payload: config.palette });
        if (config.layout) {
          dispatch({ type: A.APPLY_PRESET, preset: { id: config.layout.composition || 'praystation', params: config.layout } });
        }
      } catch (err) {
        console.warn('Failed to import config:', err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="panel panel-output" style={open ? { height, minHeight: 100 } : undefined}>
      <PanelHeader tag="P05" title="OUTPUT" subtitle={`${snapshots.length} snaps`} collapsed={!open} onToggle={toggle} />
      {open && (
        <>
          <div className="panel-body output-body" style={{ flex: 1, overflow: 'auto' }}>
            {/* Quality presets */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--dim)', marginBottom: 4 }}>QUALITY</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {Object.values(QUALITY_PRESETS).map(q => (
                  <button
                    key={q.id}
                    className={`chip-btn ${quality === q.id ? 'active' : ''}`}
                    title={q.description}
                    onClick={() => dispatch({ type: A.SET_QUALITY, payload: q.id })}
                    style={quality === q.id ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
                  >
                    {q.label}
                  </button>
                ))}
                <button
                  className={`chip-btn ${autoQuality ? 'active' : ''}`}
                  title="Automatically step quality down when FPS stays low"
                  onClick={() => dispatch({ type: A.SET_AUTO_QUALITY, payload: !autoQuality })}
                  style={autoQuality ? { borderColor: '#00ff88', color: '#00ff88' } : {}}
                >
                  AUTO {autoQuality ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <div className="output-row">
              <select
                value={exportResolution}
                onChange={e => dispatch({ type: A.SET_EXPORT_RESOLUTION, payload: parseInt(e.target.value) })}
                style={{ padding: '4px', fontSize: '10px', background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)', flex: 1 }}
              >
                <option value={1}>1x (1920×1080)</option>
                <option value={2}>2x (3840×2160)</option>
                <option value={4}>4x (7680×4320)</option>
              </select>
              <button className="big-btn" onClick={addSnapshot} style={{ flex: 2 }}>\u2193 SNAP</button>
            </div>

            <div className="output-row">
              <button
                className="big-btn"
                onClick={() => dispatch({ type: A.SET_IS_RECORDING, payload: !isRecording })}
                style={isRecording ? { background: '#ff2d6f', color: '#fff', borderColor: '#ff2d6f', flex: 2 } : { flex: 2 }}
              >
                {isRecording ? '\u23f9 STOP REC' : '\u23fa REC WEBM'}
              </button>
              <button className="big-btn dl" onClick={exportJSON} style={{ flex: 1 }}>\u2193 JSON</button>
              <button className="big-btn" onClick={() => fileInputRef.current?.click()} style={{ flex: 1 }}>\u2191 IMPORT</button>
              <input ref={fileInputRef} type="file" accept=".json" onChange={importConfig} style={{ display: 'none' }} />
            </div>

            <div className="output-row">
              <button className="big-btn dl" onClick={() => dispatch({ type: A.CLEAR_SNAPSHOTS })} style={{ width: '100%' }}>\u2715 CLEAR</button>
            </div>

            {snapshots.length > 0 && (
              <div className="snapshot-strip">
                {snapshots.map((s, i) => (
                  <div key={i} className="snap">
                    <div className="snap-thumb"><span className="snap-fmt">{s.format}</span></div>
                    <div className="snap-meta">
                      <span>{s.seed.toString(16)}</span>
                      <span>{s.resolution}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {snapshots.length === 0 && (
              <div className="output-hint">Press <b>S</b> to capture \u00b7 JSON sidecar included</div>
            )}
          </div>
          <div className="panel-resize-handle" {...handleProps}>
            <div className="resize-grip"></div>
          </div>
        </>
      )}
    </div>
  );
}
