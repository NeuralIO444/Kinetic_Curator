import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KERNEL_VERSION } from './engine/kernel/version.js';
import { AppProvider } from './state/AppContext.jsx';
import { MasterBar } from './components/MasterBar.jsx';
import { PaletteStrip } from './components/PaletteStrip.jsx';
import { useMidi } from './hooks/useMidi.js';
import { ModeStrip } from './components/ModeStrip.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { HotkeyOverlay } from './components/HotkeyOverlay.jsx';
import { BackendIndicator } from './components/BackendIndicator.jsx'; // #2078: footer backend indicator (O / A / R)
import { FirstRunOverlay } from './components/FirstRunOverlay.jsx';
import { ProjectWizardOverlay } from './components/ProjectWizardOverlay.jsx';
import { TourOverlay } from './components/TourOverlay.jsx';
import { FavoritesTray } from './components/FavoritesTray.jsx';
import { useHotkeys } from './hooks/useHotkeys.js';
import { useAudioInput } from './hooks/useAudioInput.js';
import { useColumnResize } from './hooks/useColumnResize.js';
import { useFpsMeter } from './hooks/useFpsMeter.js';
import { usePerformanceGovernor } from './hooks/usePerformanceGovernor.js';
import { useWatchdogSpaceResume } from './hooks/useWatchdogSpaceResume.js'; // #2481: Space = global resume while PERF PAUSED
import { useBeatDecay } from './hooks/useBeatDecay.js';
import { usePhraseLoop } from './hooks/usePhraseLoop.js';
import { useMorphEvolve } from './hooks/useMorphEvolve.js';
import { useVoiceMixDriver } from './hooks/useVoiceMixDriver.js';
import { useProjectAutosave } from './hooks/useProjectAutosave.js';
import { useCultureWorld } from './hooks/useCultureWorld.js';
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
import { initDirectorBeat, setPresenceProvider, conductHeat, bandTimingStep } from './curator/director.js'; // #1145; #2389: the band's timing host
import { initPhase } from './curator/phase.js'; // #1144: the instrument knows the phase
import { initStress, DEBUG_STRESS, getStressState } from './curator/stressLive.js'; // #1354: stress and bands (the creature's posture consumes them since S5)
import { StressReadout } from './curator/StressReadout.jsx'; // #1354: ?debug=stress only
import { AgeReadout } from './curator/AgeReadout.jsx'; // #1805: ?debug=age only
import { DEBUG_AGE } from './gl/ageLive.mjs';
import { TrailGridReadout } from './curator/TrailGridReadout.jsx'; // #1808 slice 1: ?debug=trailgrid only
import { DEBUG_TRAILGRID } from './gl/trailGridLive.mjs';
import { TrailReadout } from './curator/TrailReadout.jsx'; // #1807: ?debug=stats only
import { DEBUG_STATS, requestStats, setStatsGovernor } from './gl/statsLive.mjs'; // #1807: the buffer statistics' wire
import { getWetModeLine } from './gl/wetLive.mjs'; // #1841: the wet field's shed-line wire
import { createTrailSampler } from './curator/trailStats.js'; // #1807: the show block's trail reader
import { createPressureGovernor } from './curator/statsGovernor.mjs'; // #1807: saturation pressure, data-only in v1
import { observeDish, getDishPressure } from './curator/dishPressure.js'; // #1355: dish pressure around the pins
import { setRoomProvider, noteKeep } from './curator/formationLive.js'; // #1694 slice 1: the facade over the resolver-owned spawn state (the room a birth reads; the keeps a birth leans toward)
import { observeDishDensity } from './curator/dishDensityLive.js'; // #1412: the contact-density field, onto the bus
import { roomWidthFromCodes } from './curator/roomWidth.js'; // #1145 step 3: the room tightens or loosens Davis's shifts
import { resolveLoisFace } from './curator/loisFace.js';
import { resolveDavisState } from './curator/davisState.js'; // #1355 step 3: when a spore would form
import { setRoomCodesProvider } from './curator/roomCodes.js'; // #1949
import { startMind, replayMindFrame, endMindReplay } from './curator/mindLive.js'; // #1462: Mind 1
import { ensureArchiveRetriever, scheduleArchiveIndexing } from './personas/personaArchiveLive.js'; // #2384: Persona Archive
import { startReviewVoice } from './curator/fieldReviewVoiceLive.mjs'; // #2006 slice 2: the review loop's voice on the tape
import { startFieldRevision } from './curator/fieldRevisionLive.js'; // #2151: the standing poem's critical pass (requests under the pressure law)
import { startTreatments } from './curator/treatmentsLive.mjs'; // #2010: the treatments surface + its bus announcer
import { replaySpectrumFrame, endSpectrumReplay } from './curator/spectrumRecord.js'; // #1534: a take replays its hearing
import { startMindFaces, resetMindFaces } from './curator/mindFace.js'; // #1462: a request blends a face state in and out
import { startRoomFeed, resetRoomFeed } from './curator/roomFeed.js'; // #1560 S1: THE ROOM codec's retained bus window
import { startStoryLive } from './curator/storyLive.js'; // #1560 S3: the room's story machine (backstage only)
import { DEBUG_MIND, demoModel } from './curator/mindDemo.js'; // #1462: ?debug=mind stand-in backend for review
import { desktopAppleModel } from './curator/mindApple.js'; // #1463: Apple Intelligence via the desktop helper
import { createMindChain } from './curator/megamindVoiceLive.js'; // #1526: MegaMind S2 — a linked Ollama answers first, Apple behind it, rules underneath
import { setStageFrameProvider } from './curator/megamindVisionLive.js'; // #1527: MegaMind S3 — the stage-description frame seam (registration only; captures happen on a press)
import { createPresenceDriver } from './curator/mindPresenceLive.js'; // #1464: Mind 3 — engagement tiers + zodiac
import { startGhost, resetGhost } from './curator/mindGhost.js'; // #1464: the third's presence on the Stimuli meter
import { startMindRoom, getMindRoom } from './curator/mindRoom.js'; // #1145: the Director's room, as the minds hear it
import { startCanonBus } from './curator/canonBus.mjs'; // #2049: Canon records on the core buses
import { isPlaybackActive, setPlaybackFrameTap, subscribePlayback } from './gl/playback.mjs'; // #1462: a take's decisions replay
import { createSet } from './curator/setLive.js'; // #1475: her set
import { setSourceFeed, peekSourceFeed } from './gl/sourceFeed.mjs';
import { startPace } from './curator/paceLive.js'; // #1460: the tempo ease
import { startBreak } from './curator/breakLive.js'; // #2116: the assemble trigger
import { startLean } from './curator/leanLive.js'; // #1640: the dial lean, applied in silence
import { startGaitPick } from './curator/gaitLive.js'; // #2329: each construct's gait is picked once a phrase
import { replayGaitFrame, endGaitReplay } from './curator/gaitRecord.mjs'; // #2329: a take re-publishes its gait picks
import { ASSETS_CONSTRUCTS } from './data/assets/index.js'; // #2329: the house constructs (the gait wearers) and their styles
import { ASSETS } from './data/assets/index.js'; // #2475: a creature's body style is read from the catalogue
import { creatureGaitTargets, creatureGaitStyleOf } from './engine/creatureGait.mjs'; // #2475: creatures and beasts wear gaits too
import { poolWithBirths } from './engine/kineticBirths.mjs'; // #2475: the stage-born creatures are wearers like the banked ones
import { startTrio, getTrioView } from './curator/trioLive.js'; // #1483: Davis conducts the audio show
import { startBand, bandOn } from './personas/bandLive.js'; // #2387: the band plays on the phrase clock (opt-in, off by default)
import { getTaste } from './curator/tasteStore.js'; // #2394: the loaded taste carries the personas heads
import { loadPersonaHeadsAtBoot } from './curator/personaHeadsLive.js'; // #2439: the boot bridge to the trained heads
import { steeringHeads } from './curator/tasteHead.js'; // #2394: only earned-in heads steer the band
import { tuningWithChemistry } from './personas/chemistry.mjs'; // #2398: learned relation offsets shift the band's tuning
import { replayRhythmFrame, endRhythmReplay } from './personas/rhythmRecord.mjs'; // #2389: a take replays the rhythm section's timing and looks
import { createRhythmEyes } from './personas/rhythmVisionLive.js'; // #2389: the rhythm section's eyes (local vision model; at most once a phrase)
import { startWire, stopWire, wireReader } from './personas/wireLive.js'; // #2390: the Wire (opt-in, off by default, nothing renders)
import { replayWireFrame, endWireReplay } from './personas/wireRecord.mjs'; // #2390: a take replays the Wire items it had in reach
import { startAudibleBeats } from './curator/beatSynthLive.js'; // #2389: the set made audible (opt-in DEV flag, off by default)
import { replayBandFrame, endBandReplay } from './personas/bandRecord.mjs'; // #2387: a take re-publishes the band's turns
import { createShowSpectrum } from './curator/showSpectrum.js'; // #1483 stage 2: the spectrum the personas are told
import { SPECTRUM_PARAMS } from './curator/mindConduct.js'; // #1483 stage 2: the marks dials Davis may re-tune
import { observeAudio } from './composition/audioLive.js'; // #1459: audio events on the bus
import { readMeterBandLevels, getAudioMeterTap } from './hooks/audioMeterTap.js';
import { startSpectrum, readSpectrum } from './gl/spectrumLive.mjs'; // #1482 P2: the live spectrum
import { observeClock, getLoopMs, getMusicalTime } from './composition/clockLive.js'; // #1458: bar / beat / phase on the loop clock
import { observeMotion } from './composition/motionLive.js'; // #1469: the frame's living-motion read, to the MOTION strip's tap
import { setResolveFrameTap } from './gl/resolveTap.mjs';
import { captureFavorite } from './state/slices/davisSlice.js';
import * as A from './state/actions.js';
import { Shell } from './composition/Shell.jsx';
import { StageView } from './panels/pipeline/StageView.jsx';

