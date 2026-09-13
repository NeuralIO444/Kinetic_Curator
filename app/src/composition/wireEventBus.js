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

  on(Events.DAVIS_EVOLVE, (p) =>
    dispatch({ type: A.TRIGGER_EVOLVE, ...p }));
  on(Events.DAVIS_MORPH, (p) =>
    dispatch({ type: A.SET_MORPH_EVOLVE, payload: p.enabled ?? p.morphEvolve }));
  on(Events.DAVIS_PHRASE, (p) => {
    if (p.enabled !== undefined) dispatch({ type: A.SET_PHRASE_ENABLED, payload: p.enabled });
    if (p.length !== undefined) dispatch({ type: A.SET_PHRASE_LENGTH, payload: p.length });
    if (p.mode !== undefined) dispatch({ type: A.SET_PHRASE_MODE, payload: p.mode });
    if (p.reset) dispatch({ type: A.RESET_PHRASE });
  });
  on(Events.DAVIS_FAVORITE, (fav) =>
    dispatch({ type: A.ADD_FAVORITE, favorite: fav }));

  on(Events.AUDIO_TOGGLE, (enabled) =>
    dispatch({ type: A.SET_AUDIO_ENABLED, payload: enabled }));
  on(Events.EXPORT_SNAPSHOT, () =>
    dispatch({ type: A.ADD_SNAPSHOT }));
  on(Events.EXPORT_RECORD, (recording) =>
    dispatch({ type: A.SET_IS_RECORDING, payload: recording }));

  return dispatch;
}
