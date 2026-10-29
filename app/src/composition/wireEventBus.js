// Wire the event bus into the store dispatch pipe.
import { on, Events } from './eventBus.js';
import { createDispatchPipe } from './dispatchPipe.js';
import * as A from '../state/actions.js';

let wired = false;
let pipedDispatch = null;

export function wireEventBus(rawDispatch) {
  if (wired && pipedDispatch) return pipedDispatch;
  wired = true;
  const dispatch = createDispatchPipe(rawDispatch);
  pipedDispatch = dispatch;

  on(Events.LAYOUT_PARAM, ({ key, value }) => dispatch({ type: A.SET_LAYOUT_PARAM, key, value }));
  on(Events.LAYOUT_PRESET, (preset) => dispatch({ type: A.APPLY_PRESET, preset }));
  on(Events.LAYOUT_LOCK, ({ key }) => dispatch({ type: A.TOGGLE_PARAM_LOCK, key }));
  on(Events.LAYOUT_CURATE, () => dispatch({ type: A.CURATE_UNLOCKED }));

  on(Events.DAVIS_EVOLVE, (p) => {
    if (p.mode !== undefined) return dispatch({ type: A.SET_EVOLVE_MODE, payload: !!p.mode });
    if (p.toggle) return dispatch({ type: A.SET_EVOLVE_MODE, payload: (m) => !m });
    if (p.bumpSeed) return dispatch({ type: A.BUMP_SEED });
    if (p.target !== undefined) return dispatch({ type: A.SET_EVOLVE_TARGET, payload: p.target });
    if (p.source !== undefined) return dispatch({ type: A.SET_EVOLVE_SOURCE, payload: p.source });
    if (p.interval !== undefined) return dispatch({ type: A.SET_EVOLVE_INTERVAL, payload: p.interval });
    if (p.autoSnapshot !== undefined) return dispatch({ type: A.SET_AUTO_SNAPSHOT, payload: p.autoSnapshot });
    if (p.beatRoute !== undefined) return dispatch({ type: A.SET_BEAT_ROUTE, payload: p.beatRoute });
    if (p.motionSmoothing !== undefined) return dispatch({ type: A.SET_MOTION_SMOOTHING, payload: p.motionSmoothing });
    return dispatch({ type: A.TRIGGER_EVOLVE });
  });
  on(Events.DAVIS_MORPH, (p) => dispatch({ type: A.SET_MORPH_EVOLVE, payload: p.enabled ?? p.morphEvolve }));
  on(Events.DAVIS_MORPH_DURATION, (p) => dispatch({ type: A.SET_MORPH_DURATION, payload: p.duration }));
  on(Events.DAVIS_PHRASE, (p) => {
    if (p.enabled !== undefined) dispatch({ type: A.SET_PHRASE_ENABLED, payload: p.enabled });
    if (p.length !== undefined) dispatch({ type: A.SET_PHRASE_LENGTH, payload: p.length });
    if (p.mode !== undefined) dispatch({ type: A.SET_PHRASE_MODE, payload: p.mode });
    if (p.clock !== undefined) dispatch({ type: A.SET_PHRASE_CLOCK, payload: p.clock });
    if (p.bpm !== undefined) dispatch({ type: A.SET_PHRASE_BPM, payload: p.bpm });
    if (p.euclid !== undefined) dispatch({ type: A.SET_EUCLID, payload: p.euclid });
  });
  on(Events.DAVIS_RESET_PHRASE, () => dispatch({ type: A.RESET_PHRASE }));
  on(Events.DAVIS_MUTATE_STREAM, (p) =>
    dispatch(p && p.reset ? { type: A.RESET_SEED_OFFSETS } : { type: A.MUTATE_SEED_OFFSET, group: p && p.group }),
  );
  on(Events.CANVAS_BG_CYCLE, () => dispatch({ type: A.CYCLE_CANVAS_BG })); // #310: BG cycle moved to OUTPUT
  on(Events.DAVIS_FAVORITE, (fav) => {
    if (fav.action === 'recall') return dispatch({ type: A.RECALL_FAVORITE, favorite: fav.favorite });
    if (fav.action === 'add' && fav.favorite) return dispatch({ type: A.ADD_FAVORITE, favorite: fav.favorite });
    if (fav.action === 'morph' && fav.favorite) return dispatch({ type: A.MORPH_TO_FAVORITE, favorite: fav.favorite });
    if (fav.action === 'duplicate' && fav.id) return dispatch({ type: A.DUPLICATE_FAVORITE, id: fav.id });
    if (fav.action === 'reorder' && fav.id)
      return dispatch({ type: A.REORDER_FAVORITE, id: fav.id, delta: fav.delta || 0 });
    if (fav.action === 'clear') return dispatch({ type: A.CLEAR_FAVORITES });
  });
  on(Events.DAVIS_FAVORITE_REMOVE, ({ id }) => dispatch({ type: A.REMOVE_FAVORITE, id }));

  on(Events.AUDIO_TOGGLE, (enabled) => dispatch({ type: A.SET_AUDIO_ENABLED, payload: enabled }));
  on(Events.AUDIO_GAIN, (gain) => dispatch({ type: A.SET_AUDIO_GAIN, payload: gain }));
  on(Events.AUDIO_SOURCE, (src) => dispatch({ type: A.SET_AUDIO_SOURCE, payload: src }));
  on(Events.AUDIO_MONITOR, (mon) => dispatch({ type: A.SET_AUDIO_MONITOR, payload: mon }));

  on(Events.ASSETS_TOGGLE, ({ id }) => dispatch({ type: A.TOGGLE_ASSET, id }));
  on(Events.ASSETS_SOLO, ({ id }) => dispatch({ type: A.SOLO_ASSET, id }));
  on(Events.ASSETS_TOGGLE_ALL, (on) => dispatch({ type: A.TOGGLE_ALL_ASSETS, payload: on }));
  on(Events.ASSETS_SEARCH, (q) => dispatch({ type: A.SET_SEARCH, payload: q }));
  on(Events.ASSETS_CAT_FILTER, (cat) => dispatch({ type: A.SET_CAT_FILTER, payload: cat }));
  on(Events.ASSETS_WEIGHT_CYCLE, ({ id }) => dispatch({ type: 'CYCLE_ASSET_WEIGHT', id }));
  on(Events.ASSETS_OPTION_CYCLE, ({ id, key }) => dispatch({ type: 'CYCLE_ASSET_OPTION', id, key })); // #1694 S2
  on(Events.ASSETS_STILL_TOGGLE, ({ id }) => dispatch({ type: 'TOGGLE_ASSET_STILL', id })); // #1128
  on(Events.ASSETS_WEIGHT_SET, ({ id, weight }) => dispatch({ type: A.SET_ASSET_WEIGHT, id, weight }));
  on(Events.ASSETS_CATEGORY_WEIGHT, ({ category, weight }) =>
    dispatch({ type: A.SET_CATEGORY_WEIGHT, category, weight }),
  );
  on(Events.ASSETS_WEIGHT_CLEAR, () => dispatch({ type: A.CLEAR_WEIGHT_OVERRIDES }));
  on(Events.ASSETS_DUPLICATE, ({ id }) => dispatch({ type: 'DUPLICATE_ASSET', id }));
  on(Events.ASSETS_INGEST, ({ svg, hint, category, source }) =>
    dispatch({ type: 'INGEST_ASSET', svg, hint, category, source }),
  );
  on(Events.ASSETS_REMOVE, ({ id }) => dispatch({ type: 'REMOVE_CUSTOM_ASSET', id }));
  on(Events.ASSETS_RENAME, ({ id, name }) => dispatch({ type: 'RENAME_CUSTOM_ASSET', id, name }));
  on(Events.ASSETS_REPLACE, ({ id, svg }) => dispatch({ type: 'REPLACE_CUSTOM_ASSET', id, svg }));
  on(Events.ASSETS_REGION_SLOT, ({ id, slot, regionId }) =>
    dispatch({ type: 'SET_ASSET_REGION_SLOT', id, slot, regionId }),
  );
  on(Events.ASSETS_REGION_KINEME, ({ id, regionId, value }) =>
    dispatch({ type: 'SET_ASSET_REGION_KINEME', id, regionId, value }),
  ); // #1434

  on(Events.EXPORT_RECORD, (recording) => dispatch({ type: A.SET_IS_RECORDING, payload: recording }));
  on(Events.EXPORT_RENDERING, (rendering) => dispatch({ type: A.SET_IS_RENDERING, payload: rendering }));
  on(Events.EXPORT_BATCH_PAUSE, (paused) => dispatch({ type: A.SET_BATCH_PAUSED, payload: paused }));
  on(Events.EXPORT_RESOLUTION, (res) => dispatch({ type: A.SET_EXPORT_RESOLUTION, payload: res }));
  on(Events.EXPORT_CLEAR_SNAPSHOTS, () => dispatch({ type: A.CLEAR_SNAPSHOTS }));
  on(Events.EXPORT_QUALITY, (q) => dispatch({ type: A.SET_QUALITY, payload: q }));
  on(Events.EXPORT_AUTO_QUALITY, (on) => dispatch({ type: A.SET_AUTO_QUALITY, payload: on }));
  on(Events.EXPORT_SNAPSHOT, (snapshot) => dispatch({ type: A.ADD_SNAPSHOT, snapshot }));
  on(Events.EXPORT_SEED, (seed) => dispatch({ type: A.SET_SEED, payload: seed }));
  on(Events.EXPORT_LOAD_PROJECT, (project) => dispatch({ type: A.LOAD_PROJECT, project }));

  on(Events.LAYER_ADD, (p) => dispatch({ type: A.ADD_LAYER, family: p?.family }));
  on(Events.LAYER_REMOVE, ({ id }) => dispatch({ type: A.REMOVE_LAYER, id }));
  on(Events.LAYER_SET_ACTIVE, ({ id }) => dispatch({ type: A.SET_ACTIVE_LAYER, id }));
  on(Events.LAYER_SWAP_POSITIONS, ({ idA, idB }) => dispatch({ type: A.SWAP_LAYER_POSITIONS, idA, idB }));
  on(Events.LAYER_TOGGLE_VISIBLE, ({ id }) => dispatch({ type: A.TOGGLE_LAYER_VISIBLE, id }));
  on(Events.LAYER_TOGGLE_FEEDS_ACCUM, ({ id }) => dispatch({ type: A.TOGGLE_LAYER_FEEDS_ACCUM, id }));
  on(Events.LAYER_SET_BLEND_MODE, ({ id, mode }) => dispatch({ type: A.SET_LAYER_BLEND_MODE, id, mode }));
  on(Events.LAYER_SET_OPACITY, ({ id, opacity }) => dispatch({ type: A.SET_LAYER_OPACITY, id, opacity }));
  on(Events.LAYER_DUPLICATE, ({ id }) => dispatch({ type: 'DUPLICATE_LAYER', id }));
  on(Events.LAYER_SOLO, ({ id }) => dispatch({ type: 'SOLO_LAYER', id }));
  on(Events.LAYER_ADD_FX, (p) => dispatch({ type: A.ADD_FX_LAYER, family: p?.family }));
  on(Events.FX_SELECT, ({ id }) => dispatch({ type: A.SET_SELECTED_FX_LAYER, id }));
  on(Events.FX_EFFECT_ADD, ({ layerId, kind }) => dispatch({ type: A.FX_EFFECT_ADD, layerId, kind }));
  on(Events.FX_EFFECT_REMOVE, ({ layerId, index }) => dispatch({ type: A.FX_EFFECT_REMOVE, layerId, index }));
  on(Events.FX_EFFECT_SET_PARAM, ({ layerId, index, key, value }) =>
    dispatch({ type: A.FX_EFFECT_SET_PARAM, layerId, index, key, value }),
  );
  on(Events.LAYER_ADD_MATH, () => dispatch({ type: A.ADD_MATH_LAYER }));
  on(Events.MATH_SELECT, ({ id }) => dispatch({ type: A.SET_SELECTED_MATH_LAYER, id }));
  on(Events.MATH_EFFECT_ADD, ({ layerId, kind }) => dispatch({ type: A.MATH_EFFECT_ADD, layerId, kind }));
  on(Events.MATH_EFFECT_REMOVE, ({ layerId, index }) => dispatch({ type: A.MATH_EFFECT_REMOVE, layerId, index }));
  on(Events.MATH_EFFECT_REORDER, ({ layerId, index, delta }) =>
    dispatch({ type: A.MATH_EFFECT_REORDER, layerId, index, delta }),
  );
  on(Events.MATH_EFFECT_SET_KIND, ({ layerId, index, kind }) =>
    dispatch({ type: A.MATH_EFFECT_SET_KIND, layerId, index, kind }),
  );
  on(Events.MATH_EFFECT_SET_PARAM, ({ layerId, index, key, value }) =>
    dispatch({ type: A.MATH_EFFECT_SET_PARAM, layerId, index, key, value }),
  );
  on(Events.MATH_EFFECT_SET_MOD, ({ layerId, index, key, mod }) =>
    dispatch({ type: A.MATH_EFFECT_SET_MOD, layerId, index, key, mod }),
  );

  on(Events.PALETTE_SAVE, ({ name } = {}) => dispatch({ type: A.SAVE_USER_PALETTE, name }));
  on(Events.PALETTE_DELETE, ({ id }) => dispatch({ type: A.DELETE_USER_PALETTE, id }));
  on(Events.PALETTE_SET_ID, ({ id }) => dispatch({ type: A.SET_PALETTE_ID, payload: id }));
  on(Events.PALETTE_SWATCH, ({ index, hex }) => dispatch({ type: A.SET_PALETTE_SWATCH, index, hex }));
  on(Events.PALETTE_BG, ({ hex }) => dispatch({ type: A.SET_PALETTE_BG, payload: hex }));
  on(Events.PALETTE_INK, ({ hex }) => dispatch({ type: A.SET_PALETTE_INK, payload: hex }));
  on(Events.PALETTE_OVERRIDES, (overrides) => dispatch({ type: A.SET_PALETTE_OVERRIDES, overrides }));
  on(Events.PALETTE_CLEAR_OVERRIDES, () => dispatch({ type: A.CLEAR_PALETTE_OVERRIDES }));
  on(Events.PALETTE_COLOR_MODE, ({ mode }) => dispatch({ type: A.SET_COLOR_MODE, payload: mode }));
  on(Events.RUN_SET, ({ running }) => dispatch({ type: A.SET_RUNNING, payload: !!running }));
  on(Events.PALETTE_IMPORT, (list) => dispatch({ type: A.IMPORT_USER_PALETTES, payload: list }));
  on(Events.PALETTE_LOCK, ({ index, clear }) =>
    dispatch(clear ? { type: A.CLEAR_PALETTE_LOCKS } : { type: A.TOGGLE_PALETTE_LOCK, index }),
  );
  on(Events.PALETTE_HARMONY, ({ scheme }) => dispatch({ type: A.APPLY_HARMONY, scheme }));
  on(Events.VIEW_FULLSCREEN, () => dispatch({ type: A.TOGGLE_FULLSCREEN }));
  on(Events.STAGE_MODE, (p = {}) => dispatch({ type: A.SET_STAGE_MODE, mode: p.mode }));
  on(Events.STAGE_BLACKOUT, (p = {}) => dispatch({ type: A.SET_STAGE_BLACKOUT, on: p.on }));
  on(Events.STAGE_TEST_PATTERN, (p = {}) => dispatch({ type: A.SET_STAGE_TEST_PATTERN, on: p.on }));
  on(Events.STAGE_MAPPING, (p = {}) => dispatch({ type: A.SET_STAGE_MAPPING, mapping: p.mapping }));
  on(Events.STAGE_DISPLAY, (p = {}) => dispatch({ type: A.SET_STAGE_DISPLAY, id: p.id }));
  on(Events.STAGE_ERROR, (p = {}) => dispatch({ type: A.SET_STAGE_ERROR, message: p.message }));
  on(Events.STAGE_SYPHON_ON, (p = {}) => dispatch({ type: A.SET_SYPHON_ON, on: p.on }));
  on(Events.STAGE_SYPHON_NAME, (p = {}) => dispatch({ type: A.SET_SYPHON_NAME, name: p.name }));
  on(Events.CANVAS_SIZE, (p = {}) => dispatch({ type: A.SET_CANVAS_SIZE, w: p.w, h: p.h, presetId: p.presetId }));
  on(Events.QUEUE_TOGGLE, () => dispatch({ type: A.TOGGLE_QUEUE_PLAYING }));
  on(Events.QUEUE_PLAYING, (p = {}) => dispatch({ type: A.SET_QUEUE_PLAYING, on: p.on }));
  on(Events.QUEUE_INDEX, (p = {}) => dispatch({ type: A.SET_QUEUE_INDEX, index: p.index }));
  on(Events.QUEUE_JUMP, () => dispatch({ type: A.BUMP_QUEUE_JUMP }));
  on(Events.QUEUE_SOURCE, (p = {}) => dispatch({ type: A.SET_QUEUE_SOURCE, source: p.source }));
  on(Events.QUEUE_SECONDS, (p = {}) => dispatch({ type: A.SET_QUEUE_SECONDS_PER_HIT, seconds: p.seconds }));
  on(Events.QUEUE_BEATS, (p = {}) => dispatch({ type: A.SET_QUEUE_BEATS_PER_HIT, beats: p.beats }));
  on(Events.CANVAS_PRESET, (p = {}) => dispatch({ type: A.APPLY_CANVAS_PRESET, id: p.id }));
  on(Events.CANVAS_PRESET_SAVE, (p = {}) => dispatch({ type: A.SAVE_CANVAS_PRESET, label: p.label }));
  on(Events.CANVAS_PRESET_DELETE, (p = {}) => dispatch({ type: A.DELETE_CANVAS_PRESET, id: p.id }));
  on(Events.CANVAS_PRESET_RENAME, (p = {}) => dispatch({ type: A.RENAME_CANVAS_PRESET, id: p.id, label: p.label }));
  on(Events.CANVAS_PRESETS_LOAD, () => dispatch({ type: A.LOAD_USER_CANVAS_PRESETS }));
  on(Events.CANVAS_FPS, (p = {}) => dispatch({ type: A.SET_CANVAS_FPS, fps: p.fps }));
  on(Events.CANVAS_ASPECT_LOCK, (p = {}) => dispatch({ type: A.SET_CANVAS_ASPECT_LOCK, on: p.on }));
  on(Events.CANVAS_SWAP, () => dispatch({ type: A.SWAP_CANVAS_ORIENTATION }));
  on(Events.DISPLAY_FXAA, (p = {}) => dispatch({ type: A.SET_FXAA, on: p.on }));
  on(Events.DISPLAY_WEAVE, (p = {}) => dispatch({ type: A.SET_WEAVE, on: p.on }));
  on(Events.VOICE_LOAD, (p = {}) => dispatch({ type: A.LOAD_VOICE, id: p.id }));
  on(Events.VOICE_DELETE, (p = {}) => dispatch({ type: A.DELETE_USER_VOICE, id: p.id }));
  on(Events.VOICE_RENAME, (p = {}) => dispatch({ type: A.RENAME_USER_VOICE, id: p.id, name: p.name }));
  on(Events.VOICE_MIX, (p = {}) => dispatch({ type: A.SET_VOICE_MIX_T, t: p.t }));
  on(Events.MODE_LOAD, (p = {}) => dispatch({ type: A.LOAD_STUB_MODE, id: p.id }));
  on(Events.MOTION_LOAD, (p = {}) => dispatch({ type: A.LOAD_MOTION, id: p.id }));
  on(Events.SHAPES_LOAD, (p = {}) => dispatch({ type: A.LOAD_SHAPE_SET, id: p.id }));
  on(Events.SHAPES_CYCLE, (p = {}) => dispatch({ type: A.CYCLE_SHAPE_LEVEL, id: p.id }));
  on(Events.DICE_CAST, (p = {}) => dispatch({ type: A.LOAD_DICE_CAST, assetIds: p.assetIds }));
  on(Events.KEEP_ADD, (p = {}) => dispatch({ type: A.ADD_KEEP, keep: p.keep }));
  on(Events.ROLL_SCOPE_CLEAR, () => dispatch({ type: A.CLEAR_ROLL_SCOPE }));
  on(Events.PATTERN_MODE, (p = {}) => dispatch({ type: A.SET_PATTERN_MODE, id: p.id, mode: p.mode }));
  on(Events.PATTERN_PARAM, (p = {}) => dispatch({ type: A.SET_PATTERN_PARAM, id: p.id, key: p.key, value: p.value }));
  on(Events.PATTERN_ADD, (p = {}) => dispatch({ type: A.ADD_PATTERN_LAYER, mode: p.mode }));
  on(Events.PATTERN_SELECT, (p = {}) => dispatch({ type: A.SELECT_PATTERN_LAYER, id: p.id }));
  on(Events.LAYER_PATCH, (p = {}) => dispatch({ type: A.SET_LAYER_PATCH, id: p.id, patch: p.patch }));
  on(Events.MACRO_ADD, () => dispatch({ type: A.ADD_MATH_MACRO }));
  on(Events.MACRO_REMOVE, (p = {}) => dispatch({ type: A.REMOVE_MATH_MACRO, id: p.id }));
  on(Events.MACRO_RENAME, (p = {}) => dispatch({ type: A.RENAME_MATH_MACRO, id: p.id, name: p.name }));
  on(Events.FEEL_APPLY, (p = {}) => dispatch({ type: A.APPLY_FEEL, id: p.id }));
  on(Events.LIGHT_SET, (patch) => dispatch({ type: A.SET_LIGHT, patch }));
  on(Events.ATTACH_CLEAR, (p = {}) => dispatch({ type: A.CLEAR_ASSET_ATTACH, assetId: p.assetId }));
  on(Events.BEAT_BPM, (p = {}) => dispatch({ type: A.SET_BEAT_BPM, bpm: p.bpm }));
  on(Events.BEAT_METRO, (p = {}) => dispatch({ type: A.SET_BEAT_METRO, on: p.on }));
  on(Events.AUDIO_ROUTES_SET, (p = {}) =>
    dispatch({ type: A.SET_AUDIO_ROUTES, routes: p.routes, continuous: !!p.continuous }),
  );
  on(Events.AUDIO_ROUTES_EDIT, (p = {}) =>
    dispatch({ type: A.EDIT_AUDIO_ROUTES, fn: p.fn, continuous: !!p.continuous }),
  );
  on(Events.AUDIO_SIDECAR, (p = {}) => dispatch({ type: A.SET_AUDIO_SIDECAR, sidecar: p.sidecar, note: p.note }));
  on(Events.MIDI_ENABLED, (p = {}) => dispatch({ type: A.SET_MIDI_ENABLED, on: p.on }));
  on(Events.STARTUP_MODE, (p = {}) => dispatch({ type: A.SET_STARTUP_MODE, mode: p.mode }));
  on(Events.PROJECT_TITLE, (p = {}) => dispatch({ type: A.SET_PROJECT_TITLE, title: p.title }));
  on(Events.TASTE_EXPERIMENTAL, (p = {}) => dispatch({ type: A.SET_TASTE_EXPERIMENTAL, on: p.on }));
  on(Events.TASTE_CLEAR, () => dispatch({ type: A.CLEAR_TASTE }));

  return dispatch;
}