// #607 — the stage window (`?stage=1`) renders ONLY the stage canvas: no
// store providers, no instrument chrome, no panels. The signal arrives over
// BroadcastChannel from the instrument window's mirror.
const STAGE_ONLY = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('stage') === '1';

const COLUMN_FRACTIONS = [0.62, 0.38];
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.9.0';
import { wireEventBus } from './composition/wireEventBus.js';
import { subscribeDispatch } from './composition/dispatchPipe.js';
import { loisActivity, LOIS_VIBE_DWELL_MS } from './curator/loisActivity.js';

function AppInner() {
  const { dispatch: rawDispatch, history, palette, glLoopRef } = useApp();
  const piped = useMemo(() => wireEventBus(rawDispatch), [rawDispatch]);

  useCuratorIPC();

  useEffect(
    () =>
      subscribeDispatch((a) => {
        if (import.meta.env.DEV) console.debug('[pipe]', a.type);
      }),
    [],
  );

  // LOIS honest feed (#948/#956): records user-behavior signals only —
  // no UI, no store writes, nothing visible. Surfaces come later.
  useEffect(() => {
    loisActivity.start({ store: useStore });
    return () => loisActivity.stop();
  }, []);

  // #2151 — the standing poem's critical pass: while the user's tempo is
  // watching, a poem standing at a register pole draws a revision
  // request from LOIS/DAVIS, and the poem answers through its own deal
  // machinery; hot tempo flips deals to variety, fiddling silences
  // requests, and any user change overrides a pending one. Muted while
  // a take plays back.
  useEffect(() => startFieldRevision({ getState: useStore.getState, isReplaying: isPlaybackActive }), []);

  // #2439 — Persona Adapters boot bridge: load the nightly trainer's heads once, at start, onto the
  // loaded taste (desktop only). Silent by ruling: a missing or unreadable store leaves no trace and
  // the band plays on rules exactly as before; heads written mid-session land at the next launch.
  useEffect(() => {
    loadPersonaHeadsAtBoot();
  }, []);

  // #1139 — whisper triggers (deniable transition lines). Budgets live in
  // whisper.js; the lines ship copy-only while the sway gate stays closed.
  useEffect(() => {
    initWhisperTriggers(useStore.getState, useStore.subscribe);
    const stopDirectorBeat = initDirectorBeat(useStore.subscribe, () => ({
      loopMs: getLoopMs(),
      bpm: getMusicalTime().bpm,
    })); // #1145: the Director's beat input (#2089: unsubscribed below)
    initPhase(useStore.subscribe); // #1144: explore / refine, from what the artist does
    // #1354 — stress and bands from honest counts (artist actions, rolls since the last keep). Computed only: no
    // persona reads the band yet; ?debug=stress shows it.
    // #1355 — dish pressure: the marks the resolver placed around the canvas pins, read from each resolved frame.
    // #1694 slice 1 — formation and AUTO SPAWN no longer ride this tap: the resolver owns the spawn
    // channel (curator/spawnState.js), observes every resolved frame itself, and publishes the decisions
    // the loop stamps on the next frame's input; the loop writes the homes to the store when they move.
    setResolveFrameTap((input, output) => {
      // #1458: musical time on the loop clock (one call a frame; bus events only on whole beats and bars)
      observeClock(input && input.loopTimeMs, useStore.getState().beatBpm);
      // #1459: discrete audio detections (onset, tempo, energy, silence) from the meter's band levels
      observeAudio(
        input && input.loopTimeMs,
        readMeterBandLevels(),
        useStore.getState().audioSource && useStore.getState().audioSource.type,
      );
      // #1469: the MOTION readout's publisher (read-only tap; the strip polls it, nothing is routed)
      observeMotion();
      observeDish(input, output);
      observeDishDensity(); // #1412: the shared grid's density field, published on the bus for formation/telemetry readers
    });
    // #1145 step 3 — the room, read from the honest feed at the moment a moth is born (never per frame)
    const roomNow = () => {
      const feed = loisActivity.snapshot();
      const face = resolveLoisFace(feed);
      const davis = resolveDavisState(feed);
      return {
        ...roomWidthFromCodes(face ? face.code : null, davis ? davis.code : null),
        keeps: useStore.getState().keeps,
      };
    };
    setRoomProvider(roomNow);
    // #1949 — the room's persona codes for the frame: the live loop stamps them on the resolver input (a take keeps
    // them) and the creature rigs walk Lois's gait and wear Davis's deal. Registered below, once roomCodes exists.
    // #1460 — the pace: once a phrase it may ease the BEAT toward a confident audio tempo (her mark shows while it does)
    const stopPace = startPace({ getBpm: () => useStore.getState().beatBpm, context: roomNow });
    // #2116 — assemble: landings and strong hits bump the trigger counters (recorded input; the loop's fold stamps them)
    const stopBreak = startBreak({
      bump: (which) => useStore.getState().bumpBreak(which),
      watchLanding: (cb) =>
        useStore.subscribe((s, prev) => {
          if ((s.kineticLanding?.seq || 0) !== (prev.kineticLanding?.seq || 0)) cb();
        }),
    });
    // #1640 — the dial lean: in silence, once a phrase, she may lean the WETNESS and EVOLVE dials toward her
    // validated read of the room (her mark shows while she does); a hand on either dial releases her
    const stopLean = startLean({
      getWetness: () => useStore.getState().layoutParams.accumulationWetness,
      getEvolveInterval: () => useStore.getState().evolveInterval,
      context: roomNow,
    });
    // #2329 — gait M3: once a phrase each standing construct's gait is picked among its style's Canon defaults
    // (still / idle / performing) from the audio envelope; a user lock wins; muted while a take plays.
    // #2475 — and the creature and beast tiles in the stage pool (Matt's M5 ruling: every wearer is picked for,
    // same rules as constructs). They ride the same gate: the picks reach the stage only on the constructs' stamp.
    const constructStyle = new Map(ASSETS_CONSTRUCTS.map((a) => [a.id, a.style]));
    let creatureStyleMemo = { custom: undefined, births: undefined, styleOf: () => null };
    const creatureStyleOf = (st) => {
      if (creatureStyleMemo.custom !== st.customAssets || creatureStyleMemo.births !== st.stageBirths)
        creatureStyleMemo = {
          custom: st.customAssets,
          births: st.stageBirths,
          styleOf: creatureGaitStyleOf(poolWithBirths(st.customAssets, st.stageBirths), ASSETS),
        };
      return creatureStyleMemo.styleOf;
    };
    const stopGaitPick = startGaitPick({
      getTargets: () => {
        const st = useStore.getState();
        if (st.constructLead !== true) return [];
        const pool = st.enabledAssets; // { assetId: true } (null = the whole library, which never places a construct)
        const constructs =
          pool && typeof pool === 'object' ? Object.keys(pool).filter((id) => pool[id] && constructStyle.has(id)) : [];
        const creatures = creatureGaitTargets(poolWithBirths(st.customAssets, st.stageBirths), pool);
        return creatures.length ? [...constructs, ...creatures] : constructs;
      },
      styleOf: (id) => constructStyle.get(id) ?? creatureStyleOf(useStore.getState())(id),
      getAssignments: () => useStore.getState().gaitAssignments,
      assign: (e) => useStore.getState().assignGait(e),
      isReplaying: isPlaybackActive,
    });
    // #2387 — P7 the band: opt-in (window.__KC_BAND), off by default. Plays on this same phrase clock; the artist's hand
    // wins: a keep since the last phrase silences it, the Trio's owned targets (the 32-bar ownership) lock DAVIS out,
    // a palette lock keeps GREIMAN (HYBRID) out. With the band's tuning unruled (null) it plays nothing.
    let keptThisPhrase = false;
    const offBandKeep = loisActivity.onKeep(() => {
      keptThisPhrase = true;
    });
    const stopBand = startBand({
      getSeed: () => useStore.getState().seed,
      getPressure: () => getStressState().smoothed,
      getHold: () => {
        const keep = keptThisPhrase;
        keptThisPhrase = false;
        const lock = [];
        const view = getTrioView();
        if (view && Array.isArray(view.owned) && view.owned.length) lock.push('davis');
        if (Object.values(useStore.getState().paletteLocks || {}).some(Boolean)) lock.push('greiman');
        return { keep, lock };
      },
      isReplaying: isPlaybackActive,
      // #2394 — Adapters A1: the band steers on the loaded taste's persona heads, but only the ones
      // that have earned in (≥200 labeled turns, held-out ≥ 0.3); no taste, no section, or no
      // earned-in head reads null here and the band plays on rules exactly as before.
      getHeads: () => steeringHeads(getTaste()),
      // #2398 — Adapters A5: the band plays on the session tuning with its relation biases shifted
      // by the loaded taste's learned chemistry offsets; no offsets on the taste, and the tuning
      // is the identical object it was before (chemistry.mjs law 3).
      getTuning: () => tuningWithChemistry(getTaste()),
      // #2389 — P9 the rhythm section's seat: her timing lean on each turn (when, never who or what) and her eyes, at
      // most once a phrase through a local vision model. Unruled (null) shares and cadence: nothing leans, nothing looks.
      getTiming: bandTimingStep,
      eyes: createRhythmEyes(),
    });
    const roomCodes = () => {
      const f = loisActivity.snapshot();
      const face = resolveLoisFace(f);
      const dv = resolveDavisState(f);
      return { lois: face ? face.code : null, davis: dv ? dv.code : null };
    };
    setRoomCodesProvider(roomCodes);
    // #1462 — Mind 1: once a bar each persona thinks about the room (Apple when available, rules otherwise):
    // decisions are telemetry and recorded in a take; rules never request a stage change. Muted while a take plays.
    const stopFaces = startMindFaces();
    const stopFeed = startRoomFeed();
    const stopSpectrum = startSpectrum(getAudioMeterTap); // #1482 P2: steps once a frame, STIMULI open or not
    // #1463 — Apple Intelligence through the desktop helper is the default whenever it is available; until the
    // startup check answers (and always on the web) the rules answer, silently.
    let apple = null;
    desktopAppleModel().then(
      (m) => {
        apple = m;
      },
      () => {
        apple = null;
      },
    );
    const appleModel = {
      name: 'apple',
      available: () => !!(apple && apple.available()),
      info: () => (apple ? apple.info() : null),
      ask: (...a) => (apple ? apple.ask(...a) : Promise.reject(new Error('unavailable'))),
    };
    // #1526 — MegaMind S2: the backend chain the ordering ruling names (Matt, 2026-11-10). A linked,
    // living Ollama answers the personas; its death or absence returns them silently to Apple where
    // present, else the rules — no UI announces any of it (the MIND_STATUS doctrine). The review voice
    // below keeps the Apple model alone: its 300 ms ask discipline is Apple-shaped by its own spec.
    const mindModel = createMindChain(appleModel);
    // #1464 — Mind 3: hidden per-persona engagement (persisted on this machine), four tiers, the zodiac character and
    // one startup calendar reading. Works the same on Apple and on the rules.
    const stopGhost = startGhost();
    const stopRoom = startMindRoom(); // #1145: director:room → the personas' context (verdict + intensity band)
    const presence = createPresenceDriver({
      getSignals: () => {
        const f = loisActivity.snapshot();
        const st = useStore.getState();
        return {
          active: !f.away && !f.tabHidden,
          dwelling: f.dwellMs >= LOIS_VIBE_DWELL_MS,
          audio: !!st.audioEnabled,
          keeps: Array.isArray(st.keeps) ? st.keeps.length : 0,
          exports: f.exportCount,
          returns: (f.recallCount || 0) + (f.bloomReturnCount || 0),
          evolves: f.evolveCount,
        };
      },
    });
    setPresenceProvider(presence.third); // #1145 × Mind 3: her tier (earned, honest) scales her hand in the Director
    // #1483 — the trio's audio direction: while audio is live Davis may edit the route table, on the phrase boundary,
    // inside the clamps, never on a target the artist touched, and only at a tier that has earned it.
    const trio = startTrio({
      getRoutes: () => useStore.getState().audioRoutes,
      getTier: () => presence.contextFor('davis').tier,
      getBands: () => {
        const b = readMeterBandLevels();
        return b ? Object.values(b) : null;
      },
      getSpectrum: (
        (bar) => () =>
          bar.sample(readSpectrum())
      )(createShowSpectrum()), // once a bar: flux is the bar's movement
      // #1807 — the ACCUM buffer statistics for the show block: the sampler is a standing
      // consumer (its existence requests the stats), the pressure governor observes every
      // stamped reading data-only (its actuation flag ships off — observe first).
      getTrail: (
        (sampler) => () =>
          sampler.sample()
      )(
        (() => {
          requestStats();
          setStatsGovernor(createPressureGovernor());
          return createTrailSampler();
        })(),
      ),
      // #1841 — the wet field's shed line for the show block: the loop
      // publishes the service's mode per frame on the wet wire; the
      // line exists only while the field is degraded or a wanting
      // consumer stands shed (degradation is visible, never silent).
      getWet: () => getWetModeLine(),
      // LOIS's keep-rate read (Matt, 2026-10-14): keeping a lot lets a steady show ride; passes piling up make him call it flat sooner
      getActivity: () => {
        const f = loisActivity.snapshot();
        return { keeps: f.keepsLast5m, rolls: f.rollsLast5m };
      },
      isReplaying: isPlaybackActive,
      subscribe: (fn) => useStore.subscribe(fn),
      // #1483 stage 2 — the spectrum marks Davis may re-tune; his write is programmatic, never the slider's own event
      getMarks: () => {
        const st = useStore.getState();
        const lp = st.layoutParams || {};
        return {
          map: lp.spectrumMap ?? 0,
          scale: lp.spectrumScale ?? 0,
          displace: lp.spectrumDisplace ?? 0,
          colour: lp.spectrumColour ?? 0,
          locked: Object.entries(SPECTRUM_PARAMS)
            .filter(([, key]) => st.lockedParams?.[key])
            .map(([k]) => k),
        };
      },
      // #2095: his marks write is not the artist's action: it never lands on the artist's undo stack
      setMarkParam: (key, value) => useStore.getState().setLayoutParam(key, value, { skipUndo: true }),
    });
    // #2049 — the Canon binder: wires each Canon record's own declared bus binding (what it listens to, what it
    // announces) and keeps the Canon state the minds are handed each bar. It only watches and announces — it
    // asks the stage for nothing — and is muted while a take plays back.
    const canonBus = startCanonBus({ getState: useStore.getState, isReplaying: isPlaybackActive });
    // #2384 — the Persona Archive: cited snippets from a persona's own shelf ride its model asks
    // (MegaMind embeddings slot; nothing is retrieved until a slot is measured, and the shelf is
    // indexed at idle, never per frame). The rules path never sees it.
    const archiveRetriever = ensureArchiveRetriever();
    const stopMind = startMind({
      presence,
      conductHeat, // #1483: how bold Davis's conducting picks may run (engine-side only)
      isReplaying: isPlaybackActive,
      model: DEBUG_MIND ? demoModel : mindModel,
      archive: archiveRetriever,
      wire: wireReader, // #2390: the Wire's items ride the model-bound context (read-only; [] while the Wire is off)
      getSeed: () => useStore.getState().seed,
      getSnapshot: () => {
        const st = useStore.getState();
        return {
          layers: st.layers,
          enabledAssetCount: st.enabledAssets ? Object.values(st.enabledAssets).filter(Boolean).length : 0,
          paletteId: st.paletteId,
          room: roomCodes(),
          band: getStressState().band,
          keepsCount: Array.isArray(st.keeps) ? st.keeps.length : 0,
          bpm: st.beatBpm,
          audio: st.audioEnabled ? (st.audioSource && st.audioSource.type === 'file' ? 'file' : 'mic') : 'none',
          creatures: st.layoutParams?.creatures ?? 0,
          director: getMindRoom(),
          show: trio.showBlock(),
          canon: canonBus.snapshot(), // #2049: what Canon stands, and what it has heard
        };
      },
    });
    // #2006 slice 2 — the review loop's voice: speaks each fresh poem landing's banked verdict
    // onto the footer tape (DAVIS on clean, LOIS on janky, silence on exempt), asking the SAME
    // model startMind gets to phrase the line — rules wording the silent fallback, the 300 ms
    // ask cap, and muted while a take plays back, so a replay never asks a backend again.
    const stopReviewVoice = startReviewVoice({
      getState: useStore.getState,
      subscribe: (fn) => useStore.subscribe(fn),
      model: DEBUG_MIND ? demoModel : appleModel,
      isReplaying: isPlaybackActive,
    });
    // #2010 — RAY GUN treatment bus records: bind the core API's `treatments` surface and announce every change to
    // a standing treatment record on the bus (treatment:arm / :disarm, caused + musically stamped). Announcements
    // only: the record on the form stays the authority; the take's `treatments` section is the recording listener.
    const stopTreatments = startTreatments({
      getState: useStore.getState,
      subscribe: (fn) => useStore.subscribe(fn),
      isReplaying: isPlaybackActive,
    });
    // #1560 S3 — the room's story machine: folds the bus into rapport/grudge standing, episodes and beats, and
    // persists the book beside the engagement scores. Backstage only (the dev panel's MIND tab reads its view);
    // the room shows nothing of it, and it asks nothing of the stage.
    const stopStory = startStoryLive({
      getSeed: () => useStore.getState().seed,
      getTiers: () =>
        Object.fromEntries(
          ['davis', 'lois'].map((p) => [p, parseInt(String(presence.contextFor(p).tier).slice(1), 10) || 1]),
        ),
      isReplaying: isPlaybackActive,
    });
    // #1462 — a take plays back its recorded decisions, frame by frame; no backend is asked
    // #1534 — and its recorded hearing: the take's spectrum feeds the live core in the analyser's place
    // #2329 — and its gait picks, re-published as they happened (nothing re-picks)
    // #2390 — and the Wire items it had in reach (the take's own, never the live shelf: replay needs no network)
    setPlaybackFrameTap((frame, perf, o) => {
      replayMindFrame(frame, perf && perf.mind, o);
      replaySpectrumFrame(frame, perf && perf.spectrum, o);
      replayGaitFrame(frame, perf && perf.gaits, o);
      replayBandFrame(frame, perf && perf.band, o);
      replayRhythmFrame(frame, perf && perf.band && perf.band.rhythm, o);
      replayWireFrame(perf && perf.wire);
    });
    const offPlayback = subscribePlayback(() => {
      endMindReplay();
      endSpectrumReplay();
      endGaitReplay();
      endBandReplay();
      endRhythmReplay();
      endWireReplay();
      resetMindFaces();
      resetRoomFeed();
      resetGhost();
    }); // a take starts or ends: fresh faces, a fresh transcript window
    // #1475 — her set: after a while with nothing happening and no real audio, a beat from her library fades in and
    // plays silently into the band feed; the artist acting or real audio arriving makes it yield.
    const set = createSet({
      getBpm: () => useStore.getState().beatBpm,
      getIdleMs: () => loisActivity.snapshot().idleMs,
      getRealLevel: () => {
        const b = useStore.getState().audioEnabled ? readMeterBandLevels() : null;
        return b ? Object.values(b).reduce((x, v) => x + v, 0) / Object.keys(b).length : 0;
      },
      getRoom: roomCodes,
      getBand: () => getStressState().band,
      getSeed: () => useStore.getState().seed,
      grow: bandOn, // #2389: with the band on, her library grows (the crate + seeded variations); off, the set is unchanged
    });
    // #2389 — her set, audible: OFF by default (DEV flag), and even on it waits for a user gesture; synthesized from the
    // pattern the set plays, it yields the moment live audio is on. Output only: it writes nothing back.
    const stopAudible = startAudibleBeats({
      getPattern: set.pattern,
      getMix: () => (peekSourceFeed() ? peekSourceFeed().mix : 0),
      getTime: getMusicalTime,
      isLiveAudio: () => !!useStore.getState().audioEnabled,
    });
    scheduleArchiveIndexing(archiveRetriever); // #2384: embed the shelves at idle, never per frame
    startWire(); // #2390: opt-in (DEV flag + an approved feed list); one fetch at launch in an idle moment, then idle moments only
    setSourceFeed(set.feed);
    const unKeep = loisActivity.onKeep(noteKeep); // #1356 step 5: remember the living moths' traits at a keep
    const stop = initStress({
      getCounts: loisActivity.pressureCounts,
      isRunning: () => useStore.getState().running,
      getDish: getDishPressure,
    });
    return () => {
      setResolveFrameTap(null);
      setRoomProvider(null);
      unKeep();
      stopDirectorBeat();
      stopPace();
      stopBreak();
      stopLean();
      stopGaitPick();
      stopBand();
      offBandKeep();
      stopAudible();
      stopMind();
      stopWire();
      canonBus.stop();
      stopReviewVoice();
      stopTreatments();
      trio.stop();
      stopFaces();
      stopFeed();
      stopStory();
      stopSpectrum();
      stopGhost();
      stopRoom();
      setPresenceProvider(null);
      setPlaybackFrameTap(null);
      offPlayback();
      setSourceFeed(null);
      set.reset();
      stop();
    };
  }, []);

  const { state } = useApp((s) => ({
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
  useWatchdogSpaceResume();
  useBeatDecay();
  usePhraseLoop();
  useMorphEvolve();
  useVoiceMixDriver();
  useEarnedVoices(); // #1153: a find (Davis's BLOOM) is shelved as an earned voice
  useRollGuard(glLoopRef); // before the autosave/boot effect, so the cold-open roll finds its listener
  useProjectAutosave();
  useCultureWorld(); // CULTURE Phase 0 — the dish gate: inert unless the project carries cultureDish on

  const [showHotkeys, setShowHotkeys] = useState(false);
  const [helpTab, setHelpTab] = useState('help');
  const [tourOpen, setTourOpen] = useState(false);
  // #1710 — the project wizard is its own step after the Play Me card: it waits for the card to be gone (this
  // launch's dismissal, or an earlier launch's) and never opens over the tour.
  const [playMeGone, setPlayMeGone] = useState(() => {
    try {
      return localStorage.getItem('kc:first-run-seen') === '1';
    } catch {
      return false;
    }
  });
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
      // #1935: mirror the presented-wall sibling alongside (same frame).
      const pms = glLoopRef?.current?.getPresentedMs?.();
      if (Number.isFinite(pms)) loopClock.presentedMs = pms;
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

  // #1527: the stage-description frame seam. The MEGAMIND tab's describer asks through this
  // provider; it wraps the existing capture path with downloadFile:false, so the frame described
  // is the exact frame the instrument shows. Registration only — nothing captures until pressed.
  useEffect(() => {
    setStageFrameProvider(async () => {
      if (!glLoopRef?.current) return null;
      const { blob } = await captureStill({ loopRef: glLoopRef, resolution: 1, downloadFile: false });
      return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/png' };
    });
    return () => setStageFrameProvider(null);
  }, [glLoopRef]);

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
    s: () => {
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
              resolution:
                state.exportResolution === 1
                  ? '1000x700@1x'
                  : state.exportResolution === 2
                    ? '1000x700@2x'
                    : '1000x700@4x',
              timestamp: new Date().toISOString().slice(11, 19),
              config: { layout: { ...state.layoutParams }, palette: { id: palette.id } },
              thumb,
            },
          });
        },
      }).catch((e) => console.error('[snap] hotkey capture failed:', e));
    },
    // #719: same capture as the DAVIS ★ — this used to drop seedOffsets.
    f: () =>
      piped({
        type: A.ADD_FAVORITE,
        favorite: captureFavorite({ ...state, enabledAssets: state.enabled }, palette.id),
      }),
    // #996: J keeps the plate without starring it. F (above) also keeps.
    // #1147: keep moved off K — K is KINETIC's tap (KineticButton.jsx).
    j: () =>
      piped({
        type: A.ADD_KEEP,
        keep: captureFavorite({ ...state, enabledAssets: state.enabled }, palette.id),
      }),
    // #1173: X passes on the plate — a deliberate "not this", one line in the
    // passes ledger the MLX loop reads as a negative. Nothing on screen changes.
    x: () =>
      piped({
        type: A.ADD_PASS,
        pass: captureFavorite({ ...state, enabledAssets: state.enabled }, palette.id),
      }),
    g: () => piped({ type: A.TOGGLE_FULLSCREEN }),
    // #107 §7: while recording or batch/final-rendering, N/E are debounced —
    // a seed bump or evolve toggle mid-encode changes what's being captured
    // partway through, and there is no clean way to fix that after the fact.
    e: () => {
      if (!state.isRecording && !state.isRendering) piped({ type: A.SET_EVOLVE_MODE, payload: (p) => !p });
    },
    n: () => {
      if (!state.isRecording && !state.isRendering) piped({ type: A.BUMP_SEED });
    },
    ' ': () => piped({ type: A.SET_RUNNING, payload: !state.running }),
    z: (e) => {
      if (e.metaKey || e.ctrlKey) {
        e.shiftKey ? history.redo() : history.undo();
      }
    },
    '?': () => {
      setHelpTab('help');
      setShowHotkeys((s) => !s);
    },
    // #107 §7: one panic key — always pause, always exit (never enter)
    // fullscreen, always close the hotkey sheet, regardless of current state.
    Escape: () => {
      piped({ type: A.SET_RUNNING, payload: false });
      if (state.isFullscreen) piped({ type: A.TOGGLE_FULLSCREEN });
      setShowHotkeys(false);
    },
  });

  const onAudioStimulus = useCallback((v) => piped({ type: A.SET_AUDIO_STIMULUS, payload: v }), [piped]);
  const onAudioBands = useCallback((v) => piped({ type: A.SET_AUDIO_BANDS, payload: v }), [piped]);
  // #107 §5: honesty on mic denial — flip audioEnabled back off (rather than
  // silently doing nothing) and surface it so MasterBar can explain why.
  const onAudioDenied = useCallback(
    (denied) => {
      piped({ type: A.SET_AUDIO_DENIED, payload: denied });
      if (denied) piped({ type: A.SET_AUDIO_ENABLED, payload: false });
    },
    [piped],
  );
  // #1053: the chosen input went away. Say so, and shut audio off so the meter
  // reads idle (zero), not a frozen last value. AUDIO ON is the reconnect.
  const onAudioLost = useCallback(
    (name) => {
      piped({ type: A.SET_AUDIO_LOST, payload: name });
      piped({ type: A.SET_AUDIO_ENABLED, payload: false });
      say('LOST'); // #1139 — "input's gone. i'm still listening."
    },
    [piped],
  );
  const onBeat = useCallback(() => {
    // beatPulse still drives the readouts (phrase pip, meters); the actual
    // consumers are routed through the beat arbiter so one attack is one
    // ordered spike — phrase (the clock) resolves first, evolve (the gate)
    // fires on the post-phrase state. #104: beat collisions.
    piped({ type: A.SET_BEAT_PULSE, payload: (p) => Math.min(1, p + 0.55) });
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
      <HotkeyOverlay
        show={showHotkeys}
        onClose={() => setShowHotkeys(false)}
        initialTab={helpTab}
        key={helpTab}
        onTour={() => {
          setShowHotkeys(false);
          setTourOpen(true);
        }}
      />
      <FirstRunOverlay onPlay={onPlayMe} onTour={() => setTourOpen(true)} onDismiss={() => setPlayMeGone(true)} />
      <TourOverlay open={tourOpen} onClose={() => setTourOpen(false)} />
      {playMeGone && !tourOpen ? <ProjectWizardOverlay /> : null}
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
      {DEBUG_AGE && <AgeReadout />}
      {DEBUG_TRAILGRID && <TrailGridReadout />}
      {DEBUG_STATS && <TrailReadout />}
      <footer className="footer-bar">
        <span>
          KINETIC_CURATOR v{APP_VERSION} · {KERNEL_VERSION} · build {import.meta.env.VITE_BUILD_ID || 'dev'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {state.layoutParams.mode} · seed:{state.seed.toString(16)}
          <BackendIndicator
            onOpenSettings={() => {
              setHelpTab('settings');
              setShowHotkeys(true);
            }}
          />
          <button
            type="button"
            className="micro-btn"
            title="Settings — no second prefs store"
            style={{ opacity: 0.45 }}
            onClick={() => {
              setHelpTab('settings');
              setShowHotkeys(true);
            }}
          >
            ≡
          </button>
          <button
            type="button"
            className="micro-btn"
            title="Help"
            style={{ opacity: 0.45 }}
            onClick={() => {
              setHelpTab('help');
              setShowHotkeys(true);
            }}
          >
            ?
          </button>
        </span>
      </footer>
    </div>
  );
}

export default function App() {
  if (STAGE_ONLY) return <StageView />;
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
