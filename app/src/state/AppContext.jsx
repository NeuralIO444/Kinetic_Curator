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

// Stable sentinel returned to no-selector callers so useShallow never re-renders.
const EMPTY_STATE = Object.freeze({});
const emptySelector = () => EMPTY_STATE;

export function AppProvider({ children }) {
  const canvasRef = useRef(null);
  const svgRef = useRef(null);
  return <RefsContext.Provider value={{ canvasRef, svgRef }}>{children}</RefsContext.Provider>;
}

/**
 * useApp Hook
 *
 * IMPORTANT: pass a selector. Calling `useApp()` with no argument now returns
 * `state = {}` and subscribes to nothing — this is intentional so that
 * panels which only need `dispatch` / `palette` / refs don't wake on every
 * unrelated store mutation. To read state, do `useApp(s => ({ ... }))`.
 */
export function useApp(selector) {
  const refs = useContext(RefsContext);
  // Always subscribe to paletteId so the derived `palette` stays reactive.
  const paletteId = useStore(s => s.paletteId);
  // Selector path: subscribe shallow to the projection.
  // No-selector path: return frozen empty object (no subscription churn).
  const state = useStore(useShallow(selector || emptySelector));

  const dispatch = useCallback((action) => {
    const store = useStore.getState();
    const { type, payload } = action;

    switch (type) {
      // ── Playback ─────────────────────────────────────────
      case A.SET_RUNNING: return store.setRunning(payload);
      case A.SET_FPS: return store.setFps(payload);
      case A.SET_SEED: return store.setSeed(payload);
      case A.BUMP_SEED: return store.bumpSeed();

      // ── Palette + layout ─────────────────────────────────
      case A.SET_PALETTE_ID: return store.setPaletteId(payload);
      case A.SET_LAYOUT_PARAM: return store.setLayoutParam(action.key, action.value);
      case A.SET_LAYOUT_PARAMS: return store.setLayoutParams(payload);
      case A.APPLY_PRESET: return store.applyPreset(action.preset);
      case A.TOGGLE_PARAM_LOCK: return store.toggleParamLock(action.key);
      case A.TOGGLE_PARAM_KINETIC: return store.toggleParamKinetic(action.key);
      case A.RANDOMIZE_PARAM: return store.randomizeParam(action.key);
      case A.RANDOMIZE_UNLOCKED: return store.randomizeUnlocked();

      // ── Asset pool ───────────────────────────────────────
      case A.TOGGLE_ASSET: return store.toggleAsset(action.id);
      case A.TOGGLE_ALL_ASSETS: return store.toggleAllAssets(payload);
      case A.SET_SEARCH: return store.setSearch(payload);
      case A.SET_CAT_FILTER: return store.setCatFilter(payload);
      case A.SET_POOL_VIEW: return store.setPoolView(payload);

      // ── Stimulus ─────────────────────────────────────────
      case A.SET_WEBCAM_ENABLED: return store.setWebcamEnabled(payload);
      case A.SET_AUDIO_ENABLED: return store.setAudioEnabled(payload);
      case A.SET_AUDIO_GAIN: return store.setAudioGain(payload);
      case A.SET_AUDIO_SOURCE: return store.setAudioSource(payload);
      case A.SET_AUDIO_MONITOR: return store.setAudioMonitor(payload);
      case A.SET_AUDIO_STIMULUS: return store.setAudioStimulus(payload);
      case A.SET_BEAT_PULSE: return store.setBeatPulse(payload);
      case A.SET_AUDIO_BANDS: return store.setAudioBands(payload);
      case A.SET_MOTION_ENERGY: return store.setMotionEnergy(payload);

      // ── Davis evolve ─────────────────────────────────────
      case A.SET_EVOLVE_MODE: return store.setEvolveMode(payload);
      case A.SET_EVOLVE_SOURCE: return store.setEvolveSource(payload);
      case A.SET_EVOLVE_TARGET: return store.setEvolveTarget(payload);
      case A.SET_EVOLVE_INTERVAL: return store.setEvolveInterval(payload);
      case A.SET_AUTO_SNAPSHOT: return store.setAutoSnapshot(payload);
      case A.TRIGGER_EVOLVE: return store.triggerEvolve();

      // ── Display + global ─────────────────────────────────
      case A.TOGGLE_FULLSCREEN: return store.toggleFullscreen();
      case A.SET_MOTION_SMOOTHING: return store.setMotionSmoothing(payload);
      case A.SET_RENDERING_MODE: return store.setRenderingMode(payload);
      case A.SET_PERF_MODE: return store.setPerfMode(payload);
      case A.SET_MODE: return store.setMode(payload);

      // ── Snapshots / favorites / keyframes ────────────────
      case A.ADD_SNAPSHOT: return store.addSnapshot(action.snapshot);
      case A.REMOVE_SNAPSHOT: return store.removeSnapshot(action.index);
      case A.CLEAR_SNAPSHOTS: return store.clearSnapshots();
      case A.SET_EXPORT_RESOLUTION: return store.setExportResolution(payload);
      case A.SET_IS_RECORDING: return store.setIsRecording(payload);
      case A.ADD_FAVORITE: return store.addFavorite(action.favorite);
      case A.REMOVE_FAVORITE: return store.removeFavorite(action.index);
      case A.RECALL_FAVORITE: return store.recallFavorite(action.favorite);
      case A.SET_KEYFRAME_PLAY: return store.setKeyframePlay(payload);
      case A.SET_KEYFRAME_DURATION: return store.setKeyframeDuration(payload);
      case A.RESTORE_STATE: return store.restoreState(payload);

      // ── Layers ───────────────────────────────────────────
      case A.ADD_LAYER: return store.addLayer(payload);
      case A.REMOVE_LAYER: return store.removeLayer(action.id);
      case A.TOGGLE_LAYER: return store.toggleLayer(action.id);
      case A.SET_LAYER_OPACITY: return store.setLayerOpacity(action.id, action.opacity);
      case A.SET_LAYER_BLEND: return store.setLayerBlend(action.id, action.blendMode);
      case A.SET_LAYER_NAME: return store.setLayerName(action.id, action.name);
      case A.MOVE_LAYER: return store.moveLayer(action.id, action.direction);
      case A.ACTIVATE_LAYER: return store.activateLayer(action.id);
      case A.DEACTIVATE_LAYER: return store.deactivateLayer();

      // ── Effects ──────────────────────────────────────────
      case A.SET_BLEND_MODE: return store.setBlendMode(payload);
      case A.SET_BLEND_STRENGTH: return store.setBlendStrength(payload);
      case A.SET_ECHO_ENABLED: return store.setEchoEnabled(payload);
      case A.SET_ECHO_COUNT: return store.setEchoCount(payload);
      case A.SET_ECHO_DECAY: return store.setEchoDecay(payload);
      case A.SET_TRAIL_ENABLED: return store.setTrailEnabled(payload);
      case A.SET_TRAIL_LENGTH: return store.setTrailLength(payload);
      case A.SET_FEEDBACK_ENABLED: return store.setFeedbackEnabled(payload);
      case A.SET_FEEDBACK_STRENGTH: return store.setFeedbackStrength(payload);
      case A.SET_FEEDBACK_DEPTH: return store.setFeedbackDepth(payload);
      case A.SET_PARTICLES_ENABLED: return store.setParticlesEnabled(payload);
      case A.SET_PARTICLE_COUNT: return store.setParticleCount(payload);
      case A.SET_PARTICLE_SPEED: return store.setParticleSpeed(payload);
      case A.SET_MOTION_ENABLED: return store.setMotionEnabled(payload);
      case A.SET_MOTION_TYPE: return store.setMotionType(payload);
      case A.SET_BLAST_RADIUS_ENABLED: return store.setBlastRadiusEnabled(payload);
      case A.SET_BLAST_RADIUS: return store.setBlastRadius(payload);
      case A.SET_BLAST_FORCE: return store.setBlastForce(payload);
      case A.SET_COLOR_STRATEGY: return store.setColorStrategy(payload);
      case A.SET_COLOR_HARMONY: return store.setColorHarmony(payload);

      default: console.warn('Unhandled action:', type);
    }
  }, []);

  const palette = PALETTES.find(p => p.id === paletteId) || PALETTES[0];

  return { state, dispatch, history: mockHistory, palette, palettes: PALETTES, assets: ASSETS, ...refs };
}
