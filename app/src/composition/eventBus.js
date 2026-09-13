// Typed event bus — panels emit, shell/store subscribes.
// This is the decoupling layer: panels no longer import the store or receive onDispatch.
// Every emit still flows through the dispatch pipe observers (telemetry chokepoint).

const listeners = new Map(); // event -> Set<fn>

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

// Domain namespaces for clarity
export const Events = {
  DAVIS_EVOLVE: 'davis:evolve',
  DAVIS_MORPH: 'davis:morph',
  DAVIS_PHRASE: 'davis:phrase',
  DAVIS_FAVORITE: 'davis:favorite',
  LAYOUT_PARAM: 'layout:param',
  LAYOUT_PRESET: 'layout:preset',
  LAYOUT_LOCK: 'layout:lock',
  LAYOUT_RANDOMIZE: 'layout:randomize',
  AUDIO_TOGGLE: 'audio:toggle',
  EXPORT_SNAPSHOT: 'export:snapshot',
  EXPORT_RECORD: 'export:record',
};
