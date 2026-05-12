// Central reducer — consolidates 30+ useState calls into one dispatch
// No file should mutate state directly — always dispatch(action)

import * as A from './actions.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

export function createInitialState(assets) {
  const enabled = {};
  assets.forEach(a => { enabled[a.id] = true; });

  return {
    // Playback
    running: true,
    fps: 58.4,
    seed: 0xa17e9b21,

    // Palette
    paletteId: 'praystation',

    // Layout
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS },

    // Asset pool
    enabled,
    search: '',
    catFilter: 'all',
    poolView: 'grid',

    // Stimulus
    webcamEnabled: false,
    audioEnabled: false,
    audioGain: 1.0,
    audioSource: { type: 'device', id: 'default' },
    audioMonitor: false,
    motionEnergy: 0,
    audioStimulus: 0,
    beatPulse: 0,
    audioBands: { bass: 0, mid: 0, treble: 0, rms: 0 },
    webcamAdjustments: { brightness: 100, contrast: 100, blur: 0 },
    webcamMirror: true,

    // Routes
    routes: [
      { target: 'count',         gain: 1.20 },
      { target: 'scale',         gain: 0.85 },
      { target: 'rotate',        gain: 1.00 },
      { target: '—',             gain: 1.00 },
      { target: 'palette.shift', gain: 0.60 },
      { target: 'mode.cycle',    gain: 0.50 },
    ],

    // Davis mode / Global
    evolveMode: false,
    evolveSource: 'time',
    evolveTarget: 'seed',
    evolveInterval: 2000,
    autoSnapshot: false,
    lastEvolveTs: 0,
    slowRender: false,
    isFullscreen: false,

    // Snapshots / favorites
    snapshots: [],
    favorites: [],
    exportResolution: 1,
    isRecording: false,

    // Parameter locks (Bundle 3)
    lockedParams: {},  // { count: true, scale: true, ... }
  };
}

