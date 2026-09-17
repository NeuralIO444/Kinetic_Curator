import { ASSETS } from '../../data/assets/index.js';
import { getQualityCaps } from '../../data/quality.js';
import { normalizeLayoutParams } from '../../data/layout-modes.js';
import {
  sanitizeOverlay, duplicateIntoOverlay, ingestIntoOverlay,
  removeFromOverlay, renameOverlayAsset, replaceOverlayAsset,
} from '../../assets/overlay.js';
import { normalizeSnapshots } from '../projectNormalize.js';

const initialEnabledAssets = {};
ASSETS.forEach((a) => { initialEnabledAssets[a.id] = true; });

const WEIGHT_CYCLE = ['light', 'medium', 'heavy'];

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
  /**
   * Set for the duration of a batch export (#107 §5). Deliberately separate
   * from slowRender/perfTier1 above — those are owned by usePerformanceGovernor
   * and auto-clear on live FPS, which would fight a pause that must hold for
   * the whole batch regardless of momentary FPS readings.
   */
  batchPaused: false,
  /**
   * Tier 1 of the watchdog (#107 §4): FPS < 16 sustained 2s. Shedding, not
   * stopping — ACCUM, gloss and mirror render-off across every visible
   * layer, not just the active one, since a bad layer or a heavy inactive
   * snapshot can be the one costing the frame. Auto-clears the instant FPS
   * recovers; tripWatchdog (tier 2) also sets it, since a full trip should
   * shed everything tier 1 sheds too.
   */
  perfTier1: false,
  /**
   * Showrunner patrol snapshot (§4): per-stage rolling-average timings in
   * ms, synced ~4Hz by useFpsMeter. Keys are stage names ('kernel', …);
   * `__frame` carries { avg, worst } RAF-delta stats. Read-only signal for
   * the operator and for future governor stages — the governor currently
   * acts on FPS only. Never serialized (live-only, like fps itself).
   */
  stageTimings: {},
  /**
   * Showrunner cut 1: dynamic resolution scaling (#192), render-only overlay.
   *   1    — full resolution
   *   0.75 — first shed step
   *   0.5  — second shed step
   *   0.33 — deepest shed step before quality tiers move
   * Render scale drops before anything visible is cut: GPU FX compositing
   * has 10–50x headroom, so the old FX cut ladder (fxShedLevel) is retired
   * and FX layers are never culled. Auto-clears to 1 on recovery.
   * Never serialized. The live app surfaces it via ShedBadge (#177 owns the
   * full indicator design); the GL render paths scale width/height by it.
   */
  renderScale: 1,
  /**
   * Showrunner cut 5: cost-aware asset thinning, render-only overlay.
   * When on, layers drop highest-cost-score assets first instead of
   * thinning uniformly. Never serialized.
   */
  assetThin: false,
  /**
   * Showrunner frame-lock show mode: a USER choice, not a degradation.
   * When on, the life/breathing tick (the dominant per-frame re-render
   * driver) is gated to ~30Hz — a locked 30fps reads smoother than a
   * fluctuating 40–60 and halves React render work. Never auto-cleared.
   * Never serialized (it is a machine-specific choice, not composition).
   */
  frameLock: false,
  /** Bumped by every tripWatchdog() call — lets a subscriber (OutputPanel's
   * in-flight export restore) react to a NEW trip instead of a boolean it
   * has already seen. */
  watchdogTripGen: 0,
  /** Last string passed to tripWatchdog(reason) — surfaced for debugging why
   * the session is paused (e.g. 'fps-critical' vs a render-error label). */
  lastWatchdogReason: null,
  webcamEnabled: false,

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
  setBatchPaused: (paused) => set({ batchPaused: !!paused }),
  setPerfTier1: (on) => set({ perfTier1: !!on }),
  setStageTimings: (stages) => set({ stageTimings: { ...stages } }),
  setRenderScale: (scale) => {
    const s = Number(scale);
    set({ renderScale: Number.isFinite(s) && s > 0 ? Math.min(1, s) : 1 });
  },
  setAssetThin: (on) => set({ assetThin: !!on }),
  setFrameLock: (on) => set({ frameLock: !!on }),
  /**
   * Tier 2 of the watchdog (#107 §4): FPS ~ 0 sustained, or a critical
   * render-error (top-level Shell boundary only). Unlike tier 1, this is a
   * hard stop that does not undo itself on recovery — matches the Escape
   * panic-key precedent, where a panic action pauses but never resumes.
   * Cross-slice write (evolveMode lives in davisSlice): already precedented
   * by setQuality reaching into layoutParams above.
   */
  tripWatchdog: (reason) => set((state) => ({
    slowRender: true,
    running: false,
    evolveMode: false,
    perfTier1: true,
    watchdogTripGen: state.watchdogTripGen + 1,
    lastWatchdogReason: reason,
  })),
  setWebcamEnabled: (enabled) => set({ webcamEnabled: enabled }),

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

  ingestAsset: (svg, hint, opts = {}) => set((state) => {
    const result = ingestIntoOverlay(svg, state.customAssets, hint, opts);
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
    const overrides = { ...(state.assetWeightOverrides || {}) };
    delete enabled[id];
    delete overrides[id];
    return { customAssets: result.overlay, enabledAssets: enabled, assetWeightOverrides: overrides, ingestError: null };
  }),

  renameCustomAsset: (id, name) => set((state) => {
    const result = renameOverlayAsset(id, name, state.customAssets);
    if (!result.ok) return { ingestError: result.error };
    const enabled = { ...state.enabledAssets };
    const overrides = { ...(state.assetWeightOverrides || {}) };
    if (result.from !== result.to) {
      // Propagate the rename to every id-keyed map so no stale reference
      // to the old id survives (#134: overrides used to be left behind,
      // silently resetting the renamed asset's weight and persisting the
      // dead id into saved project documents).
      if (result.from in enabled) {
        enabled[result.to] = enabled[result.from];
        delete enabled[result.from];
      }
      if (result.from in overrides) {
        overrides[result.to] = overrides[result.from];
        delete overrides[result.from];
      }
    }
    return { customAssets: result.overlay, enabledAssets: enabled, assetWeightOverrides: overrides, ingestError: null };
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
    } else {
      // The serializer omits the field when empty — without this, loading a
      // clean project over a session with overrides kept the old weights.
      next.assetWeightOverrides = {};
    }
    next.paletteOverrides = doc.paletteOverrides ?? null;
    if (Array.isArray(doc.layers) && doc.layers.length > 0 && doc.activeLayerId) {
      next.layers = doc.layers;
      next.activeLayerId = doc.activeLayerId;
      next.layerSnapshots = normalizeSnapshots(doc.layerSnapshots);
      next.historyUndoStack = [];
      next.historyRedoStack = [];
      // Install the active layer's snapshot onto live state. The serializer
      // writes lockedParams/caGrid only into snapshots (never root fields),
      // so without this a load silently dropped parameter locks and the CA
      // grid; and a doc whose root values disagree with its active snapshot
      // rendered the wrong composition until a layer switch. For well-formed
      // docs this is a no-op — the snapshot was captured from the same
      // state as the root values.
      const activeSnap = next.layerSnapshots[doc.activeLayerId];
      if (activeSnap) {
        next.seed = activeSnap.seed >>> 0;
        next.paletteId = activeSnap.paletteId || next.paletteId;
        next.paletteOverrides = activeSnap.paletteOverrides ?? null;
        next.layoutParams = normalizeLayoutParams(activeSnap.layoutParams);
        next.lockedParams = activeSnap.lockedParams || {};
        next.caGrid = activeSnap.caGrid || null;
        next.enabledAssets = { ...initialEnabledAssets, ...(activeSnap.enabledAssets || {}) };
      }
    }
    return next;
  }),
});

export { WEIGHT_CYCLE, initialEnabledAssets };
