// Layers — N independent compositions, each with its own mode/params/asset
// pool, compositing onto the stack below with its own blend mode + opacity.
//
// Design: the top-level fields this app already had (seed, paletteId,
// paletteOverrides, layoutParams, lockedParams, caGrid, enabledAssets)
// keep meaning exactly what they always meant — "the currently active
// layer's live editable state." Every existing panel/setter/history entry
// keeps reading and writing them completely unchanged. Switching the active
// layer just swaps a snapshot in and out of those same fields; only
// CanvasPanel needs to know layers exist at all, to render the inactive
// ones from their stored snapshots alongside the live active one.
//
// Undo/redo (#92): historyUndoStack/historyRedoStack are NOT reset here.
// Each entry is tagged with the layerId it was captured for (history.js),
// and layoutSlice's undo()/redo() only ever act on a top entry whose
// layerId matches the active layer — so the shared stack survives a
// switch without one layer's edits ever landing on another.
import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';
import { initialEnabledAssets } from './globalSlice.js';

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

/** Capture the live top-level fields as a snapshot (for the layer being deactivated). */
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
    { id: INITIAL_LAYER_ID, name: 'Layer 1', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
  ],
  activeLayerId: INITIAL_LAYER_ID,
  // Snapshots for every layer EXCEPT the active one (whose truth lives in
  // the live top-level fields above).
  layerSnapshots: {},

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
    if (!target) return {};
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
});
