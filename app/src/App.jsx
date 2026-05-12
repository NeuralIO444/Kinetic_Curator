// App.jsx — thin layout shell
// All state lives in AppContext. Panels self-subscribe via useApp().
import { useCallback, useEffect, useRef } from 'react';
import { AppProvider } from './state/AppContext.jsx';
import { MasterBar } from './components/MasterBar.jsx';
import { CanvasPanel } from './panels/CanvasPanel.jsx';
import { LayoutPanel } from './panels/LayoutPanel.jsx';
import { AssetPoolPanel } from './panels/AssetPoolPanel.jsx';
import { OutputPanel } from './panels/OutputPanel.jsx';
import { StimulusPanel } from './panels/StimulusPanel.jsx';
import { DavisPanel } from './panels/DavisPanel.jsx';
import { EffectsPanel } from './panels/EffectsPanel.jsx';
import { LayersPanel } from './panels/LayersPanel.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { HotkeyOverlay } from './components/HotkeyOverlay.jsx';
import { useHotkeys } from './hooks/useHotkeys.js';
import { useAudioInput } from './hooks/useAudioInput.js';
import { useWebcam } from './hooks/useWebcam.js';
import { exportSnapshot } from './hooks/useMediaExport.js';
import { useApp } from './state/AppContext.jsx';
import { interpolateSnapshots, favoriteToSnapshot } from './engine/interpolate.js';
import * as A from './state/actions.js';

