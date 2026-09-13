import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';
import { createGrid, stepGrid } from '../../engine/ca-engine.js';
import { pushToUndo } from '../history.js';
import { RANDOMIZABLE_KEYS, randomizeKey } from '../paramUtils.js';

export const createLayoutSlice = (set) => ({
  seed: 0xa17e9b21,
  paletteId: 'praystation',
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
  setPaletteId: (id) => set((state) => ({ ...pushToUndo(state, true), paletteId: id })),

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
      layoutParams: JSON.parse(JSON.stringify(state.layoutParams)),
    };
    return {
      seed: previous.seed,
      paletteId: previous.paletteId,
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
      layoutParams: JSON.parse(JSON.stringify(state.layoutParams)),
    };
    return {
      seed: next.seed,
      paletteId: next.paletteId,
      layoutParams: next.layoutParams,
      historyUndoStack: [...state.historyUndoStack, current],
      historyRedoStack: state.historyRedoStack.slice(0, -1),
    };
  }),
});
