import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KERNEL_VERSION } from './engine/kernel/version.js';
import { AppProvider } from './state/AppContext.jsx';
import { MasterBar } from './components/MasterBar.jsx';
import { PaletteStrip } from './components/PaletteStrip.jsx';
import { ModeStrip } from './components/ModeStrip.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { HotkeyOverlay } from './components/HotkeyOverlay.jsx';
import { FirstRunOverlay } from './components/FirstRunOverlay.jsx';
import { TourOverlay } from './components/TourOverlay.jsx';
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
import { useVoiceMixDriver } from './hooks/useVoiceMixDriver.js';
import { useProjectAutosave } from './hooks/useProjectAutosave.js';
import { captureStill } from './hooks/useMediaExport.js';
import { useApp } from './state/AppContext.jsx';
import { routeBeat } from './state/beatArbiter.js';
import { useStore } from './state/store.js';
import * as A from './state/actions.js';
import { Shell } from './composition/Shell.jsx';

const COLUMN_FRACTIONS = [0.62, 0.38];
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.9.0';
import { wireEventBus } from './composition/wireEventBus.js';
import { subscribeDispatch } from './composition/dispatchPipe.js';

function AppInner() {
  const { dispatch: rawDispatch, history, palette, glLoopRef } = useApp();
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
    seedOffsets: s.seedOffsets,
    layoutParams: s.layoutParams,
    enabled: s.enabledAssets,
    isFullscreen: s.isFullscreen,
    slowRender: s.slowRender,
    batchPaused: s.batchPaused,
    isRecording: s.isRecording,
    isRendering: s.isRendering,
  }));

  useFpsMeter(true);
  usePerformanceGovernor();
  useBeatDecay();
  useContinuousLife();
  usePhraseLoop();
  useMorphEvolve();
  useVoiceMixDriver();
  useProjectAutosave();

  const [showHotkeys, setShowHotkeys] = useState(false);
  const [helpTab, setHelpTab] = useState('help');
  const [tourOpen, setTourOpen] = useState(false);
  const evolveRef = useRef({ mode: state.evolveMode, source: state.evolveSource });
  useEffect(() => {
    evolveRef.current = { mode: state.evolveMode, source: state.evolveSource };
  }, [state.evolveMode, state.evolveSource]);

  useEffect(() => {
    // #107 §4: an automatic trigger, not a manual one — pauses under
    // slowRender so evolve stops adding param churn on top of a near-zero
    // frame rate. An explicit "evolve now" action is unaffected.
    // #107 §5: also pauses for the duration of a batch export (batchPaused) —
    // independent of slowRender, since a batch must hold regardless of the
    // momentary FPS reading.
    if (!state.evolveMode || state.evolveSource !== 'time' || state.slowRender || state.batchPaused) return;
    const interval = setInterval(() => piped({ type: A.TRIGGER_EVOLVE }), state.evolveInterval);
    return () => clearInterval(interval);
  }, [state.evolveMode, state.evolveSource, state.evolveInterval, state.slowRender, state.batchPaused, piped]);

  const lastSnapRef = useRef(0);
  useEffect(() => {
    const now = Date.now();
    if (state.lastEvolveTs && state.autoSnapshot && glLoopRef?.current) {
      if (now - lastSnapRef.current > 2000) {
        captureStill({
          loopRef: glLoopRef,
          resolution: state.exportResolution,
          seedStr: state.seed.toString(16),
        }).catch((e) => console.warn('[auto-snapshot] capture failed:', e));
        lastSnapRef.current = now;
      }
    }
  }, [state.lastEvolveTs, state.autoSnapshot, state.exportResolution, state.seed, glLoopRef]);

  useHotkeys({
    's': () => {
      captureStill({
        loopRef: glLoopRef,
        resolution: state.exportResolution,
        seedStr: state.seed.toString(16),
        onThumbnail: (thumb) => {
          piped({
            type: A.ADD_SNAPSHOT,
            snapshot: {
              seed: state.seed,
              seedOffsets: { ...(state.seedOffsets || {}) },
              format: 'PNG',
              resolution: state.exportResolution === 1 ? '1000x700@1x' : state.exportResolution === 2 ? '1000x700@2x' : '1000x700@4x',
              timestamp: new Date().toISOString().slice(11, 19),
              config: { layout: { ...state.layoutParams }, palette: { id: palette.id } },
              thumb,
            },
          });
        },
      }).catch((e) => console.error('[snap] hotkey capture failed:', e));
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
    // #107 §7: while recording or batch/final-rendering, N/E are debounced —
    // a seed bump or evolve toggle mid-encode changes what's being captured
    // partway through, and there is no clean way to fix that after the fact.
    'e': () => { if (!state.isRecording && !state.isRendering) piped({ type: A.SET_EVOLVE_MODE, payload: p => !p }); },
    'n': () => { if (!state.isRecording && !state.isRendering) piped({ type: A.BUMP_SEED }); },
    ' ': () => piped({ type: A.SET_RUNNING, payload: !state.running }),
    'z': (e) => { if (e.metaKey || e.ctrlKey) { e.shiftKey ? history.redo() : history.undo(); } },
    '?': () => { setHelpTab('help'); setShowHotkeys(s => !s); },
    // #107 §7: one panic key — always pause, always exit (never enter)
    // fullscreen, always close the hotkey sheet, regardless of current state.
    'Escape': () => {
      piped({ type: A.SET_RUNNING, payload: false });
      if (state.isFullscreen) piped({ type: A.TOGGLE_FULLSCREEN });
      setShowHotkeys(false);
    },
  });

  const onAudioStimulus = useCallback(v => piped({ type: A.SET_AUDIO_STIMULUS, payload: v }), [piped]);
  const onAudioBands = useCallback(v => piped({ type: A.SET_AUDIO_BANDS, payload: v }), [piped]);
  // #107 §5: honesty on mic denial — flip audioEnabled back off (rather than
  // silently doing nothing) and surface it so MasterBar can explain why.
  const onAudioDenied = useCallback((denied) => {
    piped({ type: A.SET_AUDIO_DENIED, payload: denied });
    if (denied) piped({ type: A.SET_AUDIO_ENABLED, payload: false });
  }, [piped]);
  const onBeat = useCallback(() => {
    // beatPulse still drives the readouts (phrase pip, meters); the actual
    // consumers are routed through the beat arbiter so one attack is one
    // ordered spike — phrase (the clock) resolves first, evolve (the gate)
    // fires on the post-phrase state. #104: beat collisions.
    piped({ type: A.SET_BEAT_PULSE, payload: p => Math.min(1, p + 0.55) });
    const s = useStore.getState();
    const { tickPhrase, fireEvolve } = routeBeat(s);
    if (tickPhrase) s.tickPhraseBeat();
    if (fireEvolve) s.triggerEvolve();
  }, [piped]);
  useAudioInput({
    enabled: state.audioEnabled,
    source: state.audioSource,
    gain: state.audioGain,
    monitor: state.audioMonitor,
    // #306: envelope ballistics — attack/decay + response curve shape the
    // mic envelope before any reactivity consumer sees it.
    ballistics: {
      attackMs: state.layoutParams.audioAttackMs ?? 25,
      releaseMs: state.layoutParams.audioDecayMs ?? 320,
      curve: state.layoutParams.audioResponse ?? 'exponential',
    },
    onStimulus: onAudioStimulus,
    onBands: onAudioBands,
    onBeat,
    onDenied: onAudioDenied
  });

  const { containerRef, gridTemplate, dividerProps } = useColumnResize(COLUMN_FRACTIONS, 300);

  const onPlayMe = useCallback(() => {
    piped({ type: A.SET_RUNNING, payload: true });
    piped({ type: A.SET_AUDIO_ENABLED, payload: true });
    piped({ type: A.SET_EVOLVE_MODE, payload: true });
  }, [piped]);

  return (
    <div className={`app ${state.isFullscreen ? 'app-fullscreen' : ''}`}>
      <HotkeyOverlay show={showHotkeys} onClose={() => setShowHotkeys(false)} initialTab={helpTab} key={helpTab} onTour={() => { setShowHotkeys(false); setTourOpen(true); }} />
      <FirstRunOverlay onPlay={onPlayMe} onTour={() => setTourOpen(true)} />
      <TourOverlay open={tourOpen} onClose={() => setTourOpen(false)} />
      <PaletteStrip />
      <ModeStrip />
      <ErrorBoundary critical>
        <Shell
          dispatchPipe={piped}
          containerRef={containerRef}
          gridTemplate={gridTemplate}
          dividerProps={dividerProps}
        />
      </ErrorBoundary>
      <MasterBar />
      <FavoritesTray />
      <footer className="footer-bar">
        <span>KINETIC_CURATOR v{APP_VERSION} · {KERNEL_VERSION} · build {import.meta.env.VITE_BUILD_ID || 'dev'}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {state.layoutParams.mode} · seed:{state.seed.toString(16)}
          <button type="button" className="micro-btn" title="Settings — no second prefs store"
            style={{ opacity: 0.45 }} onClick={() => { setHelpTab('settings'); setShowHotkeys(true); }}>⚙</button>
          <button type="button" className="micro-btn" title="Help"
            style={{ opacity: 0.45 }} onClick={() => { setHelpTab('help'); setShowHotkeys(true); }}>?</button>
        </span>
      </footer>
    </div>
  );
}

export default function App() {
  return <AppProvider><AppInner /></AppProvider>;
}
