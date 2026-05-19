import { create } from 'zustand';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { ASSETS } from '../data/assets/index.js';
import { PALETTES } from '../data/palettes.js';
import { createGrid, stepGrid } from '../engine/ca-engine.js';

// ── Helpers ────────────────────────────────────────────────────────────────
const RANDOMIZABLE_KEYS = [
  'count', 'scale', 'rotate', 'alpha', 'jitter', 'density', 'zTiers',
  'noiseFreq', 'noiseSpeed', 'displacement', 'particleCount', 'swarmCohesion', 'gravityWells', 'damping'
];
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));

function randomizeKey(key) {
  switch (key) {
    case 'count':         return randInt(30, 600);
    case 'scale':         return [+(rand(0.1, 1.0).toFixed(2)), +(rand(1.0, 3.0).toFixed(2))];
    case 'rotate':        return [randInt(-180, 0), randInt(0, 180)];
    case 'alpha':         return [randInt(15, 60), randInt(70, 100)];
    case 'jitter':        return randInt(0, 150);
    case 'density':       return randInt(20, 120);
    case 'zTiers':        return randInt(1, 10);
    
    // Physics & Turbulence randomizations
    case 'noiseFreq':     return +(rand(0.002, 0.015).toFixed(4));
    case 'noiseSpeed':    return +(rand(0.1, 2.0).toFixed(2));
    case 'displacement':  return randInt(0, 150);
    case 'particleCount': return randInt(50, 300);
    case 'swarmCohesion': return +(rand(0.2, 4.0).toFixed(2));
    case 'gravityWells':  return +(rand(0.1, 3.0).toFixed(2));
    case 'damping':       return +(rand(0.90, 0.98).toFixed(2));
    
    default:              return undefined;
  }
}

const initialEnabledAssets = {};
ASSETS.forEach(a => { initialEnabledAssets[a.id] = true; });

// ── Slices ─────────────────────────────────────────────────────────────────

const createAudioSlice = (set, get) => ({
  audioEnabled: false,
  audioSource: { type: 'device', id: 'default' },
  audioGain: 1.0,
  audioMonitor: false,
  audioBands: { bass: 0, mid: 0, treble: 0, rms: 0 },
  beatPulse: 0,
  audioStimulus: 0,
  
  setAudioEnabled: (enabled) => set({ audioEnabled: enabled }),
  setAudioSource: (source) => set({ audioSource: source }),
  setAudioGain: (gain) => set({ audioGain: gain }),
  setAudioMonitor: (monitor) => set({ audioMonitor: monitor }),
  setAudioBands: (bands) => set({ audioBands: bands }),
  setAudioStimulus: (stim) => set({ audioStimulus: stim }),
  setBeatPulse: (valOrFn) => set((state) => ({ 
    beatPulse: typeof valOrFn === 'function' ? valOrFn(state.beatPulse) : valOrFn 
  })),
});

let lastPushTime = 0;

const pushToUndo = (state, force = false) => {
  const now = Date.now();
  const current = {
    seed: state.seed,
    paletteId: state.paletteId,
    layoutParams: JSON.parse(JSON.stringify(state.layoutParams)),
  };
  
  if (!force && now - lastPushTime < 800) {
    return {
      historyRedoStack: [],
    };
  }
  
  const last = state.historyUndoStack[state.historyUndoStack.length - 1];
  if (
    last &&
    last.seed === current.seed &&
    last.paletteId === current.paletteId &&
    JSON.stringify(last.layoutParams) === JSON.stringify(current.layoutParams)
  ) {
    return {};
  }
  
  lastPushTime = now;
  return {
    historyUndoStack: [...state.historyUndoStack, current].slice(-50),
    historyRedoStack: [],
  };
};

