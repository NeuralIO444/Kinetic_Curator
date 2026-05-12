import { create } from 'zustand';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { ASSETS } from '../data/assets/index.js';
import { PALETTES } from '../data/palettes.js';

// ── Helpers ────────────────────────────────────────────────────────────────
const RANDOMIZABLE_KEYS = ['count', 'scale', 'rotate', 'alpha', 'jitter', 'density', 'zTiers'];
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));

function randomizeKey(key) {
  switch (key) {
    case 'count':   return randInt(30, 600);
    case 'scale':   return [+(rand(0.1, 1.0).toFixed(2)), +(rand(1.0, 3.0).toFixed(2))];
    case 'rotate':  return [randInt(-180, 0), randInt(0, 180)];
    case 'alpha':   return [randInt(15, 60), randInt(70, 100)];
    case 'jitter':  return randInt(0, 150);
    case 'density': return randInt(20, 120);
    case 'zTiers':  return randInt(1, 10);
    default:        return undefined;
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

const createLayoutSlice = (set, get) => ({
  seed: 0xa17e9b21,
  paletteId: 'praystation',
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS },
  lockedParams: {},
  motionSmoothing: true,

  setSeed: (seed) => set({ seed }),
  bumpSeed: () => set((state) => ({ seed: (state.seed ^ ((Math.random() * 0xffffffff) | 0)) >>> 0 })),
  setPaletteId: (id) => set({ paletteId: id }),
  setLayoutParam: (key, value) => set((state) => ({ layoutParams: { ...state.layoutParams, [key]: value } })),
  setLayoutParams: (params) => set((state) => ({ layoutParams: { ...state.layoutParams, ...params } })),
  setMotionSmoothing: (smoothing) => set({ motionSmoothing: smoothing }),
  
  applyPreset: (preset) => set((state) => {
    const incoming = { ...preset.params, composition: preset.id };
    const merged = { ...state.layoutParams };
    for (const [k, v] of Object.entries(incoming)) {
      if (!state.lockedParams[k]) merged[k] = v;
    }
    return { layoutParams: merged };
  }),

  toggleParamLock: (key) => set((state) => ({
    lockedParams: { ...state.lockedParams, [key]: !state.lockedParams[key] }
  })),

  randomizeParam: (key) => set((state) => ({
    layoutParams: { ...state.layoutParams, [key]: randomizeKey(key) }
  })),

  randomizeUnlocked: () => set((state) => {
    const rp = { ...state.layoutParams };
    for (const key of RANDOMIZABLE_KEYS) {
      if (!state.lockedParams[key]) rp[key] = randomizeKey(key);
    }
    return { layoutParams: rp };
  }),
});

const createGlobalSlice = (set, get) => ({
  running: true,
  fps: 58.4,
  isFullscreen: false,
  slowRender: false,
  
  enabledAssets: initialEnabledAssets,
  search: '',
  catFilter: 'all',
  poolView: 'grid',

  setRunning: (running) => set({ running }),
  setFps: (fps) => set({ fps }),
  toggleFullscreen: () => set((state) => ({ isFullscreen: !state.isFullscreen })),
  setSlowRender: (slow) => set({ slowRender: slow }),
  
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
    if (state.evolveTarget === 'seed') {
      return { seed: (state.seed + 1) % 1000000, lastEvolveTs: ts };
    }
    if (state.evolveTarget === 'palette') {
      const pIds = ['praystation', 'v01d', 'hydra', 'dystopia', 'folktotem'];
      const currentIdx = pIds.indexOf(state.paletteId);
      const nextIdx = (currentIdx + 1) % pIds.length;
      return { paletteId: pIds[nextIdx], lastEvolveTs: ts };
    }
    if (state.evolveTarget === 'layout' || state.evolveTarget === 'all') {
      const newLayout = { ...state.layoutParams };
      const params = {
        count: { min: 10, max: 500, type: 'int' },
        scale: { min: 0.1, max: 3.0, type: 'float' },
        rotate: { min: -180, max: 180, type: 'float' },
        alpha: { min: 10, max: 100, type: 'int' }
      };
      Object.entries(params).forEach(([key, conf]) => {
        if (!state.lockedParams[key]) {
          const v = Math.random() * (conf.max - conf.min) + conf.min;
          newLayout[key] = conf.type === 'int' ? Math.floor(v) : Number(v.toFixed(2));
        }
      });
      
      if (state.evolveTarget === 'all') {
        const pIds = ['praystation', 'v01d', 'hydra', 'dystopia', 'folktotem'];
        const randomPalette = pIds[Math.floor(Math.random() * pIds.length)];
        return { seed: (state.seed + 1) % 1000000, paletteId: randomPalette, layoutParams: newLayout, lastEvolveTs: ts };
      }
      return { layoutParams: newLayout, lastEvolveTs: ts };
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