function AppInner() {
  const { dispatch, history, palette, svgRef } = useApp();
  const { state } = useApp(s => ({
    evolveMode: s.evolveMode,
    evolveSource: s.evolveSource,
    evolveInterval: s.evolveInterval,
    evolveTarget: s.evolveTarget,
    autoSnapshot: s.autoSnapshot,
    lastEvolveTs: s.lastEvolveTs,
    exportResolution: s.exportResolution,
    perfMode: s.perfMode,
    webcamEnabled: s.webcamEnabled,
    audioEnabled: s.audioEnabled,
    audioSource: s.audioSource,
    audioGain: s.audioGain,
    audioMonitor: s.audioMonitor,
    running: s.running,
    seed: s.seed,
    layoutParams: s.layoutParams,
    enabled: s.enabledAssets,
    isFullscreen: s.isFullscreen,
    favorites: s.favorites,
    keyframePlay: s.keyframePlay,
    keyframeDuration: s.keyframeDuration,
    mode: s.mode,
  }));

  // Reference for stable callbacks
  const evolveRef = useRef({ mode: state.evolveMode, source: state.evolveSource });
  evolveRef.current = { mode: state.evolveMode, source: state.evolveSource };

  // Time-based evolve — gated on `running` so pause truly freezes.
  useEffect(() => {
    if (!state.running) return;
    if (!state.evolveMode || state.evolveSource !== 'time') return;
    const interval = setInterval(() => {
      dispatch({ type: A.TRIGGER_EVOLVE });
    }, state.evolveInterval);
    return () => clearInterval(interval);
  }, [state.running, state.evolveMode, state.evolveSource, state.evolveInterval, dispatch]);

  // Keyframe playback (Item 15): cycle through favorites, lerping numeric params
  // between consecutive entries. Also gated on `running`.
  useEffect(() => {
    if (!state.running) return;
    if (!state.keyframePlay) return;
    if (!state.favorites || state.favorites.length < 2) return;
    const dur = Math.max(500, state.keyframeDuration || 3000);
    const favs = state.favorites;
    let raf;
    const start = performance.now();

    const loop = (now) => {
      const elapsed = now - start;
      const segmentIdx = Math.floor(elapsed / dur);
      const t = (elapsed % dur) / dur;
      const fromIdx = segmentIdx % favs.length;
      const toIdx = (fromIdx + 1) % favs.length;
      const next = interpolateSnapshots(
        favoriteToSnapshot(favs[fromIdx]),
        favoriteToSnapshot(favs[toIdx]),
        t,
      );
      dispatch({ type: A.RESTORE_STATE, payload: next });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state.running, state.keyframePlay, state.keyframeDuration, state.favorites, dispatch]);

  // FPS monitor — rAF loop measuring real-time frame rate, updates store ~once/sec.
  useEffect(() => {
    let raf;
    let frames = 0;
    let last = performance.now();
    const loop = (now) => {
      frames++;
      if (now - last >= 1000) {
        const fps = Math.round((frames * 1000) / (now - last) * 10) / 10;
        dispatch({ type: A.SET_FPS, payload: fps });
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [dispatch]);

  // Auto-Snapshot (P10: Debounced to prevent browser crash)
  const lastSnapRef = useRef(0);
  useEffect(() => {
    const now = Date.now();
    if (state.lastEvolveTs && state.autoSnapshot && svgRef?.current) {
      if (now - lastSnapRef.current > 2000) {
        exportSnapshot(svgRef.current, state.exportResolution, state.seed.toString(16));
        lastSnapRef.current = now;
      }
    }
  }, [state.lastEvolveTs, state.autoSnapshot, state.exportResolution, state.seed, svgRef]);

  useHotkeys({
    's': () => dispatch({
      type: A.ADD_SNAPSHOT,
      snapshot: {
        seed: state.seed,
        format: 'PNG',
        resolution: state.exportResolution === 1 ? '1920×1080' : state.exportResolution === 2 ? '3840×2160' : '7680×4320',
        timestamp: new Date().toISOString().slice(11, 19),
        config: { layout: { ...state.layoutParams }, palette: { id: palette.id } },
      },
    }),
    'F': () => dispatch({
      type: A.ADD_FAVORITE,
      favorite: {
        seed: state.seed,
        timestamp: new Date().toISOString().slice(11, 19),
        config: { layout: { ...state.layoutParams }, palette: { id: palette.id } },
      },
    }),
    'f': () => dispatch({ type: A.TOGGLE_FULLSCREEN }),
    'e': () => dispatch({ type: A.SET_EVOLVE_MODE, payload: p => !p }),
    'n': () => dispatch({ type: A.BUMP_SEED }),
    'p': () => dispatch({ type: A.SET_PERF_MODE, payload: !state.perfMode }),
    ' ': () => dispatch({ type: A.SET_RUNNING, payload: !state.running }),
    // Undo / Redo (Cmd+Z / Cmd+Shift+Z)
    'z': (e) => { if (e.metaKey || e.ctrlKey) { e.shiftKey ? history.redo() : history.undo(); } },
  });

  // Audio input → stimulus state (B7: proper rAF lifecycle)
  const onAudioStimulus = useCallback(v => dispatch({ type: A.SET_AUDIO_STIMULUS, payload: v }), [dispatch]);
  const onAudioBands = useCallback(v => dispatch({ type: A.SET_AUDIO_BANDS, payload: v }), [dispatch]);
  const onBeat = useCallback(() => {
    dispatch({ type: A.SET_BEAT_PULSE, payload: p => Math.min(1, p + 0.5) });
    if (evolveRef.current.mode && evolveRef.current.source === 'beat') {
      dispatch({ type: A.TRIGGER_EVOLVE });
    }
  }, [dispatch]);
  useAudioInput({
    enabled: state.audioEnabled,
    source: state.audioSource,
    gain: state.audioGain,
    monitor: state.audioMonitor,
    onStimulus: onAudioStimulus,
    onBands: onAudioBands,
    onBeat
  });

  // Webcam → motion energy. High-motion frames trigger an evolve when
  // evolve source is 'motion'.
  const onMotion = useCallback((v) => {
    dispatch({ type: A.SET_MOTION_ENERGY, payload: v });
    if (evolveRef.current.mode && evolveRef.current.source === 'motion' && v > 0.25) {
      dispatch({ type: A.TRIGGER_EVOLVE });
    }
  }, [dispatch]);
  useWebcam({ enabled: state.webcamEnabled, onMotion });

  return (
    <div className={`app ${state.isFullscreen ? 'app-fullscreen' : ''}`}>
      <MasterBar />
      <HotkeyOverlay />
      <div className="grid">
        <div className="col">
          <ErrorBoundary>
            <CanvasPanel />
          </ErrorBoundary>
          {state.mode === 'live' && <StimulusPanel />}
          <DavisPanel />
        </div>
        <div className="col">
          <LayoutPanel />
          <EffectsPanel />
          <LayersPanel />
        </div>
        <div className="col">
          <AssetPoolPanel />
          <OutputPanel />
        </div>
      </div>
      <footer className="footer-bar">
        <span>KINETIC_CURATOR v0.5 · {Object.values(state.enabled).filter(Boolean).length} assets active</span>
        <span>{state.layoutParams.mode} · seed:{state.seed.toString(16)}</span>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
