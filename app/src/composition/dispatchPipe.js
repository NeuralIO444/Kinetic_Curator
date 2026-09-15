// Single onDispatch pipe — the chokepoint.
// Every panel action flows through here: coalesce, observe, route.
// This is also where telemetry / rate-limiting / future remote-control hooks in.
//
// Coalescing contract: high-frequency actions are collapsed to at most one
// per animation frame PER TARGET (type + key), and are ALWAYS delivered.
// Nothing is ever dropped.

const observers = new Set();

let sink = null;
let rafId = null;
let pending = new Map();

// Only genuinely continuous streams get coalesced. One-shot toggles
// (SET_AUDIO_ENABLED / SOURCE / MONITOR) must pass through untouched.
const HIGH_FREQ = /^SET_LAYOUT_PARAMS?$|^SET_AUDIO_(STIMULUS|BANDS|GAIN)$|^SET_BEAT_PULSE$/;

export function subscribeDispatch(fn) {
  observers.add(fn);
  return () => observers.delete(fn);
}

function notify(action) {
  for (const fn of observers) {
    try { fn(action); } catch (e) { console.error('[dispatchPipe] observer error', e); }
  }
}

function flush() {
  rafId = null;
  if (pending.size === 0) return;
  const batch = pending;
  pending = new Map();
  for (const action of batch.values()) {
    try { sink?.(action); } catch (e) { console.error('[dispatchPipe] dispatch error', e); }
  }
}

/**
 * Wrap a store dispatch so every action passes through one pipe.
 * High-frequency actions (param drags, analyser output) are coalesced to one
 * per target per frame; every other action is dispatched synchronously.
 */
export function createDispatchPipe(rawDispatch) {
  sink = rawDispatch;

  return function pipedDispatch(action) {
    notify(action);

    if (action?.type && HIGH_FREQ.test(action.type)) {
      // Key by target so two sliders dragged together don't clobber each other.
      pending.set(action.key ? `${action.type}:${action.key}` : action.type, action);
      if (rafId == null) rafId = requestAnimationFrame(flush);
      return;
    }

    // Preserve ordering: anything queued must land before a discrete action.
    if (pending.size > 0) {
      if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
      flush();
    }
    rawDispatch(action);
  };
}
