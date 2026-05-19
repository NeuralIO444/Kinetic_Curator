import { useCallback, useRef, createContext, useContext } from 'react';
import { useStore } from './store.js';
import { useShallow } from 'zustand/react/shallow';
import * as A from './actions.js';
import { PALETTES } from '../data/palettes.js';
import { ASSETS } from '../data/assets/index.js';

const RefsContext = createContext({});
const _emptySelector = () => null;

export function AppProvider({ children }) {
  const canvasRef = useRef(null);
  const svgRef = useRef(null);
  return <RefsContext.Provider value={{ canvasRef, svgRef }}>{children}</RefsContext.Provider>;
}

/**
 * useApp Hook
 * High-performance selective state subscription for Kinetic Curator.
 * @param {Function} selector - Selector function for state slices.
 */
export function useApp(selector) {
  const refs = useContext(RefsContext);
  
  // Use a separate subscription for paletteId to ensure 'palette' is always reactive
  const paletteId = useStore(s => s.paletteId);
  
  // Real reactive history subscriptions
  const undoStackLength = useStore(s => s.historyUndoStack ? s.historyUndoStack.length : 0);
  const redoStackLength = useStore(s => s.historyRedoStack ? s.historyRedoStack.length : 0);
  const undo = useStore(s => s.undo);
  const redo = useStore(s => s.redo);
  
  const history = {
    undo,
    redo,
    canUndo: undoStackLength > 0,
    canRedo: redoStackLength > 0,
    undoDepth: undoStackLength,
    redoDepth: redoStackLength,
  };
  
  // Main state subscription (selective)
  // BUG-02 fix: when no selector is provided, use a no-op selector to avoid
  // subscribing to the entire store (which caused 60fps re-renders from audio).
  const state = useStore(useShallow(selector || _emptySelector));

  const dispatch = useCallback((action) => {
    const store = useStore.getState();
    const { type, payload } = action;
    
    switch (type) {
      case A.SET_RUNNING: return store.setRunning(payload);
      case A.SET_FPS: return store.setFps(payload);
      case A.SET_SEED: return store.setSeed(payload);
      case A.BUMP_SEED: return store.bumpSeed();
      case A.SET_PALETTE_ID: return store.setPaletteId(payload);
      case A.SET_LAYOUT_PARAM: return store.setLayoutParam(action.key, action.value);
      case A.SET_LAYOUT_PARAMS: return store.setLayoutParams(payload);
      case A.APPLY_PRESET: return store.applyPreset(action.preset);
      case A.TOGGLE_PARAM_LOCK: return store.toggleParamLock(action.key);
      case A.RANDOMIZE_PARAM: return store.randomizeParam(action.key);
      case A.RANDOMIZE_UNLOCKED: return store.randomizeUnlocked();
      case A.TOGGLE_ASSET: return store.toggleAsset(action.id);
      case A.TOGGLE_ALL_ASSETS: return store.toggleAllAssets(payload);
      case A.SET_SEARCH: return store.setSearch(payload);
      case A.SET_CAT_FILTER: return store.setCatFilter(payload);
      case A.SET_POOL_VIEW: return store.setPoolView(payload);
      case A.SET_WEBCAM_ENABLED: return store.setWebcamEnabled(payload);
      case A.SET_AUDIO_ENABLED: return store.setAudioEnabled(payload);
      case A.SET_AUDIO_GAIN: return store.setAudioGain(payload);
      case A.SET_AUDIO_SOURCE: return store.setAudioSource(payload);
      case A.SET_AUDIO_MONITOR: return store.setAudioMonitor(payload);
      case A.SET_AUDIO_STIMULUS: return store.setAudioStimulus(payload);
      case A.SET_BEAT_PULSE: return store.setBeatPulse(payload);
      case A.SET_AUDIO_BANDS: return store.setAudioBands(payload);
      case A.SET_EVOLVE_MODE: return store.setEvolveMode(payload);
      case A.SET_EVOLVE_SOURCE: return store.setEvolveSource(payload);
      case A.SET_EVOLVE_TARGET: return store.setEvolveTarget(payload);
      case A.SET_EVOLVE_INTERVAL: return store.setEvolveInterval(payload);
      case A.SET_AUTO_SNAPSHOT: return store.setAutoSnapshot(payload);
      case A.TRIGGER_EVOLVE: return store.triggerEvolve();
      case A.SET_SLOW_RENDER: return store.setSlowRender(payload);
      case A.TOGGLE_FULLSCREEN: return store.toggleFullscreen();
      case A.ADD_SNAPSHOT: return store.addSnapshot(action.snapshot);
      case A.REMOVE_SNAPSHOT: return store.removeSnapshot(action.index);
      case A.CLEAR_SNAPSHOTS: return store.clearSnapshots();
      case A.SET_EXPORT_RESOLUTION: return store.setExportResolution(payload);
      case A.SET_IS_RECORDING: return store.setIsRecording(payload);
      case A.ADD_FAVORITE: return store.addFavorite(action.favorite);
      case A.REMOVE_FAVORITE: return store.removeFavorite(action.index);
      case A.RECALL_FAVORITE: return store.recallFavorite(action.favorite);
      case A.SET_MOTION_SMOOTHING: return store.setMotionSmoothing(payload);
      case A.STEP_CA_GRID: return store.stepCaGrid();
      case A.RESET_CA_GRID: return store.resetCaGrid();
      default: console.warn('Unhandled action:', type);
    }
  }, []);

  // Derived state (reactive)
  const palette = PALETTES.find(p => p.id === paletteId) || PALETTES[0];

  return { state, dispatch, history, palette, palettes: PALETTES, assets: ASSETS, ...refs };
}
