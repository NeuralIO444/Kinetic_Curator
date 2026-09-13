// Wire the event bus into the store dispatch pipe.
// Panels emit typed events; this module translates them to actions.
// Keeps the single telemetry chokepoint intact.
import { on, Events } from './eventBus.js';
import { createDispatchPipe, subscribeDispatch } from './dispatchPipe.js';
import * as A from '../state/actions.js';

let wired = false;

export function wireEventBus(rawDispatch) {
  if (wired) return;
  wired = true;

  const dispatch = createDispatchPipe(rawDispatch);

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
    if (p.toggle) dispatch({ type: A.SET_EVOLVE_MODE, payload: undefined }); // toggle handled by store
    else if (p.bumpSeed) dispatch({ type: A.BUMP_SEED });
    else dispatch({ type: A.TRIGGER_EVOLVE, ...p });
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
    if (fav.action === 'add') {
      // ADD_FAVORITE with current seed/config is handled by a dedicated path;
      // for now emit a marker the store can pick up, or dispatch directly.
      dispatch({ type: A.ADD_FAVORITE, favorite: fav.favorite ?? fav });
    } else if (fav.action === 'recall') {
      dispatch({ type: A.RECALL_FAVORITE, favorite: fav.favorite });
    }
  });
  on(Events.DAVIS_FAVORITE_REMOVE, ({ index }) =>
    dispatch({ type: A.REMOVE_FAVORITE, index }));

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

  on(Events.EXPORT_SNAPSHOT, () =>
    dispatch({ type: A.ADD_SNAPSHOT }));
  on(Events.EXPORT_RECORD, (recording) =>
    dispatch({ type: A.SET_IS_RECORDING, payload: recording }));

  return dispatch;
}