const createLayoutSlice = (set, get) => ({
  seed: 0xa17e9b21,
  paletteId: 'praystation',
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS },
  lockedParams: {},
  motionSmoothing: true,
  caGrid: null, // FG-02: CA grid for cellular automaton layout mode
  historyUndoStack: [],
  historyRedoStack: [],

  setSeed: (seed) => set((state) => ({ ...pushToUndo(state, true), seed })),
  bumpSeed: () => set((state) => ({ ...pushToUndo(state, true), seed: (state.seed ^ ((Math.random() * 0xffffffff) | 0)) >>> 0 })),
  setPaletteId: (id) => set((state) => ({ ...pushToUndo(state, true), paletteId: id })),
  setLayoutParam: (key, value) => set((state) => {
    if (state.layoutParams[key] === value) return {};
    const undoUpdate = pushToUndo(state, false);
    const next = { ...undoUpdate, layoutParams: { ...state.layoutParams, [key]: value } };
    // FG-02: auto-init CA grid when switching to CA mode
    if (key === 'mode' && value === 'ca' && !state.caGrid) {
      next.caGrid = createGrid(40, 28);
    }
    return next;
  }),
  setLayoutParams: (params) => set((state) => ({ ...pushToUndo(state, true), layoutParams: { ...state.layoutParams, ...params } })),
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
    lockedParams: { ...state.lockedParams, [key]: !state.lockedParams[key] }
  })),

  randomizeParam: (key) => set((state) => ({
    ...pushToUndo(state, true),
    layoutParams: { ...state.layoutParams, [key]: randomizeKey(key) }
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

const createGlobalSlice = (set, get) => ({
  running: true,
  fps: 58.4,
  isFullscreen: false,
  slowRender: false,
  webcamEnabled: false,
  motionEnergy: 0,
  
  enabledAssets: initialEnabledAssets,
  search: '',
  catFilter: 'all',
  poolView: 'grid',

  setRunning: (running) => set({ running }),
  setFps: (fps) => set({ fps }),
  toggleFullscreen: () => set((state) => ({ isFullscreen: !state.isFullscreen })),
  setSlowRender: (slow) => set({ slowRender: slow }),
  setWebcamEnabled: (enabled) => set({ webcamEnabled: enabled }),
  setMotionEnergy: (energy) => set({ motionEnergy: energy }),
  
  toggleAsset: (id) => set((state) => ({
    enabledAssets: { ...state.enabledAssets, [id]: !state.enabledAssets[id] }
  })),
  toggleAllAssets: (enabled) => set((state) => {
    const next = { ...state.enabledAssets };
    ASSETS.forEach(a => {
      if (state.catFilter === 'all' || a.category === state.catFilter) next[a.id] = enabled;
    });
    return { enabledAssets: next };
  }),
  setSearch: (search) => set({ search }),
  setCatFilter: (filter) => set({ catFilter: filter }),
  setPoolView: (view) => set({ poolView: view }),
});

const createDavisSlice = (set, get) => ({
  evolveMode: false,
  evolveSource: 'time',
  evolveTarget: 'seed',
  evolveInterval: 2000,
  autoSnapshot: false,
  lastEvolveTs: 0,
  favorites: [],

  setEvolveMode: (valOrFn) => set((state) => ({
    evolveMode: typeof valOrFn === 'function' ? valOrFn(state.evolveMode) : valOrFn
  })),
  setEvolveSource: (source) => set({ evolveSource: source }),
  setEvolveTarget: (target) => set({ evolveTarget: target }),
  setEvolveInterval: (interval) => set({ evolveInterval: interval }),
  setAutoSnapshot: (auto) => set({ autoSnapshot: auto }),
  
  triggerEvolve: () => set((state) => {
    const ts = Date.now();
    // FG-02: step CA grid on every evolve tick when in CA mode
    const caUpdate = state.layoutParams.mode === 'ca'
      ? { caGrid: state.caGrid ? stepGrid(state.caGrid) : createGrid(40, 28) }
      : {};
    if (state.evolveTarget === 'seed') {
      return { ...caUpdate, seed: (state.seed + 1) % 1000000, lastEvolveTs: ts };
    }
    if (state.evolveTarget === 'palette') {
      const pIds = ['praystation', 'v01d', 'hydra', 'dystopia', 'folktotem'];
      const currentIdx = pIds.indexOf(state.paletteId);
      const nextIdx = (currentIdx + 1) % pIds.length;
      return { ...caUpdate, paletteId: pIds[nextIdx], lastEvolveTs: ts };
    }
    if (state.evolveTarget === 'layout' || state.evolveTarget === 'all') {
      const newLayout = { ...state.layoutParams };
      const params = {
        count: { min: 10, max: 500, type: 'int', isRange: false },
        scale: { min: 0.1, max: 3.0, type: 'float', isRange: true },
        rotate: { min: -180, max: 180, type: 'float', isRange: true },
        alpha: { min: 10, max: 100, type: 'int', isRange: true },
        jitter: { min: 0, max: 150, type: 'int', isRange: false },
        density: { min: 10, max: 100, type: 'int', isRange: false },
        zTiers: { min: 1, max: 10, type: 'int', isRange: false },
        
        // Physics & Turbulence Evolving bounds
        noiseFreq: { min: 0.002, max: 0.02, type: 'float', isRange: false },
        noiseSpeed: { min: 0.1, max: 2.0, type: 'float', isRange: false },
        displacement: { min: 0, max: 120, type: 'int', isRange: false },
        particleCount: { min: 30, max: 300, type: 'int', isRange: false },
        swarmCohesion: { min: 0.5, max: 3.5, type: 'float', isRange: false },
        gravityWells: { min: 0.1, max: 3.5, type: 'float', isRange: false },
        damping: { min: 0.90, max: 0.98, type: 'float', isRange: false },
      };
      Object.entries(params).forEach(([key, conf]) => {
        if (!state.lockedParams[key]) {
          if (conf.isRange) {
            const mid = (conf.max + conf.min) / 2;
            const low = Math.random() * (mid - conf.min) + conf.min;
            const high = Math.random() * (conf.max - mid) + mid;
            newLayout[key] = conf.type === 'int'
              ? [Math.floor(low), Math.floor(high)]
              : [Number(low.toFixed(2)), Number(high.toFixed(2))];
          } else {
            const v = Math.random() * (conf.max - conf.min) + conf.min;
            newLayout[key] = conf.type === 'int' ? Math.floor(v) : Number(v.toFixed(2));
          }
        }
      });
      
      if (state.evolveTarget === 'all') {
        const pIds = ['praystation', 'v01d', 'hydra', 'dystopia', 'folktotem'];
        const randomPalette = pIds[Math.floor(Math.random() * pIds.length)];
        return { ...caUpdate, seed: (state.seed + 1) % 1000000, paletteId: randomPalette, layoutParams: newLayout, lastEvolveTs: ts };
      }
      return { ...caUpdate, layoutParams: newLayout, lastEvolveTs: ts };
    }
    return {};
  }),

  addFavorite: (fav) => set((state) => ({ favorites: [...state.favorites, fav] })),
  removeFavorite: (index) => set((state) => ({ favorites: state.favorites.filter((_, i) => i !== index) })),
  recallFavorite: (fav) => set({ 
    seed: fav.seed, 
    ...(fav.config?.layout ? { layoutParams: fav.config.layout } : {}),
    ...(fav.config?.palette?.id ? { paletteId: fav.config.palette.id } : {})
  }),
});

const createExportSlice = (set, get) => ({
  snapshots: [],
  exportResolution: 1,
  isRecording: false,

  addSnapshot: (snap) => set((state) => ({ snapshots: [...state.snapshots, snap] })),
  removeSnapshot: (index) => set((state) => ({ snapshots: state.snapshots.filter((_, i) => i !== index) })),
  clearSnapshots: () => set({ snapshots: [] }),
  setExportResolution: (res) => set({ exportResolution: res }),
  setIsRecording: (recording) => set({ isRecording: recording }),
});

// ── Store ──────────────────────────────────────────────────────────────────

export const useStore = create((set, get) => ({
  ...createAudioSlice(set, get),
  ...createLayoutSlice(set, get),
  ...createGlobalSlice(set, get),
  ...createDavisSlice(set, get),
  ...createExportSlice(set, get),
}));
