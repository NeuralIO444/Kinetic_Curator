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
import { useMetroPulse } from './hooks/useMetroPulse.js';
import { say } from './curator/whisper.js'; // #1139
import { initWhisperTriggers } from './curator/whisperTriggers.js'; // #1139
import { initDirectorBeat, setPresenceProvider } from './curator/director.js'; // #1145
import { initPhase } from './curator/phase.js'; // #1144: the instrument knows the phase
import { initStress, DEBUG_STRESS, getStressState } from './curator/stressLive.js'; // #1354: stress and bands (nothing consumes them yet)
import { StressReadout } from './curator/StressReadout.jsx'; // #1354: ?debug=stress only
import { observeDish, getDishPressure } from './curator/dishPressure.js'; // #1355: dish pressure around the pins
import { observeFormation, getFormedPins, getLimbPairs, getPinTraits, setRoomProvider, noteKeep } from './curator/formationLive.js';
import { observeDishDensity } from './curator/dishDensityLive.js'; // #1412: the contact-density field, onto the bus
import { roomWidthFromCodes } from './curator/roomWidth.js'; // #1145 step 3: the room tightens or loosens Davis's shifts
import { resolveLoisFace } from './curator/loisFace.js';
import { resolveDavisState } from './curator/davisState.js'; // #1355 step 3: when a spore would form
import { startMind, replayMindFrame, endMindReplay } from './curator/mindLive.js'; // #1462: Mind 1
import { startMindFaces, resetMindFaces } from './curator/mindFace.js'; // #1462: a request blends a face state in and out
import { DEBUG_MIND, demoModel } from './curator/mindDemo.js'; // #1462: ?debug=mind stand-in backend for review
import { desktopAppleModel } from './curator/mindApple.js'; // #1463: Apple Intelligence via the desktop helper
import { createPresenceDriver } from './curator/mindPresenceLive.js'; // #1464: Mind 3 — engagement tiers + zodiac
import { startGhost, resetGhost } from './curator/mindGhost.js'; // #1464: the third's presence on the Stimuli meter
import { startMindRoom, getMindRoom } from './curator/mindRoom.js'; // #1145: the Director's room, as the minds hear it
import { isPlaybackActive, setPlaybackFrameTap, subscribePlayback } from './gl/playback.mjs'; // #1462: a take's decisions replay
import { createSet } from './curator/setLive.js'; // #1475: her set
import { setSourceFeed } from './gl/sourceFeed.mjs';
import { startPace } from './curator/paceLive.js'; // #1460: the tempo ease
import { startTrio } from './curator/trioLive.js'; // #1483: Davis conducts the audio show
import { observeAudio } from './composition/audioLive.js'; // #1459: audio events on the bus
import { readMeterBandLevels, getAudioMeterTap } from './hooks/audioMeterTap.js';
import { startSpectrum } from './gl/spectrumLive.mjs'; // #1482 P2: the live spectrum
import { observeClock } from './composition/clockLive.js'; // #1458: bar / beat / phase on the loop clock
import { observeMotion } from './composition/motionLive.js'; // #1469: the frame's living-motion read, to the MOTION strip's tap
import { setResolveFrameTap, setFormedProvider, setLimbsProvider, setTraitsProvider } from './gl/resolveTap.mjs';
import { observeSpawn } from './curator/spawnLive.js'; // #1355: auto spawn finds each creature's home
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
import { loisActivity, LOIS_VIBE_DWELL_MS } from './curator/loisActivity.js';

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
    initDirectorBeat(useStore.subscribe); // #1145: the Director's beat input
    initPhase(useStore.subscribe); // #1144: explore / refine, from what the artist does
    // #1354 — stress and bands from honest counts (artist actions, rolls since the last keep). Computed only: no
    // persona reads the band yet; ?debug=stress shows it.
    // #1355 — dish pressure: the marks the resolver placed around the canvas pins, read from each resolved frame.
    // #1355 step 3 — the formation rule reads the same frame (one tap: dish pressure first, then formation).
    setResolveFrameTap((input, output) => {
      // #1458: musical time on the loop clock (one call a frame; bus events only on whole beats and bars)
      observeClock(input && input.loopTimeMs, useStore.getState().beatBpm);
      // #1459: discrete audio detections (onset, tempo, energy, silence) from the meter's band levels
      observeAudio(input && input.loopTimeMs, readMeterBandLevels(), useStore.getState().audioSource && useStore.getState().audioSource.type);
      // #1469: the MOTION readout's publisher (read-only tap; the strip polls it, nothing is routed)
      observeMotion();
      observeDish(input, output);
      observeFormation(input, output);
      observeDishDensity(); // #1412: the shared grid's density field, published on the bus for formation/telemetry readers
      // #1355 AUTO SPAWN: each creature the artist asked for finds a home in the middle of the dish. The homes are
      // published as `dishPins`, which the resolver reads on the next frame (so a take records them).
      const st = useStore.getState();
      const homes = observeSpawn(input, output, { count: st.creatureCount, formed: getFormedPins(), band: getStressState().band });
      if (homes) st.setDishPins(homes);
    });
    setFormedProvider(getFormedPins); // #1355 step 4: the moth grows on pins the rule has formed
    setLimbsProvider(getLimbPairs); // #1355 step 5: a crowded place grows its second pair of wings
    setTraitsProvider(getPinTraits); // #1356 step 2: Davis's birth shifts
    // #1145 step 3 — the room, read from the honest feed at the moment a moth is born (never per frame)
    const roomNow = () => {
      const feed = loisActivity.snapshot();
      const face = resolveLoisFace(feed);
      const davis = resolveDavisState(feed);
      return { ...roomWidthFromCodes(face ? face.code : null, davis ? davis.code : null), keeps: useStore.getState().keeps };
    };
    setRoomProvider(roomNow);
    // #1460 — the pace: once a phrase it may ease the BEAT toward a confident audio tempo (her mark shows while it does)
    const stopPace = startPace({ getBpm: () => useStore.getState().beatBpm, context: roomNow });
    const roomCodes = () => { const f = loisActivity.snapshot(); const face = resolveLoisFace(f); const dv = resolveDavisState(f); return { lois: face ? face.code : null, davis: dv ? dv.code : null }; };
    // #1462 — Mind 1: once a bar each persona thinks about the room (Apple when available, rules otherwise):
    // decisions are telemetry and recorded in a take; rules never request a stage change. Muted while a take plays.
    const stopFaces = startMindFaces();
    const stopSpectrum = startSpectrum(getAudioMeterTap); // #1482 P2: steps once a frame, STIMULI open or not
    // #1463 — Apple Intelligence through the desktop helper is the default whenever it is available; until the
    // startup check answers (and always on the web) the rules answer, silently.
    let apple = null;
    desktopAppleModel().then((m) => { apple = m; }, () => { apple = null; });
    const appleModel = {
      name: 'apple',
      available: () => !!(apple && apple.available()),
      info: () => (apple ? apple.info() : null),
      ask: (...a) => (apple ? apple.ask(...a) : Promise.reject(new Error('unavailable'))),
    };
    // #1464 — Mind 3: hidden per-persona engagement (persisted on this machine), four tiers, the zodiac character and
    // one startup calendar reading. Works the same on Apple and on the rules.
    const stopGhost = startGhost();
    const stopRoom = startMindRoom(); // #1145: director:room → the personas' context (verdict + intensity band)
    const presence = createPresenceDriver({
      getSignals: () => {
        const f = loisActivity.snapshot();
        const st = useStore.getState();
        return {
          active: !f.away && !f.tabHidden, dwelling: f.dwellMs >= LOIS_VIBE_DWELL_MS, audio: !!st.audioEnabled,
          keeps: Array.isArray(st.keeps) ? st.keeps.length : 0, exports: f.exportCount,
          returns: (f.recallCount || 0) + (f.bloomReturnCount || 0), evolves: f.evolveCount,
        };
      },
    });
    setPresenceProvider(presence.third); // #1145 × Mind 3: her tier (earned, honest) scales her hand in the Director
    // #1483 — the trio's audio direction: while audio is live Davis may edit the route table, on the phrase boundary,
    // inside the clamps, never on a target the artist touched, and only at a tier that has earned it.
    const trio = startTrio({
      getRoutes: () => useStore.getState().audioRoutes,
      getTier: () => presence.contextFor('davis').tier,
      getBands: () => { const b = readMeterBandLevels(); return b ? Object.values(b) : null; },
      // LOIS's keep-rate read (Matt, 2026-10-14): keeping a lot lets a steady show ride; passes piling up make her call it flat sooner
      getActivity: () => { const f = loisActivity.snapshot(); return { keeps: f.keepsLast5m, rolls: f.rollsLast5m }; },
      isReplaying: isPlaybackActive,
      subscribe: (fn) => useStore.subscribe(fn),
    });
    const stopMind = startMind({
      presence,
      isReplaying: isPlaybackActive,
      model: DEBUG_MIND ? demoModel : appleModel,
      getSeed: () => useStore.getState().seed,
      getSnapshot: () => {
        const st = useStore.getState();
        return {
          layers: st.layers, enabledAssetCount: st.enabledAssets ? Object.values(st.enabledAssets).filter(Boolean).length : 0,
          paletteId: st.paletteId, room: roomCodes(), band: getStressState().band, keepsCount: Array.isArray(st.keeps) ? st.keeps.length : 0,
          bpm: st.beatBpm, audio: st.audioEnabled ? (st.audioSource && st.audioSource.type === 'file' ? 'file' : 'mic') : 'none',
          creatures: st.creatureCount, director: getMindRoom(), show: trio.showBlock(),
        };
      },
    });
    // #1462 — a take plays back its recorded decisions, frame by frame; no backend is asked
    setPlaybackFrameTap((frame, perf, o) => replayMindFrame(frame, perf && perf.mind, o));
    const offPlayback = subscribePlayback(() => { endMindReplay(); resetMindFaces(); resetGhost(); }); // a take starts or ends: fresh faces
    // #1475 — her set: after a while with nothing happening and no real audio, a beat from her library fades in and
    // plays silently into the band feed; the artist acting or real audio arriving makes it yield.
    const set = createSet({
      getBpm: () => useStore.getState().beatBpm,
      getIdleMs: () => loisActivity.snapshot().idleMs,
      getRealLevel: () => { const b = useStore.getState().audioEnabled ? readMeterBandLevels() : null; return b ? Object.values(b).reduce((x, v) => x + v, 0) / Object.keys(b).length : 0; },
      getRoom: roomCodes,
      getBand: () => getStressState().band,
      getSeed: () => useStore.getState().seed,
    });
    setSourceFeed(set.feed);
    const unKeep = loisActivity.onKeep(noteKeep); // #1356 step 5: remember the living moths' traits at a keep
    const stop = initStress({
      getCounts: loisActivity.pressureCounts,
      isRunning: () => useStore.getState().running,
      getDish: getDishPressure,
    });
    return () => { setResolveFrameTap(null); setFormedProvider(null); setLimbsProvider(null); setTraitsProvider(null); setRoomProvider(null); unKeep(); stopPace(); stopMind(); trio.stop(); stopFaces(); stopSpectrum(); stopGhost(); stopRoom(); setPresenceProvider(null); setPlaybackFrameTap(null); offPlayback(); setSourceFeed(null); set.reset(); stop(); };
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
    // #996: J keeps the plate without starring it. F (above) also keeps.
    // #1147: keep moved off K — K is KINETIC's tap (KineticButton.jsx).
    'j': () => piped({
      type: A.ADD_KEEP,
      keep: captureFavorite({ ...state, enabledAssets: state.enabled }, palette.id),
    }),
    // #1173: X passes on the plate — a deliberate "not this", one line in the
    // passes ledger the MLX loop reads as a negative. Nothing on screen changes.
    'x': () => piped({
      type: A.ADD_PASS,
      pass: captureFavorite({ ...state, enabledAssets: state.enabled }, palette.id),
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
  // #1144 — the BEAT dial's honest pulse: the dialed BPM as a real beatPulse when audio is not the beat (artist's switch, off by default)
  const beatMetro = useStore((s) => s.beatMetro);
  const beatBpm = useStore((s) => s.beatBpm);
  const running = useStore((s) => s.running);
  useMetroPulse({ beatMetro, audioEnabled: state.audioEnabled, running, beatBpm, onBeat });
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
      {DEBUG_STRESS && <StressReadout />}
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
