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
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { HotkeyOverlay } from './components/HotkeyOverlay.jsx';
import { useHotkeys } from './hooks/useHotkeys.js';
import { useAudioInput } from './hooks/useAudioInput.js';
import { exportSnapshot } from './hooks/useMediaExport.js';
import { useApp } from './state/AppContext.jsx';
import * as A from './state/actions.js';

function AppInner() {
  const { state, dispatch, history, palette, svgRef } = useApp();

  // Reference for stable callbacks
  const evolveRef = useRef({ mode: state.evolveMode, source: state.evolveSource });
  evolveRef.current = { mode: state.evolveMode, source: state.evolveSource };

  // Time-based evolve
  useEffect(() => {
    if (!state.evolveMode || state.evolveSource !== 'time') return;
    const interval = setInterval(() => {
      dispatch({ type: A.TRIGGER_EVOLVE });
    }, state.evolveInterval);
    return () => clearInterval(interval);
  }, [state.evolveMode, state.evolveSource, state.evolveInterval, dispatch]);

  // Auto-Snapshot
  useEffect(() => {
    if (state.lastEvolveTs && state.autoSnapshot && svgRef?.current) {
      exportSnapshot(svgRef.current, state.exportResolution, state.seed.toString(16));
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

  return (
    <div className={`app ${state.isFullscreen ? 'app-fullscreen' : ''}`}>
      <MasterBar />
      <HotkeyOverlay />
      <div className="grid">
        <div className="col">
          <ErrorBoundary>
            <CanvasPanel />
          </ErrorBoundary>
          <StimulusPanel />
          <DavisPanel />
        </div>
        <div className="col">
          <LayoutPanel />
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