export function reducer(state, action) {
  switch (action.type) {
    // ── Playback ───────────────────────────────────────────
    case A.SET_RUNNING:
      return { ...state, running: action.payload };
    case A.SET_FPS:
      return { ...state, fps: action.payload };
    case A.SET_SEED:
      return { ...state, seed: action.payload };
    case A.BUMP_SEED:
      return { ...state, seed: (state.seed ^ ((Math.random() * 0xffffffff) | 0)) >>> 0 };

    // ── Palette ────────────────────────────────────────────
    case A.SET_PALETTE_ID:
      return { ...state, paletteId: action.payload };

    // ── Layout ─────────────────────────────────────────────
    case A.SET_LAYOUT_PARAM:
      return { ...state, layoutParams: { ...state.layoutParams, [action.key]: action.value } };
    case A.SET_LAYOUT_PARAMS:
      return { ...state, layoutParams: { ...state.layoutParams, ...action.payload } };
    case A.APPLY_PRESET: {
      // Respect locked params: merge preset params but keep locked values
      const incoming = { ...action.preset.params, composition: action.preset.id };
      const merged = { ...state.layoutParams };
      for (const [k, v] of Object.entries(incoming)) {
        if (!state.lockedParams[k]) merged[k] = v;
      }
      return { ...state, layoutParams: merged };
    }

    // ── Asset pool ─────────────────────────────────────────
    case A.TOGGLE_ASSET:
      return { ...state, enabled: { ...state.enabled, [action.id]: !state.enabled[action.id] } };
    case A.SET_ENABLED:
      return { ...state, enabled: action.payload };
    case A.SET_SEARCH:
      return { ...state, search: action.payload };
    case A.SET_CAT_FILTER:
      return { ...state, catFilter: action.payload };
    case A.SET_POOL_VIEW:
      return { ...state, poolView: action.payload };

    // ── Stimulus ───────────────────────────────────────────
    case A.SET_WEBCAM_ENABLED:
      return { ...state, webcamEnabled: action.payload };
    case A.SET_AUDIO_ENABLED:
      return { ...state, audioEnabled: action.payload };
    case A.SET_AUDIO_GAIN:
      return { ...state, audioGain: action.payload };
    case A.SET_AUDIO_SOURCE:
      return { ...state, audioSource: action.payload };
    case A.SET_AUDIO_MONITOR:
      return { ...state, audioMonitor: action.payload };
    case A.SET_MOTION_ENERGY:
      return { ...state, motionEnergy: action.payload };
    case A.SET_AUDIO_STIMULUS:
      return { ...state, audioStimulus: action.payload };
    case A.SET_BEAT_PULSE:
      return { ...state, beatPulse: typeof action.payload === 'function'
        ? action.payload(state.beatPulse) : action.payload };
    case A.SET_AUDIO_BANDS:
      return { ...state, audioBands: action.payload };
    case A.SET_WEBCAM_ADJUST:
      return { ...state, webcamAdjustments: action.payload };
    case A.SET_WEBCAM_MIRROR:
      return { ...state, webcamMirror: action.payload };

    // ── Routes ─────────────────────────────────────────────
    case A.SET_ROUTE: {
      const routes = state.routes.slice();
      routes[action.index] = action.route;
      return { ...state, routes };
    }
    case A.SET_ROUTES:
      return { ...state, routes: action.payload };

    // ── Davis mode ─────────────────────────────────────────
    case A.SET_EVOLVE_MODE:
      return { ...state, evolveMode: typeof action.payload === 'function'
        ? action.payload(state.evolveMode) : action.payload };
    case A.SET_EVOLVE_SOURCE:
      return { ...state, evolveSource: action.payload };
    case A.SET_EVOLVE_TARGET:
      return { ...state, evolveTarget: action.payload };
    case A.SET_EVOLVE_INTERVAL:
      return { ...state, evolveInterval: action.payload };
    case A.SET_AUTO_SNAPSHOT:
      return { ...state, autoSnapshot: action.payload };
    case A.TRIGGER_EVOLVE: {
      const ts = Date.now();
      if (state.evolveTarget === 'seed') {
        return { ...state, seed: (state.seed + 1) % 1000000, lastEvolveTs: ts };
      }
      if (state.evolveTarget === 'palette') {
        const pIds = ['praystation', 'v01d', 'hydra', 'neonoir', 'totem'];
        const currentIdx = pIds.indexOf(state.paletteId);
        const nextIdx = (currentIdx + 1) % pIds.length;
        return { ...state, paletteId: pIds[nextIdx], lastEvolveTs: ts };
      }
      if (state.evolveTarget === 'layout') {
        // Randomize unlocked layout params
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
        return { ...state, layoutParams: newLayout, lastEvolveTs: ts };
      }
      if (state.evolveTarget === 'all') {
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
        const pIds = ['praystation', 'v01d', 'hydra', 'neonoir', 'totem'];
        const randomPalette = pIds[Math.floor(Math.random() * pIds.length)];
        return { 
          ...state, 
          seed: (state.seed + 1) % 1000000,
          paletteId: randomPalette,
          layoutParams: newLayout,
          lastEvolveTs: ts 
        };
      }
      return state;
    }
    case A.SET_SLOW_RENDER:
      return { ...state, slowRender: action.payload };
    case A.TOGGLE_FULLSCREEN:
      return { ...state, isFullscreen: typeof action.payload === 'function' ? action.payload(state.isFullscreen) : !state.isFullscreen };

    // ── Snapshots ──────────────────────────────────────────
    case A.ADD_SNAPSHOT:
      return { ...state, snapshots: [...state.snapshots, action.snapshot] };
    case A.REMOVE_SNAPSHOT:
      return { ...state, snapshots: state.snapshots.filter((_, i) => i !== action.index) };
    case A.CLEAR_SNAPSHOTS:
      return { ...state, snapshots: [] };
    case A.SET_EXPORT_RESOLUTION:
      return { ...state, exportResolution: action.payload };
    case A.SET_IS_RECORDING:
      return { ...state, isRecording: action.payload };

    // ── Favorites ──────────────────────────────────────────
    case A.ADD_FAVORITE:
      return { ...state, favorites: [...state.favorites, action.favorite] };
    case A.REMOVE_FAVORITE:
      return { ...state, favorites: state.favorites.filter((_, i) => i !== action.index) };
    case A.RECALL_FAVORITE: {
      const fav = action.favorite;
      const updates = { seed: fav.seed };
      if (fav.config?.layout) updates.layoutParams = fav.config.layout;
      if (fav.config?.palette?.id) updates.paletteId = fav.config.palette.id;
      return { ...state, ...updates };
    }

    // ── Parameter exploration (Bundle 3) ────────────────────
    case A.TOGGLE_PARAM_LOCK:
      return {
        ...state,
        lockedParams: {
          ...state.lockedParams,
          [action.key]: !state.lockedParams[action.key],
        },
      };

    case A.RANDOMIZE_PARAM: {
      const newParams = { ...state.layoutParams };
      newParams[action.key] = randomizeKey(action.key);
      return { ...state, layoutParams: newParams };
    }

    case A.RANDOMIZE_UNLOCKED: {
      const rp = { ...state.layoutParams };
      for (const key of RANDOMIZABLE_KEYS) {
        if (!state.lockedParams[key]) {
          rp[key] = randomizeKey(key);
        }
      }
      return { ...state, layoutParams: rp };
    }

    default:
      return state;
  }
}

// ── Randomization helpers ──────────────────────────────────

const RANDOMIZABLE_KEYS = ['count', 'scale', 'rotate', 'alpha', 'jitter', 'density', 'zTiers'];

function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
function randInt(lo, hi) { return Math.floor(rand(lo, hi + 1)); }

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
