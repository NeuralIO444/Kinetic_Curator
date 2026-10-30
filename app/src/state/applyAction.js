// applyAction.js — the one place an action becomes a store call (extracted from AppContext's dispatch so the whole
// chain emit -> wireEventBus -> dispatch -> slice can be run, and tested, without React). Behaviour is unchanged:
// AppContext's dispatch is `(action) => applyAction(action)`.
import { useStore } from './store.js';
import * as A from './actions.js';
import { recordGovernorEvent } from '../gl/governorEventLog.mjs';

/** @param action { type, ... }  @param store defaults to the live store (a test may pass its own state object) */
export function applyAction(action, store = useStore.getState()) {
  const { type, payload } = action;
  switch (type) {
    case A.SET_RUNNING: {
      // #264 — manual resume: Space/RUN after a watchdog hard stop is the
      // documented resume. setRunning clears the stop itself; the restore
      // is logged here under cutKind 'watchdog' so the flap detector
      // pairs it with the shed.
      const wasWatchdogStop = store.slowRenderSource === 'watchdog';
      const result = store.setRunning(payload);
      if (payload && wasWatchdogStop) {
        recordGovernorEvent({
          type: 'restore',
          cutKind: 'watchdog',
          label: 'watchdog hard stop cleared (manual resume)',
        });
      }
      return result;
    }
    case A.SET_FPS:
      return store.setFps(payload);
    case 'SET_NODE_COUNT':
      return store.setNodeCount(payload);
    case A.SET_QUALITY: {
      // #264 — a manual quality choice cancels any governor quality-shed
      // claim, so recovery never overrides the operator's own tier. (The
      // governor sheds via the store directly, not this dispatch path.)
      store.setQuality(payload);
      store.setQualityShedFrom(null);
      return;
    }
    case A.SET_AUTO_QUALITY:
      return store.setAutoQuality(payload);
    case A.SET_SEED:
      return store.setSeed(payload);
    case A.BUMP_SEED:
      return store.bumpSeed();
    case A.MUTATE_SEED_OFFSET:
      return store.mutateSeedOffset(action.group);
    case A.RESET_SEED_OFFSETS:
      return store.resetSeedOffsets();
    case A.SET_PALETTE_ID:
      store.markPaletteChosen();
      return store.setPaletteId(payload); // #1365: the artist chose
    case A.SET_PALETTE_SWATCH:
      store.markPaletteChosen();
      return store.setPaletteSwatch(action.index, action.hex); // #1365: the artist chose
    case A.SET_PALETTE_BG:
      store.markPaletteChosen();
      return store.setPaletteBg(payload); // #1365: the artist chose
    case A.SET_PALETTE_INK:
      store.markPaletteChosen();
      return store.setPaletteInk(payload); // #1365: the artist chose
    case A.CLEAR_PALETTE_OVERRIDES:
      store.markPaletteChosen();
      return store.clearPaletteOverrides(); // #1365: the artist chose
    case A.SET_PALETTE_MIX:
      return store.setPaletteMixSeconds(payload);
    case A.SET_COLOR_MODE:
      return store.setColorMode(payload);
    case A.SET_LAYOUT_PARAM: {
      // #724 — learn-mode: a slider wiggled while a macro knob is armed
      // assigns its key to that macro ("touch the thing to assign the
      // thing"). This funnel is UI-only: panels emit LAYOUT_PARAM on
      // slider wiggle; programmatic writes (morphs, curator, the macro
      // drive itself) call setLayoutParam directly and never assign.
      if (store.mathLearnArmed) store.mathLearnAssign(action.key);
      return store.setLayoutParam(action.key, action.value);
    }
    case A.SET_LAYOUT_PARAMS:
      return store.setLayoutParams(payload);
    case A.APPLY_PRESET:
      return store.applyPreset(action.preset);
    case A.TOGGLE_PARAM_LOCK:
      return store.toggleParamLock(action.key);
    case A.RANDOMIZE_PARAM:
      return store.randomizeParam(action.key);
    case A.RANDOMIZE_UNLOCKED:
      return store.randomizeUnlocked();
    case A.CURATE_UNLOCKED:
      return store.curateUnlocked();
    case A.TOGGLE_ASSET:
      return store.toggleAsset(action.id);
    case A.SOLO_ASSET:
      return store.soloAsset(action.id);
    case A.TOGGLE_ALL_ASSETS:
      return store.toggleAllAssets(payload);
    case A.SET_SEARCH:
      return store.setSearch(payload);
    case A.SET_CAT_FILTER:
      return store.setCatFilter(payload);
    case A.SET_POOL_VIEW:
      return store.setPoolView(payload);
    case A.SET_ASSET_WEIGHT:
      return store.setAssetWeight(action.id, action.weight);
    case A.SET_CATEGORY_WEIGHT:
      return store.setCategoryWeight(action.category, action.weight);
    case A.CLEAR_WEIGHT_OVERRIDES:
      return store.clearWeightOverrides();
    case 'CYCLE_ASSET_WEIGHT':
      return store.cycleAssetWeight(action.id);
    case 'CYCLE_ASSET_OPTION':
      return store.cycleAssetOption(action.id, action.key); // #1694 S2
    case 'TOGGLE_ASSET_STILL':
      return store.toggleAssetStill(action.id); // #1128
    case 'DUPLICATE_ASSET':
      return store.duplicateAsset(action.id);
    case 'INGEST_ASSET':
      return store.ingestAsset(action.svg, action.hint, { category: action.category, source: action.source });
    case 'REMOVE_CUSTOM_ASSET':
      return store.removeCustomAsset(action.id);
    case 'RENAME_CUSTOM_ASSET':
      return store.renameCustomAsset(action.id, action.name);
    case 'REPLACE_CUSTOM_ASSET':
      return store.replaceCustomAsset(action.id, action.svg);
    case 'SET_ASSET_REGION_SLOT':
      return store.setAssetRegionSlot(action.id, action.slot, action.regionId);
    case 'SET_ASSET_REGION_KINEME':
      return store.setRegionKineme(action.id, action.regionId, action.value); // #1434
    case A.SET_WEBCAM_ENABLED:
      return store.setWebcamEnabled(payload);
    case A.SET_AUDIO_ENABLED:
      return store.setAudioEnabled(payload);
    case A.SET_AUDIO_DENIED:
      return store.setAudioDenied(payload);
    case A.SET_AUDIO_LOST:
      return store.setAudioLost(payload);
    case A.SET_AUDIO_GAIN:
      return store.setAudioGain(payload);
    case A.SET_AUDIO_SOURCE:
      return store.setAudioSource(payload);
    case A.SET_AUDIO_MONITOR:
      return store.setAudioMonitor(payload);
    case A.SET_AUDIO_STIMULUS:
      return store.setAudioStimulus(payload);
    case A.SET_BEAT_PULSE:
      return store.setBeatPulse(payload);
    case A.SET_AUDIO_BANDS:
      return store.setAudioBands(payload);
    case A.SET_EVOLVE_MODE:
      return store.setEvolveMode(payload);
    case A.SET_EVOLVE_SOURCE:
      return store.setEvolveSource(payload);
    case A.SET_EVOLVE_TARGET:
      return store.setEvolveTarget(payload);
    case A.SET_EVOLVE_INTERVAL:
      return store.setEvolveInterval(payload);
    case A.SET_AUTO_SNAPSHOT:
      return store.setAutoSnapshot(payload);
    case A.SET_BEAT_ROUTE:
      return store.setBeatRoute(payload);
    case A.TRIGGER_EVOLVE:
      return store.triggerEvolve(payload || {});
    case A.SET_MORPH_EVOLVE:
      return store.setMorphEvolve(payload);
    case A.SET_MORPH_DURATION:
      return store.setMorphDurationMs(payload);
    case A.SET_PHRASE_ENABLED:
      return store.setPhraseEnabled(payload);
    case A.SET_PHRASE_LENGTH:
      return store.setPhraseLength(payload);
    case A.SET_PHRASE_MODE:
      return store.setPhraseMode(payload);
    case A.SET_PHRASE_CLOCK:
      return store.setPhraseClock(payload);
    case A.SET_PHRASE_BPM:
      return store.setPhraseBpm(payload);
    case A.SET_EUCLID:
      return store.setEuclid(payload);
    case A.RESET_PHRASE:
      return store.resetPhrase();
    case A.SET_SLOW_RENDER:
      return store.setSlowRender(payload);
    case A.SET_BATCH_PAUSED:
      return store.setBatchPaused(payload);
    case A.TOGGLE_FULLSCREEN:
      return store.toggleFullscreen();
    case A.CYCLE_CANVAS_BG:
      return store.cycleCanvasBg();
    case A.ADD_SNAPSHOT:
      return store.addSnapshot(action.snapshot);
    case A.REMOVE_SNAPSHOT:
      return store.removeSnapshot(action.id);
    case A.CLEAR_SNAPSHOTS:
      return store.clearSnapshots();
    case A.SET_EXPORT_RESOLUTION:
      return store.setExportResolution(payload);
    case A.SET_IS_RECORDING:
      return store.setIsRecording(payload);
    case A.SET_IS_RENDERING:
      return store.setIsRendering(payload);
    case A.ADD_FAVORITE:
      return store.addFavorite(action.favorite);
    case A.ADD_KEEP:
      return store.addKeep(action.keep);
    case A.SWAP_STAGE_SLOT:
      return store.swapStageSlot(action.outId, action.inId);
    case A.STAGE_KEEP:
      return store.stageKeep(action.keepId);
    case A.FILL_STAGE:
      return store.fillStage();
    case A.ADD_PASS:
      return store.addPass(action.pass);
    case A.REMOVE_FAVORITE:
      return store.removeFavorite(action.id);
    case A.CLEAR_FAVORITES:
      return store.clearFavorites();
    case A.RECALL_FAVORITE:
      return store.recallFavorite(action.favorite);
    case A.REORDER_FAVORITE:
      return store.reorderFavorite(action.id, action.delta);
    case A.DUPLICATE_FAVORITE:
      return store.duplicateFavorite(action.id);
    case A.MORPH_TO_FAVORITE:
      return store.morphToFavorite(action.favorite);
    case A.SET_MOTION_SMOOTHING:
      return store.setMotionSmoothing(payload);
    case A.STEP_CA_GRID:
      return store.stepCaGrid();
    case A.RESET_CA_GRID:
      return store.resetCaGrid();
    case A.LOAD_PROJECT:
      return store.applyProject(action.project || payload);
    case A.ADD_LAYER:
      return store.addLayer(action.family);
    case A.REMOVE_LAYER:
      return store.removeLayer(action.id);
    case A.SET_ACTIVE_LAYER:
      return store.setActiveLayer(action.id);
    case A.REORDER_LAYER:
      return store.reorderLayer(action.id, action.delta);
    case A.SWAP_LAYER_POSITIONS:
      return store.swapLayerPositions(action.idA, action.idB);
    case A.TOGGLE_LAYER_VISIBLE:
      return store.toggleLayerVisible(action.id);
    case A.TOGGLE_LAYER_FEEDS_ACCUM:
      return store.toggleLayerFeedsAccum(action.id);
    case A.TOGGLE_LAYER_WET_SOAK:
      return store.toggleLayerWetSoak(action.id);
    case A.RENAME_LAYER:
      return store.renameLayer(action.id, action.name);
    case A.SET_LAYER_BLEND_MODE:
      return store.setLayerBlendMode(action.id, action.mode);
    case A.SET_LAYER_OPACITY:
      return store.setLayerOpacity(action.id, action.opacity);
    case 'DUPLICATE_LAYER':
      return store.duplicateLayer(action.id);
    case 'SOLO_LAYER':
      return store.soloLayer(action.id);
    case A.ADD_FX_LAYER:
      return store.addFxLayer(action.family);
    case A.SET_SELECTED_FX_LAYER:
      return store.setSelectedFxLayer(action.id);
    case A.FX_EFFECT_ADD:
      return store.fxEffectAdd(action.layerId, action.kind);
    case A.FX_EFFECT_REMOVE:
      return store.fxEffectRemove(action.layerId, action.index);
    case A.FX_EFFECT_REORDER:
      return store.fxEffectReorder(action.layerId, action.index, action.delta);
    case A.FX_EFFECT_SET_PARAM:
      return store.fxEffectSetParam(action.layerId, action.index, action.key, action.value);
    case A.ADD_MATH_LAYER:
      return store.addMathLayer();
    case A.SET_SELECTED_MATH_LAYER:
      return store.setSelectedMathLayer(action.id);
    case A.MATH_EFFECT_ADD:
      return store.mathEffectAdd(action.layerId, action.kind);
    case A.MATH_EFFECT_REMOVE:
      return store.mathEffectRemove(action.layerId, action.index);
    case A.MATH_EFFECT_REORDER:
      return store.mathEffectReorder(action.layerId, action.index, action.delta);
    case A.MATH_EFFECT_SET_KIND:
      return store.mathEffectSetKind(action.layerId, action.index, action.kind);
    case A.MATH_EFFECT_SET_PARAM:
      return store.mathEffectSetParam(action.layerId, action.index, action.key, action.value);
    case A.MATH_EFFECT_SET_MOD:
      return store.mathEffectSetMod(action.layerId, action.index, action.key, action.mod);
    case A.SAVE_USER_PALETTE:
      return store.saveUserPalette(action.name);
    case A.DELETE_USER_PALETTE:
      return store.deleteUserPalette(action.id);
    case A.RENAME_USER_PALETTE:
      return store.renameUserPalette(action.id, action.name);
    case A.IMPORT_USER_PALETTES:
      return store.importUserPalettes(payload);
    case A.SET_PALETTE_OVERRIDES:
      return store.setPaletteOverrides(action.overrides);
    case A.CLEAR_USER_PALETTES:
      return store.clearUserPalettes();
    case A.TOGGLE_PALETTE_LOCK:
      return store.togglePaletteLock(action.index);
    case A.CLEAR_PALETTE_LOCKS:
      return store.clearPaletteLocks();
    case A.APPLY_HARMONY:
      store.markPaletteChosen();
      return store.applyHarmony(action.scheme); // #1365: the artist chose
    case A.SET_STAGE_MODE:
      return store.setStageMode(action.mode);
    case A.SET_STAGE_BLACKOUT:
      return store.setStageBlackout(action.on);
    case A.SET_STAGE_TEST_PATTERN:
      return store.setStageTestPattern(action.on);
    case A.SET_STAGE_MAPPING:
      return store.setStageMapping(action.mapping);
    case A.SET_STAGE_DISPLAY:
      return store.setStageDisplayId(action.id);
    case A.SET_STAGE_ERROR:
      return store.setStageError(action.message);
    case A.SET_SYPHON_ON:
      return store.setSyphonOn(action.on);
    case A.SET_SYPHON_NAME:
      return store.setSyphonName(action.name);
    case A.SET_CANVAS_SIZE:
      return store.setCanvasSize(action.w, action.h, action.presetId);
    case A.TOGGLE_QUEUE_PLAYING:
      return store.toggleQueuePlaying();
    case A.SET_QUEUE_PLAYING:
      return store.setQueuePlaying(action.on);
    case A.SET_QUEUE_INDEX:
      return store.setQueueIndex(action.index);
    case A.BUMP_QUEUE_JUMP:
      return store.bumpQueueJump();
    case A.SET_QUEUE_SOURCE:
      return store.setQueueSource(action.source);
    case A.SET_QUEUE_SECONDS_PER_HIT:
      return store.setQueueSecondsPerHit(action.seconds);
    case A.SET_QUEUE_BEATS_PER_HIT:
      return store.setQueueBeatsPerHit(action.beats);
    case A.APPLY_CANVAS_PRESET:
      return store.applyCanvasPreset(action.id);
    case A.SAVE_CANVAS_PRESET:
      return store.saveCanvasPreset(action.label);
    case A.DELETE_CANVAS_PRESET:
      return store.deleteCanvasPreset(action.id);
    case A.RENAME_CANVAS_PRESET:
      return store.renameCanvasPreset(action.id, action.label);
    case A.LOAD_USER_CANVAS_PRESETS:
      return store.loadUserCanvasPresets();
    case A.SET_CANVAS_FPS:
      return store.setCanvasFps(action.fps);
    case A.SET_CANVAS_ASPECT_LOCK:
      return store.setCanvasAspectLock(action.on);
    case A.SWAP_CANVAS_ORIENTATION:
      return store.swapCanvasOrientation();
    case A.SET_FXAA:
      return store.setFxaa(action.on);
    case A.SET_WEAVE:
      return store.setWeave(action.on);
    case A.LOAD_VOICE:
      return store.loadVoice(action.id);
    case A.DELETE_USER_VOICE:
      return store.deleteUserVoice(action.id);
    case A.RENAME_USER_VOICE:
      return store.renameUserVoice(action.id, action.name);
    case A.SET_VOICE_MIX_T:
      return store.setVoiceMixT(action.t);
    case A.LOAD_STUB_MODE:
      return store.loadStubMode(action.id);
    case A.LOAD_MOTION:
      return store.loadMotion(action.id);
    case A.LOAD_SHAPE_SET:
      return store.loadShapeSet(action.id);
    case A.CYCLE_SHAPE_LEVEL:
      return store.cycleShapeLevel(action.id);
    case A.LOAD_DICE_CAST:
      return store.loadDiceCast(action.assetIds);
    case A.CLEAR_ROLL_SCOPE:
      return store.clearRollScope();
    case A.SET_PATTERN_MODE:
      return store.setPatternMode(action.id, action.mode);
    case A.SET_PATTERN_PARAM:
      return store.setPatternParam(action.id, action.key, action.value);
    case A.ADD_PATTERN_LAYER:
      return store.addPatternLayer(action.mode);
    case A.SELECT_PATTERN_LAYER:
      return store.selectPatternLayer(action.id);
    case A.SET_LAYER_PATCH:
      return store.setLayerPatch(action.id, action.patch);
    case A.ADD_MATH_MACRO:
      return store.addMathMacro();
    case A.REMOVE_MATH_MACRO:
      return store.removeMathMacro(action.id);
    case A.RENAME_MATH_MACRO:
      return store.renameMathMacro(action.id, action.name);
    case A.APPLY_FEEL:
      return store.applyFeel(action.id);
    case A.SET_LIGHT:
      return store.setLight(action.patch);
    case A.CLEAR_ASSET_ATTACH:
      return store.clearAssetAttach(action.assetId);
    case A.SET_BEAT_BPM:
      return store.setBeatBpm(action.bpm);
    case A.SET_BEAT_METRO:
      return store.setBeatMetro(action.on);
    case A.SET_AUDIO_ROUTES:
      return store.setAudioRoutes(action.routes, action.continuous);
    case A.EDIT_AUDIO_ROUTES:
      return store.editAudioRoutes(action.fn, action.continuous);
    case A.SET_AUDIO_SIDECAR:
      return store.setAudioSidecar(action.sidecar, action.note);
    case A.SET_MIDI_ENABLED:
      return store.setMidiEnabled(action.on);
    case A.SET_STARTUP_MODE:
      return store.setStartupMode(action.mode);
    case A.SET_PROJECT_TITLE:
      return store.setProjectTitle(action.title);
    case A.SET_TASTE_EXPERIMENTAL:
      return store.setTasteExperimental(action.on);
    case A.CLEAR_TASTE:
      return store.clearTaste();
    default:
      console.warn('Unhandled action:', type);
  }
}
