import { create } from 'zustand';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { ASSETS } from '../data/assets/index.js';
import { PALETTES } from '../data/palettes.js';
import { LAYER_SNAPSHOT_KEYS } from '../engine/compose.js';

function snapshotFromStateInternal(state) {
  const out = {};
  for (const k of LAYER_SNAPSHOT_KEYS) out[k] = state[k];
  return out;
}

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
  kineticParams: {}, // params marked 'K' — AUTO-EVOLVE only mutates these
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

  toggleParamKinetic: (key) => set((state) => ({
    kineticParams: { ...state.kineticParams, [key]: !state.kineticParams[key] }
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

// Single source of truth for "what restoring a preset overwrites".
// Includes display preferences (renderingMode, perfMode, motionSmoothing,
// lockedParams) that LAYER_SNAPSHOT_KEYS deliberately omits — layers are
// pure composition snapshots, presets capture the full workspace.
const RESTORE_ALLOWED_KEYS = new Set([
  'seed', 'paletteId', 'layoutParams', 'lockedParams', 'motionSmoothing',
  'renderingMode', 'perfMode', 'enabledAssets',
  'blendMode', 'blendStrength', 'echoEnabled', 'echoCount', 'echoDecay',
  'trailEnabled', 'trailLength', 'feedbackEnabled', 'feedbackStrength',
  'feedbackDepth', 'particlesEnabled', 'particleCount', 'particleSpeed',
  'motionEnabled', 'motionType', 'blastRadiusEnabled', 'blastRadius',
  'blastForce', 'colorStrategy', 'colorHarmony',
]);

const createGlobalSlice = (set, get) => ({
  running: true,
  fps: 58.4,
  isFullscreen: false,
  renderingMode: 'svg', // 'svg' or 'webgl'
  perfMode: false,      // when true, caps expensive effects
  mode: 'studio',       // 'studio' (SVG-output-first) or 'live' (performance instrument)

  enabledAssets: initialEnabledAssets,
  search: '',
  catFilter: 'all',
  poolView: 'grid',

  setRunning: (running) => set({ running }),
  setFps: (fps) => set({ fps }),
  toggleFullscreen: () => set((state) => ({ isFullscreen: !state.isFullscreen })),
  setRenderingMode: (mode) => set({ renderingMode: mode }),
  setPerfMode: (on) => set({ perfMode: on }),
  setMode: (m) => set((state) => {
    const next = m === 'live' ? 'live' : 'studio';
    // Falling back to STUDIO: beat / motion evolve sources don't work without
    // the Stimulus panel, so snap the source back to 'time'. Also stop any
    // active keyframe playback (its UI is hidden in Studio).
    if (next === 'studio') {
      const patch = { mode: next };
      if (state.evolveSource === 'beat' || state.evolveSource === 'motion') patch.evolveSource = 'time';
      if (state.keyframePlay) patch.keyframePlay = false;
      return patch;
    }
    return { mode: next };
  }),
  restoreState: (snapshot) => set(() => {
    if (!snapshot || typeof snapshot !== 'object') return {};
    const next = {};
    for (const k of Object.keys(snapshot)) {
      if (RESTORE_ALLOWED_KEYS.has(k) && snapshot[k] !== undefined) {
        next[k] = snapshot[k];
      }
    }
    return next;
  }),
  
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

      // Scalar params: single int/float.
      const SCALARS = {
        count: { min: 10, max: 500, type: 'int' },
        jitter: { min: 0, max: 150, type: 'int' },
        density: { min: 20, max: 120, type: 'int' },
      };
      // Pair params stored as [low, high] arrays — generate two values,
      // sort so low ≤ high.
      const PAIRS = {
        scale: { min: 0.1, max: 3.0, type: 'float' },
        rotate: { min: -180, max: 180, type: 'float' },
        alpha: { min: 10, max: 100, type: 'int' },
      };
      const toFixedFloat = (v) => Number(v.toFixed(2));
      const cast = (v, type) => type === 'int' ? Math.floor(v) : toFixedFloat(v);

      // If the user marked any params as 'K' (kinetic), evolve ONLY those.
      // Otherwise fall back to the legacy behaviour: evolve everything that
      // isn't locked. This way AUTO-EVOLVE works out of the box and tightens
      // automatically as the user opts specific params in.
      const kineticKeys = Object.keys(state.kineticParams || {}).filter(k => state.kineticParams[k]);
      const useKineticSubset = kineticKeys.length > 0;
      const shouldEvolve = (key) => {
        if (state.lockedParams[key]) return false;
        if (useKineticSubset) return state.kineticParams[key] === true;
        return true;
      };

      for (const [key, conf] of Object.entries(SCALARS)) {
        if (!shouldEvolve(key)) continue;
        const v = Math.random() * (conf.max - conf.min) + conf.min;
        newLayout[key] = cast(v, conf.type);
      }
      for (const [key, conf] of Object.entries(PAIRS)) {
        if (!shouldEvolve(key)) continue;
        const a = Math.random() * (conf.max - conf.min) + conf.min;
        const b = Math.random() * (conf.max - conf.min) + conf.min;
        const lo = cast(Math.min(a, b), conf.type);
        const hi = cast(Math.max(a, b), conf.type);
        newLayout[key] = [lo, hi];
      }

      if (state.evolveTarget === 'all') {
        const pIds = ['praystation', 'v01d', 'hydra', 'dystopia', 'folktotem'];
        const randomPalette = pIds[Math.floor(Math.random() * pIds.length)];
        return { seed: (state.seed + 1) % 1000000, paletteId: randomPalette, layoutParams: newLayout, lastEvolveTs: ts };
      }
      return { layoutParams: newLayout, lastEvolveTs: ts };
    }
    return {};
  }),

  addFavorite: (fav) => set((state) => {
    // Always attach a full state snapshot so keyframe playback can tween
    // effect-state too, not just seed/layout/palette. Legacy callers that
    // pass only `{ seed, config }` still work — we just enrich.
    const enriched = fav.snapshot
      ? fav
      : { ...fav, snapshot: snapshotFromStateInternal(state) };
    return { favorites: [...state.favorites, enriched] };
  }),
  removeFavorite: (index) => set((state) => ({ favorites: state.favorites.filter((_, i) => i !== index) })),
  recallFavorite: (fav) => set(() => {
    // Prefer the full snapshot when present; fall back to the legacy shape.
    if (fav.snapshot) {
      const next = {};
      for (const k of Object.keys(fav.snapshot)) {
        if (RESTORE_ALLOWED_KEYS.has(k) && fav.snapshot[k] !== undefined) {
          next[k] = fav.snapshot[k];
        }
      }
      return next;
    }
    return {
      seed: fav.seed,
      ...(fav.config?.layout ? { layoutParams: fav.config.layout } : {}),
      ...(fav.config?.palette?.id ? { paletteId: fav.config.palette.id } : {})
    };
  }),

  // Keyframe playback (Item 15)
  keyframePlay: false,
  keyframeDuration: 3000, // ms per transition
  setKeyframePlay: (on) => set({ keyframePlay: on }),
  setKeyframeDuration: (ms) => set({ keyframeDuration: ms }),
});

