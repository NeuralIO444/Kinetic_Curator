// OutputPanel (P05) — export controls + snapshot history
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { useCollapse } from '../hooks/useCollapse.js';
import { exportSnapshot, useVideoRecorder } from '../hooks/useMediaExport.js';
import * as A from '../state/actions.js';

export function OutputPanel() {
  const { state, dispatch, palette, svgRef } = useApp();
  const { snapshots, layoutParams, seed, exportResolution, isRecording } = state;
  const { open, toggle } = useCollapse(false);

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

  return (
    <div className="panel panel-output">
      <PanelHeader tag="P05" title="OUTPUT" subtitle={`${snapshots.length} snapshots`} collapsed={!open} onToggle={toggle} />
      {open && (
        <div className="panel-body output-body">
          <div className="output-row">
            <select 
              value={exportResolution} 
              onChange={e => dispatch({ type: A.SET_EXPORT_RESOLUTION, payload: parseInt(e.target.value) })}
              style={{ padding: '6px', fontSize: '10px', background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)', flex: 1 }}
            >
              <option value={1}>1x (1920×1080)</option>
              <option value={2}>2x (3840×2160)</option>
              <option value={4}>4x (7680×4320)</option>
            </select>
            <button className="big-btn" onClick={addSnapshot} style={{ flex: 2 }}>↓ SNAPSHOT</button>
          </div>
          
          <div className="output-row">
            <button 
              className="big-btn" 
              onClick={() => dispatch({ type: A.SET_IS_RECORDING, payload: !isRecording })}
              style={isRecording ? { background: '#ff2d6f', color: '#fff', borderColor: '#ff2d6f', flex: 2 } : { flex: 2 }}
            >
              {isRecording ? '⏹ STOP RECORDING' : '⏺ RECORD WEBM'}
            </button>
            <button className="big-btn dl" onClick={exportJSON} style={{ flex: 1 }}>↓ JSON</button>
          </div>

          <div className="output-row" style={{ marginTop: '4px' }}>
            <button className="big-btn dl" onClick={() => dispatch({ type: A.CLEAR_SNAPSHOTS })} style={{ width: '100%' }}>✕ CLEAR HISTORY</button>
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
