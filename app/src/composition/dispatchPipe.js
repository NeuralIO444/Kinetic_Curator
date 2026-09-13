// Single onDispatch pipe — the chokepoint.
// Every panel action flows through here: throttle, observe, route.
// This is also where telemetry / rate-limiting / future remote-control hooks in.

const THROTTLE_MS = 16; // ~60fps cap on high-frequency param drags
let lastEmit = 0;
let pending = null;
let rafId = null;

const observers = new Set();

export function subscribeDispatch(fn) {
  observers.add(fn);
  return () => observers.delete(fn);
}

function flush() {
  rafId = null;
  if (!pending) return;
  const action = pending;
  pending = null;
  for (const fn of observers) {
    try { fn(action); } catch (e) { console.error('[dispatchPipe] observer error', e); }
  }
}

/**
 * Wrap a store dispatch so every action passes through one pipe.
 * High-frequency actions (layout param drags) are throttled to one per frame.
 */
export function createDispatchPipe(rawDispatch) {
  return function pipedDispatch(action) {
    // Notify observers immediately (for logging / future telemetry)
    for (const fn of observers) {
      try { fn(action); } catch (_) { /* swallow observer errors */ }
    }

    const isHighFreq = action?.type && /SET_LAYOUT_PARAM|SET_AUDIO/.test(action.type);
    if (isHighFreq) {
      pending = action;
      const now = performance.now();
      if (now - lastEmit >= THROTTLE_MS) {
        lastEmit = now;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(flush);
      }
      return;
    }
    rawDispatch(action);
  };
}
