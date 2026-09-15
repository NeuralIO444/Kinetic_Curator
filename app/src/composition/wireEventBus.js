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

  on(Events.LAYOUT_PARAM, ({ key, value }) =>
    dispatch({ type: A.SET_LAYOUT_PARAM, key, value }));
  on(Events.LAYOUT_PRESET, (preset) =>
    dispatch({ type: A.APPLY_PRESET, preset }));
  on(Events.LAYOUT_LOCK, ({ key }) =>
    dispatch({ type: A.TOGGLE_PARAM_LOCK, key }));
  on(Events.LAYOUT_RANDOMIZE, (p) =>
    dispatch(p.type === 'unlocked'
      ? { type: A.RANDOMIZE_UNLOCKED }
      : { type: A.RANDOMIZE_PARAM, key: p.key }));

  on(Events.DAVIS_EVOLVE, (p) => {
    if (p.mode !== undefined) return dispatch({ type: A.SET_EVOLVE_MODE, payload: !!p.mode });
    if (p.toggle) return dispatch({ type: A.SET_EVOLVE_MODE, payload: (m) => !m });
    if (p.bumpSeed) return dispatch({ type: A.BUMP_SEED });
    if (p.target !== undefined) return dispatch({ type: A.SET_EVOLVE_TARGET, payload: p.target });
    if (p.source !== undefined) return dispatch({ type: A.SET_EVOLVE_SOURCE, payload: p.source });
    if (p.interval !== undefined) return dispatch({ type: A.SET_EVOLVE_INTERVAL, payload: p.interval });
    if (p.autoSnapshot !== undefined) return dispatch({ type: A.SET_AUTO_SNAPSHOT, payload: p.autoSnapshot });
    if (p.motionSmoothing !== undefined) return dispatch({ type: A.SET_MOTION_SMOOTHING, payload: p.motionSmoothing });
    return dispatch({ type: A.TRIGGER_EVOLVE });
  });
  on(Events.DAVIS_MORPH, (p) =>
    dispatch({ type: A.SET_MORPH_EVOLVE, payload: p.enabled ?? p.morphEvolve }));
  on(Events.DAVIS_MORPH_DURATION, (p) =>
    dispatch({ type: A.SET_MORPH_DURATION, payload: p.duration }));
  on(Events.DAVIS_PHRASE, (p) => {
    if (p.enabled !== undefined) dispatch({ type: A.SET_PHRASE_ENABLED, payload: p.enabled });
    if (p.length !== undefined) dispatch({ type: A.SET_PHRASE_LENGTH, payload: p.length });
    if (p.mode !== undefined) dispatch({ type: A.SET_PHRASE_MODE, payload: p.mode });
  });
  on(Events.DAVIS_RESET_PHRASE, () =>
    dispatch({ type: A.RESET_PHRASE }));
  on(Events.DAVIS_FAVORITE, (fav) => {
    if (fav.action === 'recall') return dispatch({ type: A.RECALL_FAVORITE, favorite: fav.favorite });
    if (fav.action === 'add' && fav.favorite) return dispatch({ type: A.ADD_FAVORITE, favorite: fav.favorite });
  });
  on(Events.DAVIS_FAVORITE_REMOVE, ({ id }) =>
    dispatch({ type: A.REMOVE_FAVORITE, id }));

  on(Events.AUDIO_TOGGLE, (enabled) =>
    dispatch({ type: A.SET_AUDIO_ENABLED, payload: enabled }));
  on(Events.AUDIO_GAIN, (gain) =>
    dispatch({ type: A.SET_AUDIO_GAIN, payload: gain }));
  on(Events.AUDIO_SOURCE, (src) =>
    dispatch({ type: A.SET_AUDIO_SOURCE, payload: src }));
  on(Events.AUDIO_MONITOR, (mon) =>
    dispatch({ type: A.SET_AUDIO_MONITOR, payload: mon }));
  on(Events.WEBCAM_TOGGLE, (enabled) =>
    dispatch({ type: A.SET_WEBCAM_ENABLED, payload: enabled }));

  on(Events.ASSETS_TOGGLE, ({ id }) =>
    dispatch({ type: A.TOGGLE_ASSET, id }));
  on(Events.ASSETS_SOLO, ({ id }) =>
    dispatch({ type: A.SOLO_ASSET, id }));
  on(Events.ASSETS_TOGGLE_ALL, (on) =>
    dispatch({ type: A.TOGGLE_ALL_ASSETS, payload: on }));
  on(Events.ASSETS_SEARCH, (q) =>
    dispatch({ type: A.SET_SEARCH, payload: q }));
  on(Events.ASSETS_CAT_FILTER, (cat) =>
    dispatch({ type: A.SET_CAT_FILTER, payload: cat }));
  on(Events.ASSETS_POOL_VIEW, (view) =>
    dispatch({ type: A.SET_POOL_VIEW, payload: view }));

  on(Events.EXPORT_RECORD, (recording) =>
    dispatch({ type: A.SET_IS_RECORDING, payload: recording }));
  on(Events.EXPORT_RESOLUTION, (res) =>
    dispatch({ type: A.SET_EXPORT_RESOLUTION, payload: res }));
  on(Events.EXPORT_CLEAR_SNAPSHOTS, () =>
    dispatch({ type: A.CLEAR_SNAPSHOTS }));
  on(Events.EXPORT_QUALITY, (q) =>
    dispatch({ type: A.SET_QUALITY, payload: q }));
  on(Events.EXPORT_AUTO_QUALITY, (on) =>
    dispatch({ type: A.SET_AUTO_QUALITY, payload: on }));
  on(Events.EXPORT_SNAPSHOT, (snapshot) =>
    dispatch({ type: A.ADD_SNAPSHOT, snapshot }));
  on(Events.EXPORT_SEED, (seed) =>
    dispatch({ type: A.SET_SEED, payload: seed }));
  on(Events.EXPORT_PALETTE, (id) =>
    dispatch({ type: A.SET_PALETTE_ID, payload: id }));
  on(Events.EXPORT_IMPORT_LAYOUT, (preset) =>
    dispatch({ type: A.APPLY_PRESET, preset }));

  return dispatch;
}
