// LayersPanel (P08) — manage frozen background layers.
// Each layer is a snapshot of the active composition, composited under
// subsequent layers and the live edit.
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { useCollapse } from '../hooks/useCollapse.js';
import { snapshotFromState } from '../engine/compose.js';
import * as A from '../state/actions.js';

const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay'];
const LAYER_SUBSCRIPTION_KEYS = [
  'layers', 'activeLayerId',
  'seed', 'paletteId', 'layoutParams', 'enabledAssets',
  'blendMode', 'blendStrength', 'echoEnabled', 'echoCount', 'echoDecay',
  'trailEnabled', 'trailLength', 'feedbackEnabled', 'feedbackStrength', 'feedbackDepth',
  'particlesEnabled', 'particleCount', 'particleSpeed',
  'motionEnabled', 'motionType', 'blastRadiusEnabled', 'blastRadius', 'blastForce',
  'colorStrategy', 'colorHarmony',
];

export function LayersPanel() {
  const { dispatch } = useApp();
  const { state } = useApp(s => {
    const out = {};
    for (const k of LAYER_SUBSCRIPTION_KEYS) out[k] = s[k];
    return out;
  });
  const { layers, activeLayerId } = state;
  const { open, toggle } = useCollapse(false);

  const addLayer = () => {
    const snap = snapshotFromState(state);
    dispatch({ type: A.ADD_LAYER, payload: snap });
  };

  const activate = (id) => dispatch({ type: A.ACTIVATE_LAYER, id });
  const deactivate = () => dispatch({ type: A.DEACTIVATE_LAYER });

  return (
    <div className="panel panel-layers">
      <PanelHeader
        tag="P08"
        title="LAYERS"
        subtitle={
          activeLayerId
            ? `editing ${layers.find(l => l.id === activeLayerId)?.name || 'layer'}`
            : layers.length === 0
              ? 'single layer'
              : `${layers.length} stacked`
        }
        collapsed={!open}
        onToggle={toggle}
      >
        {activeLayerId
          ? <button className="chip-btn active" onClick={deactivate} title="Save & exit edit">✓ DONE EDITING</button>
          : <button className="chip-btn" onClick={addLayer} title="Snapshot current composition as a new background layer">+ ADD</button>}
      </PanelHeader>
      {open && (
        <div className="panel-body">
          {layers.length === 0 && (
            <div className="output-hint">
              Layers freeze the current composition into a stacked snapshot. Tweak settings, then <b>+ ADD</b> to stamp them and start fresh on top.
            </div>
          )}
          {activeLayerId && (
            <div className="output-hint" style={{ marginBottom: 6 }}>
              Editing this layer in-place — your edits will save back when you click <b>DONE EDITING</b>.
            </div>
          )}
          {layers.map((layer, i) => {
            const isActive = layer.id === activeLayerId;
            return (
            <div key={layer.id} className="param-block" style={{ marginBottom: 6, outline: isActive ? '1px solid var(--accent)' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <button
                  className={`tg ${layer.visible ? 'tg-on' : ''}`}
                  onClick={() => dispatch({ type: A.TOGGLE_LAYER, id: layer.id })}
                  title={layer.visible ? 'Hide' : 'Show'}
                  style={{ minWidth: 30, padding: '2px 4px' }}
                >
                  {layer.visible ? '◉' : '○'}
                </button>
                <input
                  className="range-edit"
                  value={layer.name}
                  onChange={e => dispatch({ type: A.SET_LAYER_NAME, id: layer.id, name: e.target.value })}
                  style={{ flex: 1, fontSize: 10 }}
                />
                <button
                  className={`micro-btn ${isActive ? 'active' : ''}`}
                  onClick={() => (isActive ? deactivate() : activate(layer.id))}
                  title={isActive ? 'Save & exit edit' : 'Edit this layer in place'}
                  style={isActive ? { background: 'var(--accent)', color: 'var(--bg)' } : undefined}
                >
                  {isActive ? '✓' : '✎'}
                </button>
                <button className="micro-btn" onClick={() => dispatch({ type: A.MOVE_LAYER, id: layer.id, direction: 'up' })} disabled={i === 0}>↑</button>
                <button className="micro-btn" onClick={() => dispatch({ type: A.MOVE_LAYER, id: layer.id, direction: 'down' })} disabled={i === layers.length - 1}>↓</button>
                <button className="micro-btn" onClick={() => dispatch({ type: A.REMOVE_LAYER, id: layer.id })} title="Delete">✕</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="range-label" style={{ fontSize: 9 }}>OPACITY</span>
                <input
                  type="range"
                  min={0} max={1} step={0.05}
                  value={layer.opacity}
                  onChange={e => dispatch({ type: A.SET_LAYER_OPACITY, id: layer.id, opacity: Number(e.target.value) })}
                  style={{ flex: 1 }}
                />
                <span className="range-readout" style={{ fontSize: 9 }}>{layer.opacity.toFixed(2)}</span>
              </div>
              <div className="preset-row" style={{ marginTop: 4 }}>
                {BLEND_MODES.map(m => (
                  <button
                    key={m}
                    className={`preset-btn ${layer.blendMode === m ? 'active' : ''}`}
                    onClick={() => dispatch({ type: A.SET_LAYER_BLEND, id: layer.id, blendMode: m })}
                    style={{ fontSize: 9, padding: '2px 6px' }}
                  >
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          );
          })}
        </div>
      )}
    </div>
  );
}
