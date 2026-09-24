import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';
import { initialEnabledAssets } from './globalSlice.js';
import { defaultFxEffects, defaultFxParams, isFxLayer, FX_EFFECT_DEFS } from '../../fx/fxFilters.js';
import { pushToUndo, UNDO_KIND_LAYERS } from '../history.js';
import { normalizeSeedOffsets } from '../../engine/kernel/rng.js';
import { isTapeFull } from '../tapeBudget.js';

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

// Auto names (baked KC-n / FX n, 'Layer N', copies) carry no information the
// position doesn't, and go stale when a delete shifts the stack.
const AUTO_LAYER_NAME = /^(?:KC-\d+|FX \d+|Layer(?: \d+)?)$|\scopy$/;

/** Positional label (KC-n / FX n) — the one naming source; a real rename shows as 'KC-n · name'. */
export function displayLayerName(layer, ordinal) {
  if (!layer) return '';
  const base = isFxLayer(layer) ? `FX ${ordinal}` : `KC-${ordinal}`;
  const n = typeof layer.name === 'string' ? layer.name.trim() : '';
  return !n || AUTO_LAYER_NAME.test(n) ? base : `${base} · ${n}`;
}

const INITIAL_LAYER_ID = 'layer-1';

export const createLayersSlice = (set) => ({
  layers: [
    { id: INITIAL_LAYER_ID, name: 'KC-1', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1, patch: { mode: 'off', to: null, strength: 0.16 } },
  ],
  activeLayerId: INITIAL_LAYER_ID,
  layerSnapshots: {},
  soloStash: null,
  selectedFxLayerId: null,

  addLayer: () => set((state) => {
    const content = state.layers.filter((l) => !isFxLayer(l)).length;
    if (content >= MAX_CONTENT_TRACKS) return {};
    // #342 — tape pre-flight: refuse rather than let the governor's shed
    // ladder silently degrade the render to absorb a track the tape can't
    // afford. isTapeFull is always visible on the PLAY readout (TapeCounter),
    // so the refusal is never a silent dead click.
    if (isTapeFull(state)) return {};
    const id = makeLayerId();
    const snapshot = freshSnapshot((Math.random() * 0xffffffff) | 0);
    const name = `KC-${content + 1}`;
    return {
      ...pushToUndo(state, true, UNDO_KIND_LAYERS),
      layers: [...state.layers, { id, name, type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1, patch: { mode: 'off', to: null, strength: 0.16 } }],
      layerSnapshots: { ...state.layerSnapshots, [state.activeLayerId]: captureSnapshot(state) },
      activeLayerId: id,
      ...snapshot,
    };
  }),

  setLayerPatch: (id, patch) => set((state) => {
    const target = state.layers.find((l) => l.id === id);
    if (!target || isFxLayer(target)) return {};
    const mode = ['off', 'mod', 'field', 'feed'].includes(patch?.mode) ? patch.mode : 'off';
    // #457 — target by stable layer id, not an ordinal into whatever is
    // CURRENTLY visible: an ordinal silently retargets to a different
    // track the instant hide/solo/reorder/remove changes what sits at
    // that position elsewhere in the stack. An invalid/self/dangling id
    // falls back to the previous target rather than guessing a new one.
    const candidateTo = typeof patch?.to === 'string' ? patch.to : null;
    const to = candidateTo && candidateTo !== id && state.layers.some((l) => l.id === candidateTo && !isFxLayer(l))
      ? candidateTo
      : (target.patch?.to ?? null);
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
    if (isTapeFull(state)) return {}; // #342 — same pre-flight as addLayer/addFxLayer
    const nid = makeLayerId();
    const snap = isFx ? null : (id === state.activeLayerId ? captureSnapshot(state) : (state.layerSnapshots[id] || freshSnapshot(state.seed, state.seedOffsets)));
    const copy = {
      id: nid,
      name: isFx ? `${src.name} copy` : `KC-${state.layers.filter((l) => !isFxLayer(l)).length + 1}`,
      type: isFx ? 'fx' : 'content',
      visible: src.visible,
      layerBlendMode: src.layerBlendMode,
      layerOpacity: src.layerOpacity,
      patch: src.patch ? { ...src.patch } : { mode: 'off', to: null, strength: 0.16 },
    };
    if (isFx) copy.effects = structuredClone(src.effects || defaultFxEffects());
    const i = state.layers.findIndex((l) => l.id === id);
    const layers = [...state.layers];
    layers.splice(i + 1, 0, copy);
    if (isFx) return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers, selectedFxLayerId: nid };
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers, layerSnapshots: { ...state.layerSnapshots, [nid]: structuredClone(snap) } };
  }),

  // Solo is among KC tracks: FX tracks are never soloed or hidden by it, and
  // un-solo restores the visibility the user had before soloing (`soloStash`,
  // ephemeral — not in the project doc or undo entries; without it un-solo
  // falls back to showing every KC track).
  soloLayer: (id) => set((state) => {
    const target = state.layers.find((l) => l.id === id);
    if (!target || isFxLayer(target)) return {};
    const content = state.layers.filter((l) => !isFxLayer(l));
    const soloed = target.visible && content.every((l) => l.id === id || !l.visible);
    const push = pushToUndo(state, true, UNDO_KIND_LAYERS);
    if (soloed) {
      const stash = state.soloStash?.id === id ? state.soloStash.visible : null;
      return { ...push, soloStash: null, layers: state.layers.map((l) => (isFxLayer(l) ? l : { ...l, visible: l.id === id || !stash || stash[l.id] !== false })) };
    }
    const visible = Object.fromEntries(content.map((l) => [l.id, l.visible]));
    return { ...push, soloStash: { id, visible }, layers: state.layers.map((l) => (isFxLayer(l) ? l : { ...l, visible: l.id === id })) };
  }),

  removeLayer: (id) => set((state) => {
    const target = state.layers.find((l) => l.id === id);
    if (!target) return {};
    if (!isFxLayer(target) && state.layers.filter((l) => !isFxLayer(l)).length <= 1) return {}; // last content track stays
    // Clear patch.to pointing at the removed track (same rule as projectNormalize on load).
    const layers = state.layers.filter((l) => l.id !== id)
      .map((l) => (l.patch?.to === id ? { ...l, patch: { ...l.patch, to: null } } : l));
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
    if (isTapeFull(state)) return {}; // #342 — same pre-flight as addLayer
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
