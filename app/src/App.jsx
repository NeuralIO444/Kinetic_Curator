import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KERNEL_VERSION } from './engine/kernel/version.js';
import { AppProvider } from './state/AppContext.jsx';
import { MasterBar } from './components/MasterBar.jsx';
import { PaletteStrip } from './components/PaletteStrip.jsx';
import { useMidi } from './hooks/useMidi.js';
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
import { usePhraseLoop } from './hooks/usePhraseLoop.js';
import { useMorphEvolve } from './hooks/useMorphEvolve.js';
import { useVoiceMixDriver } from './hooks/useVoiceMixDriver.js';
import { useProjectAutosave } from './hooks/useProjectAutosave.js';
import { useRollGuard } from './hooks/useRollGuard.js'; // #1107
import { useEarnedVoices } from './hooks/useEarnedVoices.js'; // #1153
import { useCuratorIPC } from './hooks/useCuratorIPC.js';
import { loopClock, loopIntervalTick } from './gl/loopClock.js';
import { captureStill } from './hooks/useMediaExport.js';
import { useApp } from './state/AppContext.jsx';
import { routeBeat } from './state/beatArbiter.js';
import { useStore } from './state/store.js';
import { say } from './curator/whisper.js'; // #1139
import { initWhisperTriggers } from './curator/whisperTriggers.js'; // #1139
import { captureFavorite } from './state/slices/davisSlice.js';
import * as A from './state/actions.js';
import { Shell } from './composition/Shell.jsx';
import { StageView } from './panels/pipeline/StageView.jsx';

// #607 — the stage window (`?stage=1`) renders ONLY the stage canvas: no
// store providers, no instrument chrome, no panels. The signal arrives over
// BroadcastChannel from the instrument window's mirror.
const STAGE_ONLY = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('stage') === '1';

const COLUMN_FRACTIONS = [0.62, 0.38];
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.9.0';
import { wireEventBus } from './composition/wireEventBus.js';
import { subscribeDispatch } from './composition/dispatchPipe.js';
import { loisActivity } from './curator/loisActivity.js';

