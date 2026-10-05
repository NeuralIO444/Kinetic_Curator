import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';
import { initialEnabledAssets } from './globalSlice.js';
import { defaultFxEffects, defaultFxParams, isFxLayer, FX_EFFECT_DEFS, availableFxKinds, fxEffectInsertIndex } from '../../fx/fxFilters.js';
import { isMathLayer, defaultMathEffects, defaultMathParams, MATH_EFFECT_DEFS, MATH_MOD_SOURCES } from '../../fx/mathFilters.js';
import { pushToUndo, UNDO_KIND_LAYERS } from '../history.js';
import { normalizeSeedOffsets } from '../../engine/kernel/rng.js';
import { isTapeFull } from '../tapeBudget.js';

export const MAX_CONTENT_TRACKS = 4;
export const MAX_FX_TRACKS = 4;
// #1010 — MATH is a third track type: same grammar as FX (add/remove/hide/
// solo/opacity/reorder), riding the same fold. Adjustment tracks (FX+MATH)
// stay above KC tracks; FX and MATH interleave freely (order is creative).
export const MAX_MATH_TRACKS = 4;

/** Adjustment track: FX or MATH — the two families that grade everything below. */
export const isAdjustmentLayer = (layer) => isFxLayer(layer) || isMathLayer(layer);

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
const AUTO_LAYER_NAME = /^(?:KC-\d+|FX \d+|M \d+|Layer(?: \d+)?)$|\scopy$/;

