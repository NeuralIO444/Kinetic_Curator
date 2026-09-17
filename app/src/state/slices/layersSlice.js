import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';
import { initialEnabledAssets } from './globalSlice.js';
import { defaultFxEffects, defaultFxParams, isFxLayer, FX_EFFECT_DEFS } from '../../fx/fxFilters.js';

function makeLayerId() {
  return `layer-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

function freshSnapshot(seed) {
  return {
    seed: seed >>> 0,
    paletteId: 'praystation',
    paletteOverrides: null,
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS },
    lockedParams: {},
    caGrid: null,
    enabledAssets: { ...initialEnabledAssets },
  };
}

export function captureSnapshot(state) {
  return {
    seed: state.seed,
    paletteId: state.paletteId,
    paletteOverrides: state.paletteOverrides,
    layoutParams: state.layoutParams,
    lockedParams: state.lockedParams,
    caGrid: state.caGrid,
    enabledAssets: state.enabledAssets,
  };
}

const INITIAL_LAYER_ID = 'layer-1';

export const createLayersSlice = (set) => ({
  layers: [
    { id: INITIAL_LAYER_ID, name: 'Layer 1', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
  ],
  activeLayerId: INITIAL_LAYER_ID,
  layerSnapshots: {},
  /**
   * FX-layer UI selection (which FX layer's effect stack the Layers panel is
   * editing). Ephemeral UI state — never serialized. FX layers are never the
   * content-active layer: setActiveLayer ignores them, so the snapshot
   * machinery (seed/layoutParams/enabledAssets) is untouched by FX.
   */
  selectedFxLayerId: null,

  addLayer: () => set((state) => {
    const id = makeLayerId();
    const snapshot = freshSnapshot((Math.random() * 0xffffffff) | 0);
    const name = `Layer ${state.layers.length + 1}`;
    return {
      layers: [...state.layers, { id, name, visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
      layerSnapshots: {
        ...state.layerSnapshots,
        [state.activeLayerId]: captureSnapshot(state),
      },
      activeLayerId: id,
      ...snapshot,
    };
  }),

  duplicateLayer: (id) => set((state) => {
    const src = state.layers.find((l) => l.id === id);
    if (!src) return {};
    const nid = makeLayerId();
    const isFx = isFxLayer(src);
    const snap = isFx ? null : (id === state.activeLayerId
      ? captureSnapshot(state)
      : (state.layerSnapshots[id] || freshSnapshot(state.seed)));
    const copy = {
      id: nid,
      name: `${src.name} copy`,
      type: isFx ? 'fx' : 'content',
      visible: src.visible,
      layerBlendMode: src.layerBlendMode,
      layerOpacity: src.layerOpacity,
    };
    if (isFx) copy.effects = structuredClone(src.effects || defaultFxEffects());
    const i = state.layers.findIndex((l) => l.id === id);
    const layers = [...state.layers];
    layers.splice(i + 1, 0, copy);
    if (isFx) return { layers, selectedFxLayerId: nid };
    return {
      layers,
      layerSnapshots: { ...state.layerSnapshots, [nid]: structuredClone(snap) },
    };
  }),

  soloLayer: (id) => set((state) => {
    const othersHidden = state.layers.every((l) => l.id === id || !l.visible);
    if (othersHidden) {
      return { layers: state.layers.map((l) => ({ ...l, visible: true })) };
    }
    return {
      layers: state.layers.map((l) => ({ ...l, visible: l.id === id })),
    };
  }),

  removeLayer: (id) => set((state) => {
    if (state.layers.length <= 1) return {};
    const layers = state.layers.filter((l) => l.id !== id);
    const snapshots = { ...state.layerSnapshots };
    delete snapshots[id];

    if (id !== state.activeLayerId) {
      return { layers, layerSnapshots: snapshots };
    }
    const nextActive = layers[0];
    const nextSnapshot = snapshots[nextActive.id] || freshSnapshot(state.seed);
    delete snapshots[nextActive.id];
    return {
      layers,
      layerSnapshots: snapshots,
      activeLayerId: nextActive.id,
      ...nextSnapshot,
    };
  }),

  setActiveLayer: (id) => set((state) => {
    if (id === state.activeLayerId) return {};
    const target = state.layers.find((l) => l.id === id);
    // FX layers are never the content-active layer — they hold no snapshot
    // (no seed/palette/layoutParams). The panel edits their effect stack via
    // selectedFxLayerId instead.
    if (!target || isFxLayer(target)) return {};
    const snapshot = state.layerSnapshots[id] || freshSnapshot(state.seed);
    return {
      activeLayerId: id,
      layerSnapshots: {
        ...state.layerSnapshots,
        [state.activeLayerId]: captureSnapshot(state),
      },
      ...snapshot,
    };
  }),

  reorderLayer: (id, delta) => set((state) => {
    const i = state.layers.findIndex((l) => l.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= state.layers.length) return {};
    const layers = [...state.layers];
    [layers[i], layers[j]] = [layers[j], layers[i]];
    return { layers };
  }),

  toggleLayerVisible: (id) => set((state) => ({
    layers: state.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
  })),

  renameLayer: (id, name) => set((state) => ({
    layers: state.layers.map((l) => (l.id === id ? { ...l, name } : l)),
  })),

  setLayerBlendMode: (id, layerBlendMode) => set((state) => ({
    layers: state.layers.map((l) => (l.id === id ? { ...l, layerBlendMode } : l)),
  })),

  setLayerOpacity: (id, layerOpacity) => set((state) => ({
    layers: state.layers.map((l) => (l.id === id ? { ...l, layerOpacity } : l)),
  })),

  // -- FX layers -----------------------------------------------------------
  // An FX layer holds no content snapshot — it applies an ordered stack of
  // SVG filter effects to everything beneath it in the layer stack.

  addFxLayer: () => set((state) => {
    const id = makeLayerId();
    const fxCount = state.layers.filter(isFxLayer).length;
    return {
      layers: [
        ...state.layers,
        {
          id,
          name: `FX ${fxCount + 1}`,
          type: 'fx',
          visible: true,
          effects: defaultFxEffects(),
          layerBlendMode: 'normal',
          layerOpacity: 1,
        },
      ],
      selectedFxLayerId: id,
    };
  }),

  setSelectedFxLayer: (id) => set((state) => {
    const l = state.layers.find((x) => x.id === id);
    return { selectedFxLayerId: l && isFxLayer(l) ? id : null };
  }),

  /** Effect-stack CRUD below — all fail closed on bad ids/indices. */  fxEffectAdd: (layerId, kind) => set((state) => {
    const params = defaultFxParams(kind);
    if (!params) return {};
    return {
      layers: state.layers.map((l) => (l.id === layerId && isFxLayer(l)
        ? { ...l, effects: [...(l.effects || []), { kind, params }] }
        : l)),
    };
  }),

  fxEffectRemove: (layerId, index) => set((state) => ({
    layers: state.layers.map((l) => {
      if (l.id !== layerId || !isFxLayer(l)) return l;
      const effects = [...(l.effects || [])];
      if (index < 0 || index >= effects.length) return l;
      effects.splice(index, 1);
      return { ...l, effects };
    }),
  })),

  fxEffectReorder: (layerId, index, delta) => set((state) => ({
    layers: state.layers.map((l) => {
      if (l.id !== layerId || !isFxLayer(l)) return l;
      const effects = [...(l.effects || [])];
      const j = index + delta;
      if (index < 0 || index >= effects.length || j < 0 || j >= effects.length) return l;
      [effects[index], effects[j]] = [effects[j], effects[index]];
      return { ...l, effects };
    }),
  })),

  fxEffectSetParam: (layerId, index, key, value) => set((state) => ({
    layers: state.layers.map((l) => {
      if (l.id !== layerId || !isFxLayer(l)) return l;
      const effects = [...(l.effects || [])];
      const fx = effects[index];
      if (!fx) return l;
      const pdef = FX_EFFECT_DEFS[fx.kind]?.params[key];
      if (!pdef) return l; // unknown param: fail closed
      const v = Number(value);
      const clamped = Number.isFinite(v) ? Math.min(pdef.max, Math.max(pdef.min, v)) : pdef.def;
      effects[index] = { ...fx, params: { ...fx.params, [key]: clamped } };
      return { ...l, effects };
    }),
  })),
});
