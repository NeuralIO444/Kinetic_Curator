import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';
import { initialEnabledAssets } from './globalSlice.js';
import { defaultFxEffects, defaultFxParams, isFxLayer, FX_EFFECT_DEFS } from '../../fx/fxFilters.js';
import { pushToUndo, UNDO_KIND_LAYERS } from '../history.js';
import { normalizeSeedOffsets } from '../../engine/kernel/rng.js';

export const MAX_CONTENT_TRACKS = 4;
export const MAX_FX_TRACKS = 4;

function makeLayerId() {
  return `layer-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

function freshSnapshot(seed, seedOffsets) {
  return {
    seed: seed >>> 0,
    seedOffsets: normalizeSeedOffsets(seedOffsets),
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
    seedOffsets: normalizeSeedOffsets(state.seedOffsets),
    paletteId: state.paletteId,
    paletteOverrides: state.paletteOverrides,
    layoutParams: state.layoutParams,
    lockedParams: state.lockedParams,
    caGrid: state.caGrid,
    enabledAssets: state.enabledAssets,
  };
}

export function displayLayerName(layer, contentOrdinal) {
  if (!layer) return '';
  if (isFxLayer(layer)) return layer.name;
  if (typeof layer.name === 'string' && (/^Layer \\d+/.test(layer.name) || / copy$/.test(layer.name))) {
    return `KC-${contentOrdinal}`;
  }
  return layer.name;
}

const INITIAL_LAYER_ID = 'layer-1';

export const createLayersSlice = (set) => ({
  layers: [
    { id: INITIAL_LAYER_ID, name: 'KC-1', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1, patch: { mode: 'off', to: 1, strength: 0.16 } },
  ],
  activeLayerId: INITIAL_LAYER_ID,
  layerSnapshots: {},
  selectedFxLayerId: null,

  addLayer: () => set((state) => {
    const content = state.layers.filter((l) => !isFxLayer(l)).length;
    if (content >= MAX_CONTENT_TRACKS) return {};
    const id = makeLayerId();
    const snapshot = freshSnapshot((Math.random() * 0xffffffff) | 0);
    const name = `KC-${content + 1}`;
    return {
      ...pushToUndo(state, true, UNDO_KIND_LAYERS),
      layers: [...state.layers, { id, name, visible: true, layerBlendMode: 'normal', layerOpacity: 1, patch: { mode: 'off', to: 0, strength: 0.16 } }],
      layerSnapshots: { ...state.layerSnapshots, [state.activeLayerId]: captureSnapshot(state) },
      activeLayerId: id,
      ...snapshot,
    };
  }),

  setLayerPatch: (id, patch) => set((state) => {
    const target = state.layers.find((l) => l.id === id);
    if (!target || isFxLayer(target)) return {};
    const mode = ['off', 'mod', 'field', 'feed'].includes(patch?.mode) ? patch.mode : 'off';
    const to = Math.max(0, Math.min(MAX_CONTENT_TRACKS - 1, patch?.to | 0));
    const prev = target.patch || {};
    const strength = Math.max(0, Math.min(1, Number(patch?.strength ?? prev.strength ?? 0.16)));
    return {
      ...pushToUndo(state, true, UNDO_KIND_LAYERS),
      layers: state.layers.map((l) => (l.id === id ? { ...l, patch: { mode, to, strength } } : l)),
    };
  }),

  duplicateLayer: (id) => set((state) => {
    const src = state.layers.find((l) => l.id === id);
    if (!src) return {};
    const isFx = isFxLayer(src);
    if (!isFx && state.layers.filter((l) => !isFxLayer(l)).length >= MAX_CONTENT_TRACKS) return {};
    if (isFx && state.layers.filter(isFxLayer).length >= MAX_FX_TRACKS) return {};
    const nid = makeLayerId();
    const snap = isFx ? null : (id === state.activeLayerId ? captureSnapshot(state) : (state.layerSnapshots[id] || freshSnapshot(state.seed, state.seedOffsets)));
    const copy = {
      id: nid,
      name: isFx ? `${src.name} copy` : `KC-${state.layers.filter((l) => !isFxLayer(l)).length + 1}`,
      type: isFx ? 'fx' : 'content',
      visible: src.visible,
      layerBlendMode: src.layerBlendMode,
      layerOpacity: src.layerOpacity,
      patch: src.patch ? { ...src.patch } : { mode: 'off', to: 0, strength: 0.16 },
    };
    if (isFx) copy.effects = structuredClone(src.effects || defaultFxEffects());
    const i = state.layers.findIndex((l) => l.id === id);
    const layers = [...state.layers];
    layers.splice(i + 1, 0, copy);
    if (isFx) return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers, selectedFxLayerId: nid };
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers, layerSnapshots: { ...state.layerSnapshots, [nid]: structuredClone(snap) } };
  }),

  soloLayer: (id) => set((state) => {
    const othersHidden = state.layers.every((l) => l.id === id || !l.visible);
    const push = pushToUndo(state, true, UNDO_KIND_LAYERS);
    if (othersHidden) return { ...push, layers: state.layers.map((l) => ({ ...l, visible: true })) };
    return { ...push, layers: state.layers.map((l) => ({ ...l, visible: l.id === id })) };
  }),

  removeLayer: (id) => set((state) => {
    if (state.layers.length <= 1) return {};
    const layers = state.layers.filter((l) => l.id !== id);
    const snapshots = { ...state.layerSnapshots };
    delete snapshots[id];
    const selectedFxLayerId = state.selectedFxLayerId === id ? null : state.selectedFxLayerId;
    if (id !== state.activeLayerId) return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers, layerSnapshots: snapshots, selectedFxLayerId };
    const nextActive = layers.find((l) => !isFxLayer(l)) || layers[0];
    const nextSnapshot = snapshots[nextActive.id] || freshSnapshot(state.seed, state.seedOffsets);
    delete snapshots[nextActive.id];
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers, layerSnapshots: snapshots, activeLayerId: nextActive.id, selectedFxLayerId, ...nextSnapshot };
  }),

  setActiveLayer: (id) => set((state) => {
    if (id === state.activeLayerId) return {};
    const target = state.layers.find((l) => l.id === id);
    if (!target || isFxLayer(target)) return {};
    const snapshot = state.layerSnapshots[id] || freshSnapshot(state.seed, state.seedOffsets);
    return { activeLayerId: id, layerSnapshots: { ...state.layerSnapshots, [state.activeLayerId]: captureSnapshot(state) }, ...snapshot };
  }),

  reorderLayer: (id, delta) => set((state) => {
    const i = state.layers.findIndex((l) => l.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= state.layers.length) return {};
    const layers = [...state.layers];
    [layers[i], layers[j]] = [layers[j], layers[i]];
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers };
  }),

  toggleLayerVisible: (id) => set((state) => ({ ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers: state.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)) })),
  renameLayer: (id, name) => set((state) => ({ ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers: state.layers.map((l) => (l.id === id ? { ...l, name } : l)) })),
  setLayerBlendMode: (id, layerBlendMode) => set((state) => ({ ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers: state.layers.map((l) => (l.id === id ? { ...l, layerBlendMode } : l)) })),
  setLayerOpacity: (id, layerOpacity) => set((state) => ({ ...pushToUndo(state, false, UNDO_KIND_LAYERS), layers: state.layers.map((l) => (l.id === id ? { ...l, layerOpacity } : l)) })),

  addFxLayer: () => set((state) => {
    const fxCount = state.layers.filter(isFxLayer).length;
    if (fxCount >= MAX_FX_TRACKS) return {};
    const id = makeLayerId();
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers: [...state.layers, { id, name: `FX ${fxCount + 1}`, type: 'fx', visible: true, effects: defaultFxEffects(), layerBlendMode: 'normal', layerOpacity: 1 }], selectedFxLayerId: id };
  }),

  setSelectedFxLayer: (id) => set((state) => {
    const l = state.layers.find((x) => x.id === id);
    return { selectedFxLayerId: l && isFxLayer(l) ? id : null };
  }),

  fxEffectAdd: (layerId, kind) => set((state) => {
    const params = defaultFxParams(kind);
    if (!params) return {};
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers: state.layers.map((l) => (l.id === layerId && isFxLayer(l) ? { ...l, effects: [...(l.effects || []), { kind, params }] } : l)) };
  }),

  fxEffectRemove: (layerId, index) => set((state) => {
    const layers = state.layers.map((l) => {
      if (l.id !== layerId || !isFxLayer(l)) return l;
      const effects = [...(l.effects || [])];
      if (index < 0 || index >= effects.length) return l;
      effects.splice(index, 1);
      return { ...l, effects };
    });
    if (JSON.stringify(layers) === JSON.stringify(state.layers)) return {};
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers };
  }),

  fxEffectReorder: (layerId, index, delta) => set((state) => {
    const layers = state.layers.map((l) => {
      if (l.id !== layerId || !isFxLayer(l)) return l;
      const effects = [...(l.effects || [])];
      const j = index + delta;
      if (index < 0 || index >= effects.length || j < 0 || j >= effects.length) return l;
      [effects[index], effects[j]] = [effects[j], effects[index]];
      return { ...l, effects };
    });
    if (JSON.stringify(layers) === JSON.stringify(state.layers)) return {};
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers };
  }),

  fxEffectSetParam: (layerId, index, key, value) => set((state) => {
    const layers = state.layers.map((l) => {
      if (l.id !== layerId || !isFxLayer(l)) return l;
      const effects = [...(l.effects || [])];
      const fx = effects[index];
      if (!fx) return l;
      const pdef = FX_EFFECT_DEFS[fx.kind]?.params[key];
      if (!pdef) return l;
      const v = Number(value);
      const clamped = Number.isFinite(v) ? Math.min(pdef.max, Math.max(pdef.min, v)) : pdef.def;
      effects[index] = { ...fx, params: { ...fx.params, [key]: clamped } };
      return { ...l, effects };
    });
    if (JSON.stringify(layers) === JSON.stringify(state.layers)) return {};
    return { ...pushToUndo(state, false, UNDO_KIND_LAYERS), layers };
  }),
});
