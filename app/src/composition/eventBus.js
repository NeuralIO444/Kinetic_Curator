// Typed event bus — panels emit, shell/store subscribes.
const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => {
    const set = listeners.get(event);
    if (set) {
      set.delete(fn);
      if (set.size === 0) listeners.delete(event);
    }
  };
}

export function off(event, fn) {
  const set = listeners.get(event);
  if (set) {
    set.delete(fn);
    if (set.size === 0) listeners.delete(event);
  }
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const fn of set) {
    try { fn(payload); } catch (e) { console.error('[eventBus]', event, e); }
  }
}

export function once(event, fn) {
  const wrap = (p) => { off(event, wrap); fn(p); };
  on(event, wrap);
}

export const Events = {
  DAVIS_EVOLVE: 'davis:evolve',
  DAVIS_MORPH: 'davis:morph',
  DAVIS_MORPH_DURATION: 'davis:morphDuration',
  DAVIS_PHRASE: 'davis:phrase',
  DAVIS_RESET_PHRASE: 'davis:resetPhrase',
  DAVIS_FAVORITE: 'davis:favorite',
  DAVIS_FAVORITE_REMOVE: 'davis:favoriteRemove',
  LAYOUT_PARAM: 'layout:param',
  LAYOUT_PRESET: 'layout:preset',
  LAYOUT_LOCK: 'layout:lock',
  LAYOUT_RANDOMIZE: 'layout:randomize',
  AUDIO_TOGGLE: 'audio:toggle',
  AUDIO_GAIN: 'audio:gain',
  AUDIO_SOURCE: 'audio:source',
  AUDIO_MONITOR: 'audio:monitor',
  WEBCAM_TOGGLE: 'webcam:toggle',
  ASSETS_TOGGLE: 'assets:toggle',
  ASSETS_SOLO: 'assets:solo',
  ASSETS_TOGGLE_ALL: 'assets:toggleAll',
  ASSETS_SEARCH: 'assets:search',
  ASSETS_CAT_FILTER: 'assets:catFilter',
  ASSETS_POOL_VIEW: 'assets:poolView',
  ASSETS_WEIGHT_CYCLE: 'assets:weightCycle',
  ASSETS_WEIGHT_SET: 'assets:weightSet',
  ASSETS_CATEGORY_WEIGHT: 'assets:categoryWeight',
  ASSETS_WEIGHT_CLEAR: 'assets:weightClear',
  ASSETS_DUPLICATE: 'assets:duplicate',
  ASSETS_INGEST: 'assets:ingest',
  EXPORT_SNAPSHOT: 'export:snapshot',
  EXPORT_RECORD: 'export:record',
  EXPORT_RESOLUTION: 'export:resolution',
  EXPORT_CLEAR_SNAPSHOTS: 'export:clearSnapshots',
  EXPORT_QUALITY: 'export:quality',
  EXPORT_AUTO_QUALITY: 'export:autoQuality',
  EXPORT_SEED: 'export:seed',
  EXPORT_PALETTE: 'export:palette',
  EXPORT_IMPORT_LAYOUT: 'export:importLayout',
  EXPORT_LOAD_PROJECT: 'export:loadProject',
  LAYER_ADD: 'layer:add',
  LAYER_REMOVE: 'layer:remove',
  LAYER_SET_ACTIVE: 'layer:setActive',
  LAYER_REORDER: 'layer:reorder',
  LAYER_TOGGLE_VISIBLE: 'layer:toggleVisible',
  LAYER_RENAME: 'layer:rename',
  LAYER_SET_BLEND_MODE: 'layer:setBlendMode',
  LAYER_SET_OPACITY: 'layer:setOpacity',
  PALETTE_SAVE: 'palette:save',
  PALETTE_DELETE: 'palette:delete',
  PALETTE_RENAME: 'palette:rename',
  PALETTE_IMPORT: 'palette:import',
  PALETTE_CLEAR_LIBRARY: 'palette:clearLibrary',
  PALETTE_LOCK: 'palette:lock',
  PALETTE_HARMONY: 'palette:harmony',
};
