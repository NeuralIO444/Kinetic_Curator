import { useCallback, useRef, createContext, useContext } from 'react';
import { useStore } from './store.js';
import { useShallow } from 'zustand/react/shallow';
import * as A from './actions.js';
import { PALETTES } from '../data/palettes.js';
import { ASSETS } from '../data/assets/index.js';

const mockHistory = {
  undo: () => {}, redo: () => {}, canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0,
};

const RefsContext = createContext({});

export function AppProvider({ children }) {
  const canvasRef = useRef(null);
  const svgRef = useRef(null);
  return <RefsContext.Provider value={{ canvasRef, svgRef }}>{children}</RefsContext.Provider>;
}

export function useApp(selector) {
  const refs = useContext(RefsContext);
  // Auto-wrap the selector in useShallow if provided, to prevent object-return re-renders
  const state = useStore(selector ? useShallow(selector) : (s => s));

  // Stable dispatch that reads fresh state to avoid stale closures
  const dispatch = useCallback((action) => {
    const store = useStore.getState();
    switch (action.type) {
      case A.SET_RUNNING: return store.setRunning(action.payload);
      case A.SET_FPS: return store.setFps(action.payload);
      case A.SET_SEED: return store.setSeed(action.payload);
      case A.BUMP_SEED: return store.bumpSeed();
      case A.SET_PALETTE_ID: return store.setPaletteId(action.payload);
      case A.SET_LAYOUT_PARAM: return store.setLayoutParam(action.key, action.value);
      case A.SET_LAYOUT_PARAMS: return store.setLayoutParams(action.payload);
      case A.APPLY_PRESET: return store.applyPreset(action.preset);
      case A.TOGGLE_PARAM_LOCK: return store.toggleParamLock(action.key);
      case A.RANDOMIZE_PARAM: return store.randomizeParam(action.key);
      case A.RANDOMIZE_UNLOCKED: return store.randomizeUnlocked();
      case A.TOGGLE_ASSET: return store.toggleAsset(action.id);
      case A.TOGGLE_ALL_ASSETS: return store.toggleAllAssets(action.payload);
      case A.SET_SEARCH: return store.setSearch(action.payload);
      case A.SET_CAT_FILTER: return store.setCatFilter(action.payload);
      case A.SET_POOL_VIEW: return store.setPoolView(action.payload);
      case A.SET_WEBCAM_ENABLED: return store.setWebcamEnabled(action.payload);
      case A.SET_AUDIO_ENABLED: return store.setAudioEnabled(action.payload);
      case A.SET_AUDIO_GAIN: return store.setAudioGain(action.payload);
      case A.SET_AUDIO_SOURCE: return store.setAudioSource(action.payload);
      case A.SET_AUDIO_MONITOR: return store.setAudioMonitor(action.payload);
      case A.SET_AUDIO_STIMULUS: return store.setAudioStimulus(action.payload);
      case A.SET_BEAT_PULSE: return store.setBeatPulse(action.payload);
      case A.SET_AUDIO_BANDS: return store.setAudioBands(action.payload);
      case A.SET_EVOLVE_MODE: return store.setEvolveMode(action.payload);
      case A.SET_EVOLVE_SOURCE: return store.setEvolveSource(action.payload);
      case A.SET_EVOLVE_TARGET: return store.setEvolveTarget(action.payload);
      case A.SET_EVOLVE_INTERVAL: return store.setEvolveInterval(action.payload);
      case A.SET_AUTO_SNAPSHOT: return store.setAutoSnapshot(action.payload);
      case A.TRIGGER_EVOLVE: return store.triggerEvolve();
      case A.SET_SLOW_RENDER: return store.setSlowRender(action.payload);
      case A.TOGGLE_FULLSCREEN: return store.toggleFullscreen();
      case A.ADD_SNAPSHOT: return store.addSnapshot(action.snapshot);
      case A.REMOVE_SNAPSHOT: return store.removeSnapshot(action.index);
      case A.CLEAR_SNAPSHOTS: return store.clearSnapshots();
      case A.SET_EXPORT_RESOLUTION: return store.setExportResolution(action.payload);
      case A.SET_IS_RECORDING: return store.setIsRecording(action.payload);
      case A.ADD_FAVORITE: return store.addFavorite(action.favorite);
      case A.REMOVE_FAVORITE: return store.removeFavorite(action.index);
      case A.RECALL_FAVORITE: return store.recallFavorite(action.favorite);
      default: console.warn('Unhandled action in Zustand migration:', action.type);
    }
  }, []);

  const palette = PALETTES.find(p => p.id === state.paletteId) || PALETTES[0];

  return { state, dispatch, history: mockHistory, palette, palettes: PALETTES, assets: ASSETS, ...refs };
}
