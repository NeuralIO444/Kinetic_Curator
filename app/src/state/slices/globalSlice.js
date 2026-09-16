import { ASSETS } from '../../data/assets/index.js';
import { getQualityCaps } from '../../data/quality.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../../data/layout-modes.js';

const initialEnabledAssets = {};
ASSETS.forEach((a) => { initialEnabledAssets[a.id] = true; });

const WEIGHT_CYCLE = ['light', 'medium', 'heavy'];

function normalizeSnapshots(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [id, snap] of Object.entries(raw)) {
    if (!snap || typeof snap !== 'object') continue;
    out[id] = {
      ...snap,
      layoutParams: normalizeLayoutParams(snap.layoutParams),
    };
  }
  return out;
}

export const createGlobalSlice = (set) => ({
  running: true,
  fps: 60,
  nodeCount: 0,
  quality: 'balanced',
  autoQuality: true,
  isFullscreen: false,
  slowRender: false,
  webcamEnabled: false,
  motionEnergy: 0,

  enabledAssets: initialEnabledAssets,
  /** Runtime overrides over authored asset.weight — id → 'heavy'|'medium'|'light' */
  assetWeightOverrides: {},
  search: '',
  catFilter: 'all',
  poolView: 'grid',

  setRunning: (running) => set({ running }),
  setFps: (fps) => set({ fps }),
  setNodeCount: (count) => set({ nodeCount: count }),
  setQuality: (quality) => set((state) => {
    const caps = getQualityCaps(quality);
    const next = { quality };
    if (!caps.allowMirror && state.layoutParams.mirror) {
      next.layoutParams = { ...state.layoutParams, mirror: false };
    }
    return next;
  }),
  setAutoQuality: (auto) => set({ autoQuality: !!auto }),
  toggleFullscreen: () => set((state) => ({ isFullscreen: !state.isFullscreen })),
  setSlowRender: (slow) => set({ slowRender: slow }),
  setWebcamEnabled: (enabled) => set({ webcamEnabled: enabled }),
  setMotionEnergy: (energy) => set({ motionEnergy: energy }),

  toggleAsset: (id) => set((state) => ({
    enabledAssets: { ...state.enabledAssets, [id]: !state.enabledAssets[id] },
  })),
  soloAsset: (id) => set(() => {
    const next = {};
    ASSETS.forEach((a) => { next[a.id] = a.id === id; });
    return { enabledAssets: next };
  }),
  toggleAllAssets: (enabled) => set((state) => {
    const next = { ...state.enabledAssets };
    ASSETS.forEach((a) => {
      if (state.catFilter === 'all' || a.category === state.catFilter) next[a.id] = enabled;
    });
    return { enabledAssets: next };
  }),
  setEnabledAssets: (map) => set({ enabledAssets: { ...map } }),
  setSearch: (search) => set({ search }),
  setCatFilter: (filter) => set({ catFilter: filter }),
  setPoolView: (view) => set({ poolView: view }),

  setAssetWeight: (id, weight) => set((state) => {
    if (!WEIGHT_CYCLE.includes(weight)) return {};
    const asset = ASSETS.find((a) => a.id === id);
    if (!asset) return {};
    // Clear override if it matches authored weight
    if (asset.weight === weight) {
      if (!(id in state.assetWeightOverrides)) return {};
      const next = { ...state.assetWeightOverrides };
      delete next[id];
      return { assetWeightOverrides: next };
    }
    return {
      assetWeightOverrides: { ...state.assetWeightOverrides, [id]: weight },
    };
  }),

  cycleAssetWeight: (id) => set((state) => {
    const asset = ASSETS.find((a) => a.id === id);
    if (!asset) return {};
    const current = state.assetWeightOverrides[id] || asset.weight || 'medium';
    const idx = WEIGHT_CYCLE.indexOf(current);
    const nextW = WEIGHT_CYCLE[(idx + 1) % WEIGHT_CYCLE.length];
    if (nextW === asset.weight) {
      const next = { ...state.assetWeightOverrides };
      delete next[id];
      return { assetWeightOverrides: next };
    }
    return {
      assetWeightOverrides: { ...state.assetWeightOverrides, [id]: nextW },
    };
  }),

  setCategoryWeight: (category, weight) => set((state) => {
    if (!WEIGHT_CYCLE.includes(weight)) return {};
    const next = { ...state.assetWeightOverrides };
    ASSETS.forEach((a) => {
      if (a.category !== category) return;
      if (a.weight === weight) delete next[a.id];
      else next[a.id] = weight;
    });
    return { assetWeightOverrides: next };
  }),

  clearWeightOverrides: () => set({ assetWeightOverrides: {} }),

  /** Apply a parsed project document in one store update (#33). */
  applyProject: (doc) => set((state) => {
    const next = {
      seed: doc.seed >>> 0,
      paletteId: doc.paletteId || state.paletteId,
      quality: doc.quality || state.quality,
      // Defaults + document only — do not leak the previous session's params.
      layoutParams: normalizeLayoutParams(doc.layoutParams),
    };
    if (doc.enabledAssets && typeof doc.enabledAssets === 'object') {
      const enabled = { ...initialEnabledAssets };
      for (const [id, on] of Object.entries(doc.enabledAssets)) {
        if (id in enabled) enabled[id] = !!on;
      }
      next.enabledAssets = enabled;
    }
    if (doc.assetWeightOverrides && typeof doc.assetWeightOverrides === 'object') {
      next.assetWeightOverrides = { ...doc.assetWeightOverrides };
    }
    // Absent key means "catalog palette" — restore null rather than leaving
    // whatever the previous session had overridden (#53).
    next.paletteOverrides = doc.paletteOverrides ?? null;
    if (Array.isArray(doc.layers) && doc.layers.length > 0 && doc.activeLayerId) {
      next.layers = doc.layers;
      next.activeLayerId = doc.activeLayerId;
      next.layerSnapshots = normalizeSnapshots(doc.layerSnapshots);
      next.historyUndoStack = [];
      next.historyRedoStack = [];
    }
    return next;
  }),
});

export { WEIGHT_CYCLE, initialEnabledAssets, DEFAULT_LAYOUT_PARAMS };
