import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { emit, Events } from '../composition/eventBus.js';
import { BLEND_MODES } from '../data/layout-modes.js';
import { FX_EFFECT_DEFS, FX_MENU_KINDS, isFxLayer } from '../fx/fxFilters.js';
import { displayLayerName } from '../state/slices/layersSlice.js';

function FxEffectEditor({ layer }) {
  const [addKind, setAddKind] = useState(FX_MENU_KINDS[0]);
  const effects = layer.effects || [];
  return (
    <div className="fx-editor" title="Effect stack — applies top-to-bottom to everything below this layer">
      {effects.map((fx, i) => {
        const def = FX_EFFECT_DEFS[fx.kind];
        if (!def) return null;
        return (
          <div className="fx-effect" key={`${fx.kind}-${i}`}>
            <div className="fx-effect-head">
              <span className="fx-effect-name" title={def.hint}>{def.label}</span>
              <button className="micro-btn" disabled={i === 0}
                title="Move effect earlier in the stack"
                onClick={() => emit(Events.FX_EFFECT_REORDER, { layerId: layer.id, index: i, delta: -1 })}>▲</button>
              <button className="micro-btn" disabled={i === effects.length - 1}
                title="Move effect later in the stack"
                onClick={() => emit(Events.FX_EFFECT_REORDER, { layerId: layer.id, index: i, delta: 1 })}>▼</button>
              <button className="micro-btn" title={`Remove ${def.label}`}
                onClick={() => emit(Events.FX_EFFECT_REMOVE, { layerId: layer.id, index: i })}>×</button>
            </div>
            {Object.entries(def.params).map(([key, p]) => (
              <div className="fx-param" key={key}>
                <label title={p.hint}>{p.label}</label>
                <input
                  type="range" min={p.min} max={p.max} step={p.step}
                  value={fx.params?.[key] ?? p.def}
                  title={`${def.label} · ${p.hint} (double-click resets)`}
                  onDoubleClick={() => emit(Events.FX_EFFECT_SET_PARAM, { layerId: layer.id, index: i, key, value: p.def })}
                  onChange={(e) => emit(Events.FX_EFFECT_SET_PARAM, { layerId: layer.id, index: i, key, value: Number(e.target.value) })}
                />
                <span className="fx-param-readout">{fx.params?.[key] ?? p.def}</span>
              </div>
            ))}
          </div>
        );
      })}
      <div className="fx-add-row">
        <select className="tg" value={addKind} title="Effect to add to the stack"
          onChange={(e) => setAddKind(e.target.value)}>
          {FX_MENU_KINDS.map((k) => (
            <option key={k} value={k} title={FX_EFFECT_DEFS[k].hint}>{FX_EFFECT_DEFS[k].label.toUpperCase()}</option>
          ))}
        </select>
        <button className="chip-btn" title="Append effect to the end of the stack"
          onClick={() => emit(Events.FX_EFFECT_ADD, { layerId: layer.id, kind: addKind })}>+ EFFECT</button>
      </div>
    </div>
  );
}

export function LayersPanel() {
  const { state } = useApp(s => ({
    layers: s.layers,
    activeLayerId: s.activeLayerId,
    selectedFxLayerId: s.selectedFxLayerId,
  }));
  const { layers, activeLayerId, selectedFxLayerId } = state;

  let contentOrdinal = 0;
  const ordinals = new Map();
  for (const l of layers) {
    if (!isFxLayer(l)) {
      contentOrdinal += 1;
      ordinals.set(l.id, contentOrdinal);
    }
  }

  return (
    <div className="panel panel-layers">
      <PanelHeader tag="P08" title="LAYERS" subtitle={`${layers.length} layer${layers.length > 1 ? 's' : ''}`}>
        <button className="chip-btn" title="Add a content layer (generative artwork)"
          onClick={() => emit(Events.LAYER_ADD)}>+ ADD LAYER</button>
        <button className="chip-btn" title="Add an FX layer — applies GL shader effects to everything below it, like an adjustment layer"
          onClick={() => emit(Events.LAYER_ADD_FX)}>+ ADD FX</button>
      </PanelHeader>
      <div className="panel-body layer-list">
        {[...layers].reverse().map((layer, ri) => {
          const i = layers.length - 1 - ri;
          const fx = isFxLayer(layer);
          const isActive = layer.id === activeLayerId;
          const isFxSelected = layer.id === selectedFxLayerId;
          const soloed = layer.visible && layers.every((l) => l.id === layer.id || !l.visible);
          const label = displayLayerName(layer, ordinals.get(layer.id) || 1);
          return (
            <div key={layer.id} className={`layer-row ${isActive ? 'layer-row-active' : ''} ${fx ? 'layer-row-fx' : ''} ${isFxSelected ? 'layer-row-fx-selected' : ''}`}>
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
                {fx && <span className="fx-badge" title="FX layer — filter effects apply to everything below">FX</span>}
                <button className="layer-name"
                  onClick={() => emit(fx ? Events.FX_SELECT : Events.LAYER_SET_ACTIVE, { id: layer.id })}
                  title={fx
                    ? 'Click to edit this layer\u2019s effect stack'
                    : 'Click to make this the active layer (LAYOUT/ASSETS/DAVIS edit it)'}>
                  {label}{isActive && !fx ? ' · editing' : ''}{isFxSelected && fx ? ' · editing fx' : ''}
                </button>
                <button className="micro-btn" title={fx ? 'Duplicate FX layer + effect stack' : 'Duplicate layer + snapshot'}
                  onClick={() => emit(Events.LAYER_DUPLICATE, { id: layer.id })}>DUP</button>
                <button className="micro-btn" title="Delete layer" disabled={layers.length <= 1}
                  onClick={() => emit(Events.LAYER_REMOVE, { id: layer.id })}>×</button>
              </div>
              <div className="layer-row-composite">
                {fx ? (
                  <span className="fx-param" style={{ flex: 1 }} title="FX layers wrap filtered content — blend modes don't apply">
                    <label>Blend</label><span className="fx-param-readout" style={{ width: 'auto' }}>—</span>
                  </span>
                ) : (
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
                )}
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={layer.layerOpacity}
                  title={fx ? `FX wrapper opacity ${Math.round(layer.layerOpacity * 100)}%` : `Opacity ${Math.round(layer.layerOpacity * 100)}%`}
                  onChange={(e) => emit(Events.LAYER_SET_OPACITY, { id: layer.id, opacity: Number(e.target.value) })}
                />
                <span className="layer-opacity-readout">{Math.round(layer.layerOpacity * 100)}%</span>
              </div>
              {fx && isFxSelected && <FxEffectEditor layer={layer} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
