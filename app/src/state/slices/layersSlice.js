import { DEFAULT_LAYOUT_PARAMS, BLEND_MODES } from '../../data/layout-modes.js';
import { initialEnabledAssets } from './globalSlice.js';
import { defaultFxEffects, defaultFxParams, isFxLayer, FX_EFFECT_DEFS, FX_MENU_KINDS, availableFxKinds, fxEffectInsertIndex } from '../../fx/fxFilters.js';
import { kindsForFxOrdinal } from '../../fx/fxTrack.js';
import { isMathLayer, defaultMathEffects, defaultMathParams, MATH_EFFECT_DEFS, MATH_MOD_SOURCES } from '../../fx/mathFilters.js';
import { pushToUndo, UNDO_KIND_LAYERS } from '../history.js';
import { normalizeSeedOffsets } from '../../engine/kernel/rng.js';
import { isTapeFull } from '../tapeBudget.js';
import { fxBeforeMath, canTrade } from '../layerOrder.js';
import { PATTERN_DEFAULT_DENSITY, PATTERN_PARAM_KEYS, defaultPattern, sanitizePattern } from '../patternTrack.js';

export const MAX_CONTENT_TRACKS = 4;
export const MAX_FX_TRACKS = 4;
// #1010 — MATH is a third track type: same grammar as FX (add/remove/hide/
// solo/opacity/reorder), riding the same fold. Adjustment tracks (FX+MATH)
// stay above KC tracks, and since #1048 every FX track folds before every
// MATH track (layerOrder.js) — the tone grade is applied last.
export const MAX_MATH_TRACKS = 4;

/** Adjustment track: FX or MATH — the two families that grade everything below. */
export const isAdjustmentLayer = (layer) => isFxLayer(layer) || isMathLayer(layer);

// #1097 — PATTERN is a third track type: it sits in the content group (composites like content,
// rides the FX fold) but is NOT a KC track. Its parameters live on the layer (`layer.pattern`),
// it has no snapshot, and it is never the active layer that owns BUILD's sliders and the seed.
export const isPatternLayer = (layer) => !!layer && layer.type === 'pattern';
/** A KC track: the only layer type that owns the BUILD sliders, the seed and a snapshot. */
export const isKcLayer = (layer) => !!layer && !isAdjustmentLayer(layer) && !isPatternLayer(layer);

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
const AUTO_LAYER_NAME = /^(?:KC-\d+|PT-\d+|FX \d+|M \d+|Layer(?: \d+)?)$|\scopy$/;

