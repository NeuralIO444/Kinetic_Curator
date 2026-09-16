import { ASSETS } from '../../data/assets/index.js';
import { getQualityCaps } from '../../data/quality.js';
import { normalizeLayoutParams } from '../../data/layout-modes.js';
import {
  sanitizeOverlay, duplicateIntoOverlay, ingestIntoOverlay,
  removeFromOverlay, renameOverlayAsset, replaceOverlayAsset,
} from '../../assets/overlay.js';

const initialEnabledAssets = {};
ASSETS.forEach((a) => { initialEnabledAssets[a.id] = true; });

const WEIGHT_CYCLE = ['light', 'medium', 'heavy'];

function normalizeSnapshots(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [id, snap] of Object.entries(raw)) {
    if (!snap || typeof snap !== 'object') continue;
    out[id] = { ...snap, layoutParams: normalizeLayoutParams(snap.layoutParams) };
  }
  return out;
}

function findAsset(id, overlay) {
  return overlay.find((a) => a.id === id) || ASSETS.find((a) => a.id === id) || null;
}

export const createGlobalSlice = (set) => ({
  running: true,
  fps: 60,
  nodeCount: 0,
  quality: 'balanced',
  autoQuality: true,
  isFullscreen: false,
  /**
   * Set by usePerformanceGovernor when FPS is sustained near zero (#107 §4).
   * Quality/count steps only shrink what gets drawn; at ~0 FPS the cost is
   * often evolve/ambient-drift/ACCUM/swarm still doing full-rate work
   * underneath whatever quality is set, so those pause outright on this flag
   * until FPS recovers. MasterBar surfaces it so the operator knows why the
   * composition suddenly stopped breathing.
   */
  slowRender: false,
  webcamEnabled: false,
  motionEnergy: 0,

  enabledAssets: initialEnabledAssets,
  assetWeightOverrides: {},
  customAssets: [],
  ingestError: null,
  /**
   * Whether the session is actually being persisted (#107 §6).
   *   'ok'          last autosave written
   *   'unsaved'     localStorage refused the write (quota, or a private window)
   *   'quarantined' boot found a document it could not parse; defaults were
   *                 loaded and the bad blob moved to kc:project:quarantine
   *
   * Surfaced in MasterBar because the failure this guards against is an
   * operator believing a long set is being saved when nothing is.
   */
  persistStatus: 'ok',
  search: '',
  catFilter: 'all',
  poolView: 'grid',

  setPersistStatus: (persistStatus) => set({ persistStatus }),
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
  soloAsset: (id) => set((state) => {
    const next = {};
    ASSETS.forEach((a) => { next[a.id] = a.id === id; });
    sanitizeOverlay(state.customAssets).forEach((a) => { next[a.id] = a.id === id; });
    return { enabledAssets: next };
  }),
  toggleAllAssets: (enabled) => set((state) => {
    const next = { ...state.enabledAssets };
    const userOnly = state.catFilter === 'user';
    ASSETS.forEach((a) => {
      if (userOnly) return;
      if (state.catFilter === 'all' || a.category === state.catFilter) next[a.id] = enabled;
    });
    sanitizeOverlay(state.customAssets).forEach((a) => {
      if (state.catFilter === 'all' || state.catFilter === 'user' || a.category === state.catFilter) next[a.id] = enabled;
    });
    return { enabledAssets: next };
  }),
  setEnabledAssets: (map) => set({ enabledAssets: { ...map } }),
  setSearch: (search) => set({ search }),
  setCatFilter: (filter) => set({ catFilter: filter }),
  setPoolView: (view) => set({ poolView: view }),

  duplicateAsset: (id) => set((state) => {
    const src = findAsset(id, sanitizeOverlay(state.customAssets));
    if (!src) return {};
    const result = duplicateIntoOverlay(src, state.customAssets);
    if (!result.ok) return { ingestError: result.error };
    return {
      customAssets: result.overlay,
      enabledAssets: { ...state.enabledAssets, [result.asset.id]: false },
      ingestError: null,
    };
  }),

  ingestAsset: (svg, hint) => set((state) => {
    const result = ingestIntoOverlay(svg, state.customAssets, hint);
    if (!result.ok) return { ingestError: result.error || 'ingest failed' };
    return {
      customAssets: result.overlay,
      enabledAssets: { ...state.enabledAssets, [result.asset.id]: false },
      ingestError: null,
    };
  }),

  removeCustomAsset: (id) => set((state) => {
    const result = removeFromOverlay(id, state.customAssets);
    if (!result.ok) return { ingestError: result.error };
    const enabled = { ...state.enabledAssets };
    delete enabled[id];
    return { customAssets: result.overlay, enabledAssets: enabled, ingestError: null };
  }),

  renameCustomAsset: (id, name) => set((state) => {
    const result = renameOverlayAsset(id, name, state.customAssets);
    if (!result.ok) return { ingestError: result.error };
    const enabled = { ...state.enabledAssets };
    if (result.from !== result.to) {
      enabled[result.to] = enabled[result.from];
      delete enabled[result.from];
    }
    return { customAssets: result.overlay, enabledAssets: enabled, ingestError: null };
  }),

  replaceCustomAsset: (id, svg) => set((state) => {
    const result = replaceOverlayAsset(id, svg, state.customAssets);
    if (!result.ok) return { ingestError: result.error };
    return { customAssets: result.overlay, ingestError: null };
  }),

  setAssetWeight: (id, weight) => set((state) => {
    if (!WEIGHT_CYCLE.includes(weight)) return {};
    const asset = findAsset(id, sanitizeOverlay(state.customAssets));
    if (!asset) return {};
    if (asset.weight === weight) {
      if (!(id in state.assetWeightOverrides)) return {};
      const next = { ...state.assetWeightOverrides };
      delete next[id];
      return { assetWeightOverrides: next };
    }
    return { assetWeightOverrides: { ...state.assetWeightOverrides, [id]: weight } };
  }),

  cycleAssetWeight: (id) => set((state) => {
    const asset = findAsset(id, sanitizeOverlay(state.customAssets));
    if (!asset) return {};
    const current = state.assetWeightOverrides[id] || asset.weight || 'medium';
    const idx = WEIGHT_CYCLE.indexOf(current);
    const nextW = WEIGHT_CYCLE[(idx + 1) % WEIGHT_CYCLE.length];
    if (nextW === asset.weight) {
      const next = { ...state.assetWeightOverrides };
      delete next[id];
      return { assetWeightOverrides: next };
    }
    return { assetWeightOverrides: { ...state.assetWeightOverrides, [id]: nextW } };
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

  applyProject: (doc) => set((state) => {
    const next = {
      seed: doc.seed >>> 0,
      paletteId: doc.paletteId || state.paletteId,
      quality: doc.quality || state.quality,
      layoutParams: normalizeLayoutParams(doc.layoutParams),
      customAssets: sanitizeOverlay(doc.customAssets),
      ingestError: null,
    };
    if (doc.enabledAssets && typeof doc.enabledAssets === 'object') {
      const enabled = { ...initialEnabledAssets };
      for (const [id, on] of Object.entries(doc.enabledAssets)) enabled[id] = !!on;
      next.enabledAssets = enabled;
    }
    if (doc.assetWeightOverrides && typeof doc.assetWeightOverrides === 'object') {
      next.assetWeightOverrides = { ...doc.assetWeightOverrides };
    }
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

export { WEIGHT_CYCLE, initialEnabledAssets };
