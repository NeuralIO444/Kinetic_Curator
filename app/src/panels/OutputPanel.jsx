// OutputPanel (P05) — export controls + snapshot history
import { useRef } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { useCollapse } from '../hooks/useCollapse.js';
import { exportSnapshot, exportSvgFile, useVideoRecorder } from '../hooks/useMediaExport.js';
import * as A from '../state/actions.js';

const FULL_STATE_KEYS = [
  'seed', 'paletteId', 'layoutParams', 'lockedParams', 'motionSmoothing',
  'renderingMode', 'perfMode', 'enabledAssets',
  'blendMode', 'blendStrength', 'echoEnabled', 'echoCount', 'echoDecay',
  'trailEnabled', 'trailLength', 'feedbackEnabled', 'feedbackStrength',
  'feedbackDepth', 'particlesEnabled', 'particleCount', 'particleSpeed',
  'motionEnabled', 'motionType', 'blastRadiusEnabled', 'blastRadius',
  'blastForce', 'colorStrategy', 'colorHarmony',
];

export function OutputPanel() {
  const { dispatch, palette, svgRef } = useApp();
  const fullState = useApp(s => {
    const out = {};
    for (const k of FULL_STATE_KEYS) out[k] = s[k];
    return out;
  }).state;
  const { state } = useApp(s => ({
    snapshots: s.snapshots,
    exportResolution: s.exportResolution,
    isRecording: s.isRecording,
    seed: s.seed,
    layoutParams: s.layoutParams,
    mode: s.mode,
  }));
  const { snapshots, exportResolution, isRecording, seed, layoutParams, mode } = state;
  const isLive = mode === 'live';
  // In STUDIO mode the panel defaults to open so SVG export is one click away.
  const { open, toggle } = useCollapse(mode === 'studio');
  const importInputRef = useRef(null);

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

  const downloadSvg = () => {
    exportSvgFile(svgRef.current, seed.toString(16));
    dispatch({
      type: A.ADD_SNAPSHOT,
      snapshot: {
        seed,
        format: 'SVG',
        resolution: 'vector',
        timestamp: new Date().toISOString().slice(11, 19),
        config: { layout: { ...layoutParams }, palette: { id: palette.id } },
      },
    });
  };

  const exportJSON = () => {
    const config = {
      _format: 'kinetic-curator/preset',
      _version: 1,
      timestamp: new Date().toISOString(),
      state: fullState,
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kinetic-curator-${seed.toString(16)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const snapshot = parsed?.state ?? parsed; // accept old + new format
        if (!snapshot || typeof snapshot !== 'object') throw new Error('No state object');
        dispatch({ type: A.RESTORE_STATE, payload: snapshot });
      } catch (err) {
        console.warn('[OutputPanel] import failed:', err.message);
      }
      e.target.value = ''; // allow re-importing same file
    };
    reader.readAsText(file);
  };

  return (
    <div className="panel panel-output">
      <PanelHeader tag="P05" title="OUTPUT" subtitle={`${snapshots.length} snapshots`} collapsed={!open} onToggle={toggle} />
      {open && (
        <div className="panel-body output-body">
          {/* Headline export: vector SVG of the current frame. */}
          <div className="output-row">
            <button
              className="big-btn"
              onClick={downloadSvg}
              style={{ flex: 3, background: 'var(--accent2)', color: '#000', borderColor: 'var(--accent2)', fontWeight: 800 }}
              title="Download the current canvas as a vector .svg file"
            >
              ↓ SVG (VECTOR)
            </button>
            <button className="big-btn dl" onClick={exportJSON} style={{ flex: 1 }} title="Export full state as JSON preset">↓ JSON</button>
          </div>

          {/* PNG snapshot for raster output / sharing. */}
          <div className="output-row" style={{ marginTop: '4px' }}>
            <select
              value={exportResolution}
              onChange={e => dispatch({ type: A.SET_EXPORT_RESOLUTION, payload: parseInt(e.target.value) })}
              style={{ padding: '6px', fontSize: '10px', background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)', flex: 1 }}
            >
              <option value={1}>1x (1920×1080)</option>
              <option value={2}>2x (3840×2160)</option>
              <option value={4}>4x (7680×4320)</option>
            </select>
            <button className="big-btn" onClick={addSnapshot} style={{ flex: 2 }}>↓ PNG SNAPSHOT</button>
          </div>

          {/* WebM recording — LIVE mode only (performance recording). */}
          {isLive && (
            <div className="output-row" style={{ marginTop: '4px' }}>
              <button
                className="big-btn"
                onClick={() => dispatch({ type: A.SET_IS_RECORDING, payload: !isRecording })}
                style={isRecording ? { background: '#ff2d6f', color: '#fff', borderColor: '#ff2d6f', flex: 1 } : { flex: 1 }}
              >
                {isRecording ? '⏹ STOP RECORDING' : '⏺ RECORD WEBM'}
              </button>
            </div>
          )}

          <div className="output-row" style={{ marginTop: '4px' }}>
            <button className="big-btn dl" onClick={() => importInputRef.current?.click()} style={{ flex: 1 }}>↑ IMPORT JSON</button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={importJSON}
            />
            <button className="big-btn dl" onClick={() => dispatch({ type: A.CLEAR_SNAPSHOTS })} style={{ flex: 1 }}>✕ CLEAR HISTORY</button>
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
            <div className="output-hint">Press <b>S</b> to capture · exports include JSON sidecar for re-rolling</div>
          )}
        </div>
      )}
    </div>
  );
}