/** Positional label (KC-n / FX n / M n) — the one naming source; a real rename shows as 'KC-n · name'. */
export function displayLayerName(layer, ordinal) {
  if (!layer) return '';
  const base = isFxLayer(layer) ? `FX ${ordinal}` : isMathLayer(layer) ? `M ${ordinal}` : isPatternLayer(layer) ? `PT-${ordinal}` : `KC-${ordinal}`;
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
  selectedPatternLayerId: null, // #1099 — the PATTERN track whose editor is open (like selectedFxLayerId)
  // #1014 (mockup C rebuild) — "last-used defaults" for the per-section "+".
  // Updated ONLY by real user "+" taps / chooser picks (addLayer/addFxLayer
  // with a family). Boot/shuffle system arms build their layers directly in
  // layoutSlice, so they never touch these.
  // - KC: blend modes are free — one-tap replays the last-used blend.
  // - FX: each FX ordinal is bound to one family (#520/#732: FX-1 Distort,
  //   FX-2 Tonal, FX-3 Blur, FX-4 Finish) — one-tap replays the last-used
  //   kind only when the new track's family can hold it, else the empty
  //   rack. (Replaying cross-family would arm a phantom effect the row
  //   editor can't show.) Replay goes live on remove/re-add at an ordinal.
  lastUsedContentBlend: null, // blend-mode string
  lastUsedFxKind: null, // fx-kind string

  addLayer: (family) => set((state) => {
    const content = state.layers.filter((l) => !isAdjustmentLayer(l)).length;
    if (content >= MAX_CONTENT_TRACKS) return {};
    // #342 — tape pre-flight: refuse rather than let the governor's shed
    // ladder silently degrade the render to absorb a track the tape can't
    // afford. isTapeFull is always visible on the PLAY readout (TapeCounter),
    // so the refusal is never a silent dead click.
    if (isTapeFull(state)) return {};
    const id = makeLayerId();
    const snapshot = freshSnapshot((Math.random() * 0xffffffff) | 0);
    const name = `KC-${state.layers.filter(isKcLayer).length + 1}`;
    // #1014 (mockup C) — one-tap "+" replays the last-used blend; a
    // chooser pick (family = blend mode) arms with it AND records it.
    const picked = typeof family === 'string' && BLEND_MODES.includes(family);
    const layerBlendMode = picked ? family : (state.lastUsedContentBlend ?? 'normal');
    return {
      ...pushToUndo(state, true, UNDO_KIND_LAYERS),
      layers: [...state.layers, { id, name, type: 'content', visible: true, layerBlendMode, layerOpacity: 1, patch: { mode: 'off', to: null, strength: 0.16 } }],
      layerSnapshots: { ...state.layerSnapshots, [state.activeLayerId]: captureSnapshot(state) },
      activeLayerId: id,
      ...(picked ? { lastUsedContentBlend: family } : null),
      ...snapshot,
    };
  }),

  // #1097 — PATTERN tracks. They share the content cap and the tape pre-flight with KC tracks, never
  // become the active layer, and keep their parameters on the layer. Seed is a stored integer; SHUFFLE
  // writes a new one (the DROP gate that decides WHEN is #1100). Every write goes through sanitizePattern.
  addPatternLayer: (mode) => set((state) => {
    if (state.layers.filter((l) => !isAdjustmentLayer(l)).length >= MAX_CONTENT_TRACKS) return {};
    if (isTapeFull(state)) return {}; // #342 — same pre-flight as addLayer
    const id = makeLayerId();
    const n = state.layers.filter(isPatternLayer).length + 1;
    const pattern = defaultPattern(mode, (Math.random() * 0xffffffff) >>> 0);
    return {
      ...pushToUndo(state, true, UNDO_KIND_LAYERS),
      layers: [...state.layers, { id, name: `PT-${n}`, type: 'pattern', visible: true, layerBlendMode: 'normal', layerOpacity: 1, pattern }],
      selectedPatternLayerId: id,
    };
  }),

  selectPatternLayer: (id) => set((state) => {
    const l = state.layers.find((x) => x.id === id);
    return { selectedPatternLayerId: l && isPatternLayer(l) ? id : null };
  }),

  setPatternParam: (id, key, value) => set((state) => {
    const target = state.layers.find((l) => l.id === id);
    if (!target || !isPatternLayer(target) || !PATTERN_PARAM_KEYS.includes(key)) return {};
    const next = sanitizePattern({ ...target.pattern, [key]: value });
    if (next[key] === target.pattern?.[key]) return {};
    return {
      ...pushToUndo(state, false, UNDO_KIND_LAYERS), // slider-driven: one drag is one undo entry
      layers: state.layers.map((l) => (l.id === id ? { ...l, pattern: next } : l)),
    };
  }),

  setPatternMode: (id, mode) => set((state) => {
    const target = state.layers.find((l) => l.id === id);
    if (!target || !isPatternLayer(target)) return {};
    const prev = sanitizePattern(target.pattern);
    const next = sanitizePattern({ ...prev, mode });
    if (next.mode === prev.mode) return {};
    // A density the user never touched follows the new mode's own default (QUILT 8, GLYPH 4, FIELD 6).
    if (prev.density === PATTERN_DEFAULT_DENSITY[prev.mode]) next.density = PATTERN_DEFAULT_DENSITY[next.mode];
    return {
      ...pushToUndo(state, true, UNDO_KIND_LAYERS),
      layers: state.layers.map((l) => (l.id === id ? { ...l, pattern: next } : l)),
    };
  }),

  shufflePattern: (id) => set((state) => {
    const target = state.layers.find((l) => l.id === id);
    if (!target || !isPatternLayer(target)) return {};
    const prev = sanitizePattern(target.pattern);
    let seed = (Math.random() * 0xffffffff) >>> 0;
    if (seed === prev.seed) seed = (seed + 1) >>> 0;
    return {
      ...pushToUndo(state, true, UNDO_KIND_LAYERS),
      layers: state.layers.map((l) => (l.id === id ? { ...l, pattern: { ...prev, seed } } : l)),
    };
  }),

  setLayerPatch: (id, patch) => set((state) => {
    const target = state.layers.find((l) => l.id === id);
    if (!target || !isKcLayer(target)) return {};
    const mode = ['off', 'mod', 'field', 'feed'].includes(patch?.mode) ? patch.mode : 'off';
    // #457 — target by stable layer id, not an ordinal into whatever is
    // CURRENTLY visible: an ordinal silently retargets to a different
    // track the instant hide/solo/reorder/remove changes what sits at
    // that position elsewhere in the stack. An invalid/self/dangling id
    // falls back to the previous target rather than guessing a new one.
    const candidateTo = typeof patch?.to === 'string' ? patch.to : null;
    const to = candidateTo && candidateTo !== id && state.layers.some((l) => l.id === candidateTo && isKcLayer(l))
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
    if (isPatternLayer(src)) { // #1097 — a copy is the same pattern (same seed), no snapshot
      if (state.layers.filter((l) => !isAdjustmentLayer(l)).length >= MAX_CONTENT_TRACKS) return {};
      if (isTapeFull(state)) return {};
      const copy = { id: makeLayerId(), name: `${src.name} copy`, type: 'pattern', visible: src.visible, layerBlendMode: src.layerBlendMode, layerOpacity: src.layerOpacity, pattern: sanitizePattern(src.pattern) };
      const spliced = [...state.layers];
      spliced.splice(state.layers.findIndex((l) => l.id === id) + 1, 0, copy);
      return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers: fxBeforeMath(spliced).layers };
    }
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
    const spliced = [...state.layers];
    spliced.splice(i + 1, 0, copy);
    const layers = fxBeforeMath(spliced).layers; // #1048 — a copy never breaks FX-before-MATH
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
    if (isKcLayer(target) && state.layers.filter(isKcLayer).length <= 1) return {}; // the last KC track stays (it owns the seed and the BUILD sliders)
    // Clear patch.to pointing at the removed track (same rule as projectNormalize on load).
    const layers = state.layers.filter((l) => l.id !== id)
      .map((l) => (l.patch?.to === id ? { ...l, patch: { ...l.patch, to: null } } : l));
    const snapshots = { ...state.layerSnapshots };
    delete snapshots[id];
    const selectedFxLayerId = state.selectedFxLayerId === id ? null : state.selectedFxLayerId;
    const selectedMathLayerId = state.selectedMathLayerId === id ? null : state.selectedMathLayerId;
    const selectedPatternLayerId = state.selectedPatternLayerId === id ? null : state.selectedPatternLayerId;
    if (id !== state.activeLayerId) return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers, layerSnapshots: snapshots, selectedFxLayerId, selectedMathLayerId, selectedPatternLayerId };
    const nextActive = layers.find(isKcLayer) || layers[0];
    const nextSnapshot = snapshots[nextActive.id] || freshSnapshot(state.seed, state.seedOffsets);
    delete snapshots[nextActive.id];
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers, layerSnapshots: snapshots, activeLayerId: nextActive.id, selectedFxLayerId, selectedMathLayerId, selectedPatternLayerId, ...nextSnapshot };
  }),

  setActiveLayer: (id) => set((state) => {
    if (id === state.activeLayerId) return {};
    const target = state.layers.find((l) => l.id === id);
    if (!target || !isKcLayer(target)) return {};
    const snapshot = state.layerSnapshots[id] || freshSnapshot(state.seed, state.seedOffsets);
    return { activeLayerId: id, layerSnapshots: { ...state.layerSnapshots, [state.activeLayerId]: captureSnapshot(state) }, ...snapshot };
  }),

  reorderLayer: (id, delta) => set((state) => {
    const i = state.layers.findIndex((l) => l.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= state.layers.length) return {};
    // #732 — adjustment tracks (FX+MATH) stay above KC tracks. Array is
    // bottom→top. #1048 — FX never crosses MATH: the tone grade folds last.
    const a = state.layers[i];
    const b = state.layers[j];
    if (!canTrade(a, b)) return {};
    const layers = [...state.layers];
    [layers[i], layers[j]] = [layers[j], layers[i]];
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers };
  }),

  // #1014 (mockup C) — the sectioned stack moves rows within their section:
  // swap two layers' flat positions directly (one undo entry). Same class
  // rule as reorderLayer (#732): content never crosses the adjustment line.
  swapLayerPositions: (idA, idB) => set((state) => {
    const i = state.layers.findIndex((l) => l.id === idA);
    const j = state.layers.findIndex((l) => l.id === idB);
    if (i < 0 || j < 0 || i === j) return {};
    const a = state.layers[i];
    const b = state.layers[j];
    if (!canTrade(a, b)) return {};
    const layers = [...state.layers];
    [layers[i], layers[j]] = [layers[j], layers[i]];
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers };
  }),

  toggleLayerVisible: (id) => set((state) => ({ ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers: state.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)) })),
  renameLayer: (id, name) => set((state) => ({ ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers: state.layers.map((l) => (l.id === id ? { ...l, name } : l)) })),
  setLayerBlendMode: (id, layerBlendMode) => set((state) => ({ ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers: state.layers.map((l) => (l.id === id ? { ...l, layerBlendMode } : l)) })),
  setLayerOpacity: (id, layerOpacity) => set((state) => ({ ...pushToUndo(state, false, UNDO_KIND_LAYERS), layers: state.layers.map((l) => (l.id === id ? { ...l, layerOpacity } : l)) })),

  addFxLayer: (family) => set((state) => {
    const fxCount = state.layers.filter(isFxLayer).length;
    if (fxCount >= MAX_FX_TRACKS) return {};
    if (isTapeFull(state)) return {}; // #342 — same pre-flight as addLayer
    const id = makeLayerId();
    // #1014 (mockup C) — the new track's family is fixed by its ordinal, so
    // the valid kinds are the add-menu kinds in that family's slot. A
    // chooser pick arms with it AND records it; one-tap "+" replays the
    // last-used kind when the family can hold it, else the empty rack.
    const slotKinds = kindsForFxOrdinal(fxCount + 1).filter((k) => FX_MENU_KINDS.includes(k));
    const picked = typeof family === 'string' && slotKinds.includes(family);
    const kind = picked ? family : (slotKinds.includes(state.lastUsedFxKind) ? state.lastUsedFxKind : null);
    const effects = kind ? [{ kind, params: defaultFxParams(kind) }] : [];
    return {
      ...pushToUndo(state, true, UNDO_KIND_LAYERS),
      // #1048 — a new FX track lands after the existing FX tracks and BELOW
      // every MATH track, so the tone grade stays last in the fold.
      layers: fxBeforeMath([...state.layers, { id, name: `FX ${fxCount + 1}`, type: 'fx', visible: true, effects, layerBlendMode: 'normal', layerOpacity: 1 }]).layers,
      selectedFxLayerId: id,
      ...(picked ? { lastUsedFxKind: family } : null),
    };
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
    const layers = fxBeforeMath([...state.layers, { id, name: `M ${mathCount + 1}`, type: 'math', visible: true, effects: defaultMathEffects(), layerBlendMode: 'normal', layerOpacity: 1 }]).layers;
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers, selectedMathLayerId: id };
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