function AppInner() {
  const { dispatch: rawDispatch, history, palette, glLoopRef } = useApp();
  const piped = useMemo(() => wireEventBus(rawDispatch), [rawDispatch]);

  useCuratorIPC();

  useEffect(() => subscribeDispatch((a) => {
    if (import.meta.env.DEV) console.debug('[pipe]', a.type);
  }), []);

  // LOIS honest feed (#948/#956): records user-behavior signals only —
  // no UI, no store writes, nothing visible. Surfaces come later.
  useEffect(() => {
    loisActivity.start({ store: useStore });
    return () => loisActivity.stop();
  }, []);

  // #1139 — whisper triggers (deniable transition lines). Budgets live in
  // whisper.js; the lines ship copy-only while the sway gate stays closed.
  useEffect(() => {
    initWhisperTriggers(useStore.getState, useStore.subscribe);
  }, []);

  const { state } = useApp(s => ({
    evolveMode: s.evolveMode,
    evolveSource: s.evolveSource,
    evolveInterval: s.evolveInterval,
    evolveTarget: s.evolveTarget,
    autoSnapshot: s.autoSnapshot,
    lastEvolveTs: s.lastEvolveTs,
    audioSidecar: s.audioSidecar, // #618
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
  usePhraseLoop();
  useMorphEvolve();
  useVoiceMixDriver();
  useEarnedVoices(); // #1153: a find (Davis's BLOOM) is shelved as an earned voice
  useRollGuard(glLoopRef); // before the autosave/boot effect, so the cold-open roll finds its listener
  useProjectAutosave();

  const [showHotkeys, setShowHotkeys] = useState(false);
  const [helpTab, setHelpTab] = useState('help');
  const [tourOpen, setTourOpen] = useState(false);
  const evolveRef = useRef({ mode: state.evolveMode, source: state.evolveSource });
  useEffect(() => {
    evolveRef.current = { mode: state.evolveMode, source: state.evolveSource };
  }, [state.evolveMode, state.evolveSource]);

  useEffect(() => {
    // #808 — the loop's presented-frame stamp, mirrored for slices/hooks.
    // liveLoop owns the counter; this effect just publishes it once per
    // frame so interval math never touches Date.now().
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const ms = glLoopRef?.current?.getLoopTimeMs?.();
      if (Number.isFinite(ms)) loopClock.ms = ms;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    // #107 §4: an automatic trigger, not a manual one — pauses under
    // slowRender so evolve stops adding param churn on top of a near-zero
    // frame rate. An explicit "evolve now" action is unaffected.
    // #107 §5: also pauses for the duration of a batch export (batchPaused) —
    // independent of slowRender, since a batch must hold regardless of the
    // momentary FPS reading.
    // #808: the interval is LOOP time, not wall time. The accumulator only
    // advances on presented frames, so a freeze (slowRender, pause, rejected
    // frame) holds the cadence; on thaw at most one evolve fires — the
    // accumulator never credits a catch-up burst.
    if (!state.evolveMode || state.evolveSource !== 'time' || state.slowRender || state.batchPaused) return;
    let raf = 0;
    let lastFire = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const loopTimeMs = glLoopRef?.current?.getLoopTimeMs?.();
      const step = loopIntervalTick(lastFire, loopTimeMs, state.evolveInterval);
      lastFire = step.lastFire;
      if (step.fire) piped({ type: A.TRIGGER_EVOLVE, payload: { loopTimeMs } });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.evolveMode, state.evolveSource, state.evolveInterval, state.slowRender, state.batchPaused, piped]);

  const lastSnapRef = useRef(0);
  useEffect(() => {
    // #808: throttle on loop time — lastEvolveTs is a loop-time stamp now,
    // so a wall-clock throttle would stack snapshots across a freeze/thaw.
    if (state.lastEvolveTs && state.autoSnapshot && glLoopRef?.current) {
      if (state.lastEvolveTs - lastSnapRef.current > 2000) {
        captureStill({
          loopRef: glLoopRef,
          resolution: state.exportResolution,
          seedStr: state.seed.toString(16),
        }).catch((e) => console.warn('[auto-snapshot] capture failed:', e));
        lastSnapRef.current = state.lastEvolveTs;
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
    // #719: same capture as the DAVIS ★ — this used to drop seedOffsets.
    'f': () => piped({
      type: A.ADD_FAVORITE,
      favorite: captureFavorite({ ...state, enabledAssets: state.enabled }, palette.id),
    }),
    // #996: K keeps the plate without starring it. F (above) also keeps.
    'k': () => piped({
      type: A.ADD_KEEP,
      keep: captureFavorite({ ...state, enabledAssets: state.enabled }, palette.id),
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
  // #1053: the chosen input went away. Say so, and shut audio off so the meter
  // reads idle (zero), not a frozen last value. AUDIO ON is the reconnect.
  const onAudioLost = useCallback((name) => {
    piped({ type: A.SET_AUDIO_LOST, payload: name });
    piped({ type: A.SET_AUDIO_ENABLED, payload: false });
    say('LOST'); // #1139 — "input's gone. i'm still listening."
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
    if (fireEvolve) s.triggerEvolve({ loopTimeMs: glLoopRef?.current?.getLoopTimeMs?.() });
  }, [piped]);
  useMidi(); // #617: Web MIDI engine, while MIDI is enabled in DAVIS
  useAudioInput({
    enabled: state.audioEnabled,
    source: state.audioSource,
    gain: state.audioGain,
    monitor: state.audioMonitor,
    sidecar: state.audioSidecar?.env ?? null, // #618: FILE source envelope sidecar
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
    onDenied: onAudioDenied,
    onLost: onAudioLost,
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
            style={{ opacity: 0.45 }} onClick={() => { setHelpTab('settings'); setShowHotkeys(true); }}>≡</button>
          <button type="button" className="micro-btn" title="Help"
            style={{ opacity: 0.45 }} onClick={() => { setHelpTab('help'); setShowHotkeys(true); }}>?</button>
        </span>
      </footer>
    </div>
  );
}

export default function App() {
  if (STAGE_ONLY) return <StageView />;
  return <AppProvider><AppInner /></AppProvider>;
}
