import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { emit, Events } from '../composition/eventBus.js';
import { BLEND_MODES } from '../data/layout-modes.js';

export function LayersPanel() {
  const { state } = useApp(s => ({
    layers: s.layers,
    activeLayerId: s.activeLayerId,
  }));
  const { layers, activeLayerId } = state;

  return (
    <div className="panel panel-layers">
      <PanelHeader tag="P08" title="LAYERS" subtitle={`${layers.length} layer${layers.length > 1 ? 's' : ''}`}>
        <button className="chip-btn" onClick={() => emit(Events.LAYER_ADD)}>+ ADD LAYER</button>
      </PanelHeader>
      <div className="panel-body layer-list">
        {[...layers].reverse().map((layer, ri) => {
          const i = layers.length - 1 - ri;
          const isActive = layer.id === activeLayerId;
          const soloed = layer.visible && layers.every((l) => l.id === layer.id || !l.visible);
          return (
            <div key={layer.id} className={`layer-row ${isActive ? 'layer-row-active' : ''}`}>
              <div className="layer-row-main">
                <div className="layer-reorder">
                  <button className="micro-btn" disabled={i === layers.length - 1}
                    title="Move up (toward front)"
                    onClick={() => emit(Events.LAYER_REORDER, { id: layer.id, delta: 1 })}>▲</button>
                  <button className="micro-btn" disabled={i === 0}
                    title="Move down (toward back)"
                    onClick={() => emit(Events.LAYER_REORDER, { id: layer.id, delta: -1 })}>▼</button>
                </div>
                <button className="micro-btn" title={layer.visible ? 'Hide' : 'Show'}
                  onClick={() => emit(Events.LAYER_TOGGLE_VISIBLE, { id: layer.id })}>
                  {layer.visible ? '●' : '○'}
                </button>
                <button className="micro-btn" title={soloed ? 'Show all layers' : 'Solo this layer'}
                  onClick={() => emit(Events.LAYER_SOLO, { id: layer.id })}>
                  {soloed ? 'S·' : 'S'}
                </button>
                <button className="layer-name" onClick={() => emit(Events.LAYER_SET_ACTIVE, { id: layer.id })}
                  title="Click to make this the active layer (LAYOUT/ASSETS/DAVIS edit it)">
                  {layer.name}{isActive ? ' · editing' : ''}
                </button>
                <button className="micro-btn" title="Duplicate layer + snapshot"
                  onClick={() => emit(Events.LAYER_DUPLICATE, { id: layer.id })}>DUP</button>
                <button className="micro-btn" title="Delete layer" disabled={layers.length <= 1}
                  onClick={() => emit(Events.LAYER_REMOVE, { id: layer.id })}>×</button>
              </div>
              <div className="layer-row-composite">
                <select
                  className="tg blend-mode-select"
                  value={layer.layerBlendMode}
                  title="How this layer composites onto the stack below"
                  onChange={(e) => emit(Events.LAYER_SET_BLEND_MODE, { id: layer.id, mode: e.target.value })}
                >
                  {BLEND_MODES.map(mode => (
                    <option key={mode} value={mode}>{mode.toUpperCase()}</option>
                  ))}
                </select>
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={layer.layerOpacity}
                  title={`Opacity ${Math.round(layer.layerOpacity * 100)}%`}
                  onChange={(e) => emit(Events.LAYER_SET_OPACITY, { id: layer.id, opacity: Number(e.target.value) })}
                />
                <span className="layer-opacity-readout">{Math.round(layer.layerOpacity * 100)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
