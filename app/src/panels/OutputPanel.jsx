// OutputPanel (P05) — export controls + snapshot history + resizable
import { useRef } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { useCollapse } from '../hooks/useCollapse.js';
import { usePanelResize } from '../hooks/usePanelResize.js';
import { exportSnapshot, useVideoRecorder } from '../hooks/useMediaExport.js';
import * as A from '../state/actions.js';

export function OutputPanel() {
  const { dispatch, palette, svgRef } = useApp();
  const { state } = useApp(s => ({
    snapshots: s.snapshots,
    exportResolution: s.exportResolution,
    isRecording: s.isRecording,
    seed: s.seed,
    layoutParams: s.layoutParams,
  }));
  const { snapshots, exportResolution, isRecording, seed, layoutParams } = state;
  const { open, toggle } = useCollapse(false);
  const { height, handleProps } = usePanelResize(200, { min: 100, max: 500 });

  // Initialize the video recorder hook
  useVideoRecorder({
    svgRef,
    isRecording,
    seedStr: seed.toString(16),
    fps: 30
  });

  const addSnapshot = () => {
    // Save PNG to disk
    exportSnapshot(svgRef.current, exportResolution, seed.toString(16));

    // Save to history state
    const snap = {
      seed,
      format: 'PNG',
      resolution: exportResolution === 1 ? '1920×1080' : exportResolution === 2 ? '3840×2160' : '7680×4320',
      timestamp: new Date().toISOString().slice(11, 19),
      config: { layout: { ...layoutParams }, palette: { id: palette.id } },
    };
    dispatch({ type: A.ADD_SNAPSHOT, snapshot: snap });
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

  // UX-01: Config import — re-import a saved JSON to restore state
  const fileInputRef = useRef(null);
  const importConfig = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const config = JSON.parse(ev.target.result);
        // Restore seed
        if (config.seed) {
          const seedVal = typeof config.seed === 'string' ? parseInt(config.seed, 16) : config.seed;
          if (!isNaN(seedVal)) dispatch({ type: A.SET_SEED, payload: seedVal });
        }
        // Restore palette
        if (config.palette) {
          dispatch({ type: A.SET_PALETTE_ID, payload: config.palette });
        }
        // Restore layout params via preset apply (handles all param keys)
        if (config.layout) {
          dispatch({ type: A.APPLY_PRESET, preset: { id: config.layout.composition || 'praystation', params: config.layout } });
        }
      } catch (err) {
        console.warn('Failed to import config:', err);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset so same file can be re-imported
  };

  return (
    <div className="panel panel-output" style={open ? { height, minHeight: 100 } : undefined}>
      <PanelHeader tag="P05" title="OUTPUT" subtitle={`${snapshots.length} snaps`} collapsed={!open} onToggle={toggle} />
      {open && (
        <>
          <div className="panel-body output-body" style={{ flex: 1, overflow: 'auto' }}>
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
              <button className="big-btn" onClick={addSnapshot} style={{ flex: 2 }}>↓ SNAP</button>
            </div>
            
            <div className="output-row">
              <button 
                className="big-btn" 
                onClick={() => dispatch({ type: A.SET_IS_RECORDING, payload: !isRecording })}
                style={isRecording ? { background: '#ff2d6f', color: '#fff', borderColor: '#ff2d6f', flex: 2 } : { flex: 2 }}
              >
                {isRecording ? '⏹ STOP REC' : '⏺ REC WEBM'}
              </button>
              <button className="big-btn dl" onClick={exportJSON} style={{ flex: 1 }}>↓ JSON</button>
              <button className="big-btn" onClick={() => fileInputRef.current?.click()} style={{ flex: 1 }}>↑ IMPORT</button>
              <input ref={fileInputRef} type="file" accept=".json" onChange={importConfig} style={{ display: 'none' }} />
            </div>

            <div className="output-row">
              <button className="big-btn dl" onClick={() => dispatch({ type: A.CLEAR_SNAPSHOTS })} style={{ width: '100%' }}>✕ CLEAR</button>
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
              <div className="output-hint">Press <b>S</b> to capture · JSON sidecar included</div>
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
