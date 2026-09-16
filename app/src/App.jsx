import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KERNEL_VERSION } from './engine/kernel/version.js';
import { AppProvider } from './state/AppContext.jsx';
import { MasterBar } from './components/MasterBar.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { HotkeyOverlay } from './components/HotkeyOverlay.jsx';
import { FirstRunOverlay } from './components/FirstRunOverlay.jsx';
import { FavoritesTray } from './components/FavoritesTray.jsx';
import { useHotkeys } from './hooks/useHotkeys.js';
import { useAudioInput } from './hooks/useAudioInput.js';
import { useColumnResize } from './hooks/useColumnResize.js';
import { useFpsMeter } from './hooks/useFpsMeter.js';
import { usePerformanceGovernor } from './hooks/usePerformanceGovernor.js';
import { useBeatDecay } from './hooks/useBeatDecay.js';
import { useContinuousLife } from './hooks/useContinuousLife.js';
import { usePhraseLoop } from './hooks/usePhraseLoop.js';
import { useMorphEvolve } from './hooks/useMorphEvolve.js';
import { useProjectAutosave } from './hooks/useProjectAutosave.js';
import { exportSnapshot } from './hooks/useMediaExport.js';
import { useApp } from './state/AppContext.jsx';
import * as A from './state/actions.js';
import { Shell } from './composition/Shell.jsx';

const COLUMN_FRACTIONS = [0.62, 0.38];
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.9.0';
import { wireEventBus } from './composition/wireEventBus.js';
import { subscribeDispatch } from './composition/dispatchPipe.js';

function AppInner() {
  const { dispatch: rawDispatch, history, palette, svgRef } = useApp();
  const piped = useMemo(() => wireEventBus(rawDispatch), [rawDispatch]);

  useEffect(() => subscribeDispatch((a) => {
    if (import.meta.env.DEV) console.debug('[pipe]', a.type);
  }), []);

  const { state } = useApp(s => ({
    evolveMode: s.evolveMode,
    evolveSource: s.evolveSource,
    evolveInterval: s.evolveInterval,
    evolveTarget: s.evolveTarget,
    autoSnapshot: s.autoSnapshot,
    lastEvolveTs: s.lastEvolveTs,
    exportResolution: s.exportResolution,
    audioEnabled: s.audioEnabled,
    audioSource: s.audioSource,
    audioGain: s.audioGain,
    audioMonitor: s.audioMonitor,
    running: s.running,
    seed: s.seed,
    layoutParams: s.layoutParams,
    enabled: s.enabledAssets,
    isFullscreen: s.isFullscreen,
  }));

  useFpsMeter(true);
  usePerformanceGovernor();
  useBeatDecay();
  useContinuousLife();
  usePhraseLoop();
  useMorphEvolve();
  useProjectAutosave();

  const [showHotkeys, setShowHotkeys] = useState(false);
  const evolveRef = useRef({ mode: state.evolveMode, source: state.evolveSource });
  useEffect(() => {
    evolveRef.current = { mode: state.evolveMode, source: state.evolveSource };
  }, [state.evolveMode, state.evolveSource]);

  useEffect(() => {
    if (!state.evolveMode || state.evolveSource !== 'time') return;
    const interval = setInterval(() => piped({ type: A.TRIGGER_EVOLVE }), state.evolveInterval);
    return () => clearInterval(interval);
  }, [state.evolveMode, state.evolveSource, state.evolveInterval, piped]);

  const lastSnapRef = useRef(0);
  useEffect(() => {
    const now = Date.now();
    if (state.lastEvolveTs && state.autoSnapshot && svgRef?.current) {
      if (now - lastSnapRef.current > 2000) {
        exportSnapshot(svgRef.current, state.exportResolution, state.seed.toString(16), palette.bg);
        lastSnapRef.current = now;
      }
    }
  }, [state.lastEvolveTs, state.autoSnapshot, state.exportResolution, state.seed, svgRef, palette.bg]);

  useHotkeys({
    's': () => {
      exportSnapshot(svgRef?.current, state.exportResolution, state.seed.toString(16), palette.bg, (thumb) => {
        piped({
          type: A.ADD_SNAPSHOT,
          snapshot: {
            seed: state.seed,
            format: 'PNG',
            resolution: state.exportResolution === 1 ? '1000x700@1x' : state.exportResolution === 2 ? '1000x700@2x' : '1000x700@4x',
            timestamp: new Date().toISOString().slice(11, 19),
            config: { layout: { ...state.layoutParams }, palette: { id: palette.id } },
            thumb,
          },
        });
      });
    },
    'f': () => piped({
      type: A.ADD_FAVORITE,
      favorite: {
        seed: state.seed,
        timestamp: new Date().toISOString().slice(11, 19),
        config: { layout: { ...state.layoutParams }, palette: { id: palette.id } },
      },
    }),
    'g': () => piped({ type: A.TOGGLE_FULLSCREEN }),
    'e': () => piped({ type: A.SET_EVOLVE_MODE, payload: p => !p }),
    'n': () => piped({ type: A.BUMP_SEED }),
    ' ': () => piped({ type: A.SET_RUNNING, payload: !state.running }),
    'z': (e) => { if (e.metaKey || e.ctrlKey) { e.shiftKey ? history.redo() : history.undo(); } },
    '?': () => setShowHotkeys(s => !s),
  });

  const onAudioStimulus = useCallback(v => piped({ type: A.SET_AUDIO_STIMULUS, payload: v }), [piped]);
  const onAudioBands = useCallback(v => piped({ type: A.SET_AUDIO_BANDS, payload: v }), [piped]);
  const onBeat = useCallback(() => {
    piped({ type: A.SET_BEAT_PULSE, payload: p => Math.min(1, p + 0.55) });
    if (evolveRef.current.mode && evolveRef.current.source === 'beat') {
      piped({ type: A.TRIGGER_EVOLVE });
    }
  }, [piped]);
  useAudioInput({
    enabled: state.audioEnabled,
    source: state.audioSource,
    gain: state.audioGain,
    monitor: state.audioMonitor,
    onStimulus: onAudioStimulus,
    onBands: onAudioBands,
    onBeat
  });

  const { containerRef, gridTemplate, dividerProps } = useColumnResize(COLUMN_FRACTIONS, 300);

  const onPlayMe = useCallback(() => {
    piped({ type: A.SET_RUNNING, payload: true });
    piped({ type: A.SET_AUDIO_ENABLED, payload: true });
    piped({ type: A.SET_EVOLVE_MODE, payload: true });
  }, [piped]);

  return (
    <div className={`app ${state.isFullscreen ? 'app-fullscreen' : ''}`}>
      <MasterBar />
      <HotkeyOverlay show={showHotkeys} onClose={() => setShowHotkeys(false)} />
      <FirstRunOverlay onPlay={onPlayMe} />
      <ErrorBoundary>
        <Shell
          dispatchPipe={piped}
          containerRef={containerRef}
          gridTemplate={gridTemplate}
          dividerProps={dividerProps}
        />
      </ErrorBoundary>
      <FavoritesTray />
      <footer className="footer-bar">
        <span>KINETIC_CURATOR v{APP_VERSION} · {KERNEL_VERSION}</span>
        <span>{state.layoutParams.mode} · seed:{state.seed.toString(16)}</span>
      </footer>
    </div>
  );
}

export default function App() {
  return <AppProvider><AppInner /></AppProvider>;
}
