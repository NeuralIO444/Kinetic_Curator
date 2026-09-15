import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';
import { createGrid, stepGrid } from '../../engine/ca-engine.js';
import { pushToUndo } from '../history.js';
import { RANDOMIZABLE_KEYS, randomizeKey } from '../paramUtils.js';
import { getCatalogPalette, normalizeHex } from '../../data/palettes.js';
import { buildHarmony, applyWithLocks } from '../../engine/harmony.js';

export const createLayoutSlice = (set) => ({
  seed: 0xa17e9b21,
  paletteId: 'praystation',
  /** null | { swatches?: string[], bg?: string, ink?: string } — never mutates catalog */
  paletteOverrides: null,
  /** Swatch slots the operator pinned; harmony/shuffle leave these alone (#56). */
  paletteLocks: {},
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS },
  lockedParams: {},
  motionSmoothing: true,
  caGrid: null,
  historyUndoStack: [],
  historyRedoStack: [],

  setSeed: (seed) => set((state) => ({ ...pushToUndo(state, true), seed })),
  bumpSeed: () => set((state) => ({
    ...pushToUndo(state, true),
    seed: (state.seed ^ ((Math.random() * 0xffffffff) | 0)) >>> 0,
  })),
  // Switching catalog id clears overrides (AC6)
  setPaletteId: (id) => set((state) => ({
    ...pushToUndo(state, true),
    paletteId: id,
    paletteOverrides: null,
  /** Swatch slots the operator pinned; harmony/shuffle leave these alone (#56). */
  paletteLocks: {},
  })),

  setPaletteSwatch: (index, hex) => set((state) => {
    const n = normalizeHex(hex);
    if (n == null) return {};
    const base = getCatalogPalette(state.paletteId, state.userPalettes);
    if (index < 0 || index >= base.swatches.length) return {};
    const prev = state.paletteOverrides?.swatches
      ? [...state.paletteOverrides.swatches]
      : [...base.swatches];
    // Ensure length
    while (prev.length < base.swatches.length) prev.push(base.swatches[prev.length]);
    prev[index] = n;
    // If identical to catalog, collapse that slot conceptually but keep array
    const nextOverrides = {
      ...(state.paletteOverrides || {}),
      swatches: prev,
    };
    // Drop if fully matches catalog
    const matches = prev.every((s, i) => s === base.swatches[i])
      && (!nextOverrides.bg || nextOverrides.bg === base.bg)
      && (!nextOverrides.ink || nextOverrides.ink === base.ink);
    return {
      ...pushToUndo(state, true),
      paletteOverrides: matches ? null : nextOverrides,
    };
  }),

  setPaletteBg: (hex) => set((state) => {
    const n = normalizeHex(hex);
    if (n == null) return {};
    const base = getCatalogPalette(state.paletteId, state.userPalettes);
    const next = { ...(state.paletteOverrides || {}), bg: n };
    if (n === base.bg) delete next.bg;
    const empty = !next.swatches && !next.bg && !next.ink;
    return {
      ...pushToUndo(state, true),
      paletteOverrides: empty ? null : next,
    };
  }),

  setPaletteInk: (hex) => set((state) => {
    const n = normalizeHex(hex);
    if (n == null) return {};
    const base = getCatalogPalette(state.paletteId, state.userPalettes);
    const next = { ...(state.paletteOverrides || {}), ink: n };
    if (n === base.ink) delete next.ink;
    const empty = !next.swatches && !next.bg && !next.ink;
    return {
      ...pushToUndo(state, true),
      paletteOverrides: empty ? null : next,
    };
  }),

  clearPaletteOverrides: () => set((state) => {
    if (!state.paletteOverrides) return {};
    return { ...pushToUndo(state, true), paletteOverrides: null };
  }),

  setPaletteOverrides: (overrides) => set((state) => ({
    ...pushToUndo(state, true),
    paletteOverrides: overrides,
  })),

  togglePaletteLock: (index) => set((state) => ({
    paletteLocks: { ...state.paletteLocks, [index]: !state.paletteLocks[index] },
  })),

  clearPaletteLocks: () => set({ paletteLocks: {} }),

  /**
   * Regenerate unlocked swatches from a harmony scheme (#56).
   * Base colour is the first locked swatch if there is one — so locking a
   * colour you like and shuffling builds around it — else swatch 0.
   */
  applyHarmony: (scheme) => set((state) => {
    const base = getCatalogPalette(state.paletteId, state.userPalettes);
    const current = base.swatches.map((sw, i) => state.paletteOverrides?.swatches?.[i] || sw);
    const lockedIdx = Object.keys(state.paletteLocks).find((k) => state.paletteLocks[k]);
    const anchor = current[lockedIdx != null ? Number(lockedIdx) : 0] || current[0];
    const generated = buildHarmony(anchor, scheme, current.length);
    const swatches = applyWithLocks(current, generated, state.paletteLocks);
    if (swatches.every((c, i) => c === current[i])) return {};
    return {
      ...pushToUndo(state, true),
      paletteOverrides: { ...(state.paletteOverrides || {}), swatches },
    };
  }),

  setLayoutParam: (key, value) => set((state) => {
    if (state.layoutParams[key] === value) return {};
    const undoUpdate = pushToUndo(state, false);
    const next = { ...undoUpdate, layoutParams: { ...state.layoutParams, [key]: value } };
    if (key === 'mode' && value === 'ca' && !state.caGrid) {
      next.caGrid = createGrid(40, 28);
    }
    return next;
  }),

  setLayoutParams: (params) => set((state) => ({
    layoutParams: { ...state.layoutParams, ...params },
  })),

  setMotionSmoothing: (smoothing) => set({ motionSmoothing: smoothing }),
  stepCaGrid: () => set((state) => ({
    caGrid: state.caGrid ? stepGrid(state.caGrid) : createGrid(40, 28),
  })),
  resetCaGrid: () => set({ caGrid: createGrid(40, 28) }),

  applyPreset: (preset) => set((state) => {
    const incoming = { ...preset.params, composition: preset.id };
    const merged = { ...state.layoutParams };
    let changed = false;
    for (const [k, v] of Object.entries(incoming)) {
      if (!state.lockedParams[k] && merged[k] !== v) {
        merged[k] = v;
        changed = true;
      }
    }
    if (!changed && state.layoutParams.composition === preset.id) return {};
    return { ...pushToUndo(state, true), layoutParams: merged };
  }),

  toggleParamLock: (key) => set((state) => ({
    lockedParams: { ...state.lockedParams, [key]: !state.lockedParams[key] },
  })),

  randomizeParam: (key) => set((state) => ({
    ...pushToUndo(state, true),
    layoutParams: { ...state.layoutParams, [key]: randomizeKey(key) },
  })),

  randomizeUnlocked: () => set((state) => {
    const rp = { ...state.layoutParams };
    let changed = false;
    for (const key of RANDOMIZABLE_KEYS) {
      if (!state.lockedParams[key]) {
        rp[key] = randomizeKey(key);
        changed = true;
      }
    }
    if (!changed) return {};
    return { ...pushToUndo(state, true), layoutParams: rp };
  }),

  undo: () => set((state) => {
    if (state.historyUndoStack.length === 0) return {};
    const previous = state.historyUndoStack[state.historyUndoStack.length - 1];
    const current = {
      seed: state.seed,
      paletteId: state.paletteId,
      paletteOverrides: state.paletteOverrides
        ? JSON.parse(JSON.stringify(state.paletteOverrides))
        : null,
      layoutParams: JSON.parse(JSON.stringify(state.layoutParams)),
    };
    return {
      seed: previous.seed,
      paletteId: previous.paletteId,
      paletteOverrides: previous.paletteOverrides ?? null,
      layoutParams: previous.layoutParams,
      historyUndoStack: state.historyUndoStack.slice(0, -1),
      historyRedoStack: [...state.historyRedoStack, current],
    };
  }),

  redo: () => set((state) => {
    if (state.historyRedoStack.length === 0) return {};
    const next = state.historyRedoStack[state.historyRedoStack.length - 1];
    const current = {
      seed: state.seed,
      paletteId: state.paletteId,
      paletteOverrides: state.paletteOverrides
        ? JSON.parse(JSON.stringify(state.paletteOverrides))
        : null,
      layoutParams: JSON.parse(JSON.stringify(state.layoutParams)),
    };
    return {
      seed: next.seed,
      paletteId: next.paletteId,
      paletteOverrides: next.paletteOverrides ?? null,
      layoutParams: next.layoutParams,
      historyUndoStack: [...state.historyUndoStack, current],
      historyRedoStack: state.historyRedoStack.slice(0, -1),
    };
  }),
});