const createLayerSlice = (set, get) => ({
  layers: [], // [{ id, name, visible, opacity, blendMode, snapshot }]
  activeLayerId: null, // when set, the global state IS the live edit of this layer

  addLayer: (snapshot) => set((state) => {
    const id = `layer-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
    const name = `Layer ${state.layers.length + 1}`;
    return { layers: [...state.layers, { id, name, visible: true, opacity: 1, blendMode: 'normal', snapshot }] };
  }),
  removeLayer: (id) => set((state) => ({
    layers: state.layers.filter(l => l.id !== id),
    activeLayerId: state.activeLayerId === id ? null : state.activeLayerId,
  })),
  toggleLayer: (id) => set((state) => ({
    layers: state.layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l)
  })),
  setLayerOpacity: (id, opacity) => set((state) => ({
    layers: state.layers.map(l => l.id === id ? { ...l, opacity } : l)
  })),
  setLayerBlend: (id, blendMode) => set((state) => ({
    layers: state.layers.map(l => l.id === id ? { ...l, blendMode } : l)
  })),
  setLayerName: (id, name) => set((state) => ({
    layers: state.layers.map(l => l.id === id ? { ...l, name } : l)
  })),
  moveLayer: (id, direction) => set((state) => {
    const i = state.layers.findIndex(l => l.id === id);
    if (i < 0) return {};
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= state.layers.length) return {};
    const next = state.layers.slice();
    [next[i], next[j]] = [next[j], next[i]];
    return { layers: next };
  }),

  /**
   * Activate a layer for live editing. The current global composition is
   * saved into the currently-active layer (if any) first, then the target
   * layer's snapshot is loaded into the global state. Panels keep editing
   * "global state" — but it now represents this layer.
   */
  activateLayer: (id) => set((state) => {
    let layers = state.layers;
    // 1. Save current global state into the currently-active layer.
    if (state.activeLayerId) {
      const snap = snapshotFromStateInternal(state);
      layers = layers.map(l => l.id === state.activeLayerId ? { ...l, snapshot: snap } : l);
    }
    // 2. Find target.
    const target = layers.find(l => l.id === id);
    if (!target) return {};
    // 3. Load its snapshot into global; mark it active.
    return { ...target.snapshot, layers, activeLayerId: id };
  }),

  /**
   * Save the live state back into the active layer and return to a fresh
   * top-level edit context (active layer becomes a frozen snapshot again).
   */
  deactivateLayer: () => set((state) => {
    if (!state.activeLayerId) return {};
    const snap = snapshotFromStateInternal(state);
    const layers = state.layers.map(l => l.id === state.activeLayerId ? { ...l, snapshot: snap } : l);
    return { layers, activeLayerId: null };
  }),
});

const createWebcamSlice = (set, get) => ({
  webcamEnabled: false,
  motionEnergy: 0, // 0..1 normalized webcam motion energy

  setWebcamEnabled: (enabled) => set({ webcamEnabled: enabled }),
  setMotionEnergy: (v) => set({ motionEnergy: v }),
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

const createEffectSlice = (set, get) => ({
  // Blends & Compositing
  blendMode: 'normal', // 'normal', 'multiply', 'screen', 'overlay'
  blendStrength: 1.0,

  // Echo & Trails
  echoEnabled: false,
  echoCount: 3,
  echoDecay: 0.5,
  trailEnabled: false,
  trailLength: 10,

  // Feedback Loops
  feedbackEnabled: false,
  feedbackStrength: 0.1,
  feedbackDepth: 5,

  // Particle System & Motion
  particlesEnabled: false,
  particleCount: 100,
  particleSpeed: 1.0,
  motionEnabled: false,
  motionType: 'flow', // 'flow', 'swarm', 'orbit'

  // Blast Radius
  blastRadiusEnabled: false,
  blastRadius: 50,
  blastForce: 1.0,

  // Color Controls
  colorStrategy: 'band', // 'band', 'zone', 'split'
  colorHarmony: 'none', // 'complementary', 'triadic', 'analogous'

  setBlendMode: (mode) => set({ blendMode: mode }),
  setBlendStrength: (strength) => set({ blendStrength: strength }),
  setEchoEnabled: (enabled) => set({ echoEnabled: enabled }),
  setEchoCount: (count) => set({ echoCount: count }),
  setEchoDecay: (decay) => set({ echoDecay: decay }),
  setTrailEnabled: (enabled) => set({ trailEnabled: enabled }),
  setTrailLength: (length) => set({ trailLength: length }),
  setFeedbackEnabled: (enabled) => set({ feedbackEnabled: enabled }),
  setFeedbackStrength: (strength) => set({ feedbackStrength: strength }),
  setFeedbackDepth: (depth) => set({ feedbackDepth: depth }),
  setParticlesEnabled: (enabled) => set({ particlesEnabled: enabled }),
  setParticleCount: (count) => set({ particleCount: count }),
  setParticleSpeed: (speed) => set({ particleSpeed: speed }),
  setMotionEnabled: (enabled) => set({ motionEnabled: enabled }),
  setMotionType: (type) => set({ motionType: type }),
  setBlastRadiusEnabled: (enabled) => set({ blastRadiusEnabled: enabled }),
  setBlastRadius: (radius) => set({ blastRadius: radius }),
  setBlastForce: (force) => set({ blastForce: force }),
  setColorStrategy: (strategy) => set({ colorStrategy: strategy }),
  setColorHarmony: (harmony) => set({ colorHarmony: harmony }),
});

// ── Store ──────────────────────────────────────────────────────────────────

export const useStore = create((set, get) => ({
  ...createAudioSlice(set, get),
  ...createLayoutSlice(set, get),
  ...createGlobalSlice(set, get),
  ...createDavisSlice(set, get),
  ...createExportSlice(set, get),
  ...createEffectSlice(set, get),
  ...createLayerSlice(set, get),
  ...createWebcamSlice(set, get),
}));