/** Positional label (KC-n / FX n / M n) — the one naming source; a real rename shows as 'KC-n · name'. */
export function displayLayerName(layer, ordinal) {
  if (!layer) return '';
  const base = isFxLayer(layer) ? `FX ${ordinal}` : isMathLayer(layer) ? `M ${ordinal}` : `KC-${ordinal}`;
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
  selectedMathLayerId: null,

  addLayer: () => set((state) => {
    const content = state.layers.filter((l) => !isAdjustmentLayer(l)).length;
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
    if (!target || isAdjustmentLayer(target)) return {};
    const mode = ['off', 'mod', 'field', 'feed'].includes(patch?.mode) ? patch.mode : 'off';
    // #457 — target by stable layer id, not an ordinal into whatever is
    // CURRENTLY visible: an ordinal silently retargets to a different
    // track the instant hide/solo/reorder/remove changes what sits at
    // that position elsewhere in the stack. An invalid/self/dangling id
    // falls back to the previous target rather than guessing a new one.
    const candidateTo = typeof patch?.to === 'string' ? patch.to : null;
    const to = candidateTo && candidateTo !== id && state.layers.some((l) => l.id === candidateTo && !isAdjustmentLayer(l))
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
    const isMath = isMathLayer(src);
    const isAdj = isFx || isMath;
    if (!isAdj && state.layers.filter((l) => !isAdjustmentLayer(l)).length >= MAX_CONTENT_TRACKS) return {};
    if (isFx && state.layers.filter(isFxLayer).length >= MAX_FX_TRACKS) return {};
    if (isMath && state.layers.filter(isMathLayer).length >= MAX_MATH_TRACKS) return {};
    if (isTapeFull(state)) return {}; // #342 — same pre-flight as addLayer/addFxLayer
    const nid = makeLayerId();
    const snap = isAdj ? null : (id === state.activeLayerId ? captureSnapshot(state) : (state.layerSnapshots[id] || freshSnapshot(state.seed, state.seedOffsets)));
    const copy = {
      id: nid,
      name: isFx ? `${src.name} copy` : isMath ? `${src.name} copy` : `KC-${state.layers.filter((l) => !isAdjustmentLayer(l)).length + 1}`,
      type: isFx ? 'fx' : isMath ? 'math' : 'content',
      visible: src.visible,
      layerBlendMode: src.layerBlendMode,
      layerOpacity: src.layerOpacity,
      patch: src.patch ? { ...src.patch } : { mode: 'off', to: null, strength: 0.16 },
    };
    if (isAdj) copy.effects = structuredClone(src.effects || (isMath ? defaultMathEffects() : defaultFxEffects()));
    const i = state.layers.findIndex((l) => l.id === id);
    const layers = [...state.layers];
    layers.splice(i + 1, 0, copy);
    if (isFx) return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers, selectedFxLayerId: nid };
    if (isMath) return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers, selectedMathLayerId: nid };
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers, layerSnapshots: { ...state.layerSnapshots, [nid]: structuredClone(snap) } };
  }),

  // Solo is among KC tracks: adjustment tracks (FX/MATH) are never soloed
  // or hidden by a KC solo, and un-solo restores the visibility the user had
  // before soloing (`soloStash`, ephemeral — not in the project doc or undo
  // entries; without it un-solo falls back to showing every KC track).
  // #1010 — MATH solo is the exception: soloing a MATH track shows the
  // grade's contribution only (the renderer seeds its wrap with neutral
  // mid-grey), so content and FX hide and only the soloed MATH track stays.
  soloLayer: (id) => set((state) => {
    const target = state.layers.find((l) => l.id === id);
    if (!target || isFxLayer(target)) return {};
    const push = pushToUndo(state, true, UNDO_KIND_LAYERS);
    if (isMathLayer(target)) {
      const soloed = target.visible && state.layers.every((l) => l.id === id || !l.visible);
      if (soloed) {
        const stash = state.soloStash?.id === id ? state.soloStash.visible : null;
        return { ...push, soloStash: null, layers: state.layers.map((l) => ({ ...l, visible: l.id === id || (!!stash && stash[l.id] !== false) })) };
      }
      const visible = Object.fromEntries(state.layers.map((l) => [l.id, l.visible]));
      return { ...push, soloStash: { id, visible }, layers: state.layers.map((l) => ({ ...l, visible: l.id === id })) };
    }
    const content = state.layers.filter((l) => !isAdjustmentLayer(l));
    const soloed = target.visible && content.every((l) => l.id === id || !l.visible);
    if (soloed) {
      const stash = state.soloStash?.id === id ? state.soloStash.visible : null;
      return { ...push, soloStash: null, layers: state.layers.map((l) => (isAdjustmentLayer(l) ? l : { ...l, visible: l.id === id || !stash || stash[l.id] !== false })) };
    }
    const visible = Object.fromEntries(content.map((l) => [l.id, l.visible]));
    return { ...push, soloStash: { id, visible }, layers: state.layers.map((l) => (isAdjustmentLayer(l) ? l : { ...l, visible: l.id === id })) };
  }),

  removeLayer: (id) => set((state) => {
    const target = state.layers.find((l) => l.id === id);
    if (!target) return {};
    if (!isAdjustmentLayer(target) && state.layers.filter((l) => !isAdjustmentLayer(l)).length <= 1) return {}; // last content track stays
    // Clear patch.to pointing at the removed track (same rule as projectNormalize on load).
    const layers = state.layers.filter((l) => l.id !== id)
      .map((l) => (l.patch?.to === id ? { ...l, patch: { ...l.patch, to: null } } : l));
    const snapshots = { ...state.layerSnapshots };
    delete snapshots[id];
    const selectedFxLayerId = state.selectedFxLayerId === id ? null : state.selectedFxLayerId;
    const selectedMathLayerId = state.selectedMathLayerId === id ? null : state.selectedMathLayerId;
    if (id !== state.activeLayerId) return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers, layerSnapshots: snapshots, selectedFxLayerId, selectedMathLayerId };
    const nextActive = layers.find((l) => !isFxLayer(l)) || layers[0];
    const nextSnapshot = snapshots[nextActive.id] || freshSnapshot(state.seed, state.seedOffsets);
    delete snapshots[nextActive.id];
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers, layerSnapshots: snapshots, activeLayerId: nextActive.id, selectedFxLayerId, selectedMathLayerId, ...nextSnapshot };
  }),

  setActiveLayer: (id) => set((state) => {
    if (id === state.activeLayerId) return {};
    const target = state.layers.find((l) => l.id === id);
    if (!target || isAdjustmentLayer(target)) return {};
    const snapshot = state.layerSnapshots[id] || freshSnapshot(state.seed, state.seedOffsets);
    return { activeLayerId: id, layerSnapshots: { ...state.layerSnapshots, [state.activeLayerId]: captureSnapshot(state) }, ...snapshot };
  }),

  reorderLayer: (id, delta) => set((state) => {
    const i = state.layers.findIndex((l) => l.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= state.layers.length) return {};
    // #732 — adjustment tracks (FX+MATH) stay above KC tracks. Array is
    // bottom→top. FX and MATH interleave freely: order is creative (#1010).
    const a = state.layers[i];
    const b = state.layers[j];
    if (isAdjustmentLayer(a) !== isAdjustmentLayer(b)) return {};
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
    return {
      ...pushToUndo(state, true, UNDO_KIND_LAYERS),
      layers: state.layers.map((l) => {
        if (l.id !== layerId || !isFxLayer(l)) return l;
        // #520 Phase 1b: one effect per rack slot — reject if this slot is filled.
        if (!availableFxKinds(l.effects).includes(kind)) return l;
        // Insert at the correct rack position so EF-1..EF-4 order is maintained.
        const effects = [...(l.effects || [])];
        effects.splice(fxEffectInsertIndex(kind, l.effects), 0, { kind, params });
        return { ...l, effects };
      }),
    };
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

  // #1010 — MATH track actions. Same grammar as the FX actions above; the
  // chain holds math ops ({ kind, params, mod }) instead of FX kinds.
  addMathLayer: () => set((state) => {
    const mathCount = state.layers.filter(isMathLayer).length;
    if (mathCount >= MAX_MATH_TRACKS) return {};
    if (isTapeFull(state)) return {}; // #342 — same pre-flight as addLayer/addFxLayer
    const id = makeLayerId();
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers: [...state.layers, { id, name: `M ${mathCount + 1}`, type: 'math', visible: true, effects: defaultMathEffects(), layerBlendMode: 'normal', layerOpacity: 1 }], selectedMathLayerId: id };
  }),

  setSelectedMathLayer: (id) => set((state) => {
    const l = state.layers.find((x) => x.id === id);
    return { selectedMathLayerId: l && isMathLayer(l) ? id : null };
  }),

  mathEffectAdd: (layerId, kind) => set((state) => {
    const params = defaultMathParams(kind);
    if (!params) return {};
    return {
      ...pushToUndo(state, true, UNDO_KIND_LAYERS),
      layers: state.layers.map((l) => {
        if (l.id !== layerId || !isMathLayer(l)) return l;
        return { ...l, effects: [...(l.effects || []), { kind, params, mod: {} }] };
      }),
    };
  }),

  mathEffectRemove: (layerId, index) => set((state) => {
    const layers = state.layers.map((l) => {
      if (l.id !== layerId || !isMathLayer(l)) return l;
      const effects = [...(l.effects || [])];
      if (index < 0 || index >= effects.length) return l;
      effects.splice(index, 1);
      return { ...l, effects };
    });
    if (JSON.stringify(layers) === JSON.stringify(state.layers)) return {};
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers };
  }),

  mathEffectReorder: (layerId, index, delta) => set((state) => {
    const layers = state.layers.map((l) => {
      if (l.id !== layerId || !isMathLayer(l)) return l;
      const effects = [...(l.effects || [])];
      const j = index + delta;
      if (index < 0 || index >= effects.length || j < 0 || j >= effects.length) return l;
      [effects[index], effects[j]] = [effects[j], effects[index]];
      return { ...l, effects };
    });
    if (JSON.stringify(layers) === JSON.stringify(state.layers)) return {};
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers };
  }),

  mathEffectSetKind: (layerId, index, kind) => set((state) => {
    const params = defaultMathParams(kind);
    if (!params) return {};
    const layers = state.layers.map((l) => {
      if (l.id !== layerId || !isMathLayer(l)) return l;
      const effects = [...(l.effects || [])];
      if (index < 0 || index >= effects.length) return l;
      effects[index] = { kind, params, mod: {} };
      return { ...l, effects };
    });
    if (JSON.stringify(layers) === JSON.stringify(state.layers)) return {};
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers };
  }),

  mathEffectSetParam: (layerId, index, key, value) => set((state) => {
    const layers = state.layers.map((l) => {
      if (l.id !== layerId || !isMathLayer(l)) return l;
      const effects = [...(l.effects || [])];
      const fx = effects[index];
      if (!fx) return l;
      const pdef = MATH_EFFECT_DEFS[fx.kind]?.params[key];
      if (!pdef) return l;
      const v = Number(value);
      const rounded = pdef.type === 'int' && Number.isFinite(v) ? Math.round(v) : v;
      const clamped = Number.isFinite(rounded) ? Math.min(pdef.max, Math.max(pdef.min, rounded)) : pdef.def;
      effects[index] = { ...fx, params: { ...fx.params, [key]: clamped } };
      return { ...l, effects };
    });
    if (JSON.stringify(layers) === JSON.stringify(state.layers)) return {};
    return { ...pushToUndo(state, false, UNDO_KIND_LAYERS), layers };
  }),

  mathEffectSetMod: (layerId, index, key, mod) => set((state) => {
    const layers = state.layers.map((l) => {
      if (l.id !== layerId || !isMathLayer(l)) return l;
      const effects = [...(l.effects || [])];
      const fx = effects[index];
      if (!fx || !MATH_EFFECT_DEFS[fx.kind]?.params[key]) return l;
      const src = mod === 'none' || mod == null ? null : String(mod);
      if (src && !MATH_MOD_SOURCES.includes(src)) return l;
      const clean = { ...(fx.mod || {}) };
      if (!src) delete clean[key];
      else clean[key] = src;
      effects[index] = { ...fx, mod: clean };
      return { ...l, effects };
    });
    if (JSON.stringify(layers) === JSON.stringify(state.layers)) return {};
    return { ...pushToUndo(state, false, UNDO_KIND_LAYERS), layers };
  }),
});
