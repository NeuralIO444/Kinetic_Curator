// resolveTap.mjs — #1353 step 2: the one place the live loop's frame inputs can be observed.
//
// liveLoop hands every frame's `input` to the resolver. A performance is exactly that input sequence (the resolver is
// a pure function of it: liveResolve.determinism.selfcheck.mjs). This module is the tap: liveLoop builds its resolver
// through withResolveTap(createLiveResolver), so every resolveLayers(input) call passes its input through tapResolveInput(input) first,
// and whoever wants the stream registers a listener. With no listener it is a single null check and the very same
// resolver call, so the live path is unchanged.
//
// A listener must never break the frame: it runs inside try/catch, and a throwing listener is dropped (reported
// once) rather than taking the instrument down.
import { playbackStep } from './playback.mjs'; // #1461 step 2

let listener = null;

/** Register the one listener (or null to remove it). Returns the previous listener. */
export function setResolveTap(fn) {
  const prev = listener;
  listener = typeof fn === 'function' ? fn : null;
  return prev;
}

/** Called for EVERY resolver call, including frames liveLoop later rejects (the resolver's state advanced). */
export function tapResolveInput(input) {
  if (listener === null) return;
  try {
    listener(input);
  } catch (e) {
    listener = null;
    console.warn('[resolveTap] listener threw and was removed:', e && e.message ? e.message : e);
  }
}

let outputListener = null;

/** Register the one OUTPUT listener (or null). It sees what the resolver returned for the input just tapped. */
export function setResolveOutputTap(fn) {
  const prev = outputListener;
  outputListener = typeof fn === 'function' ? fn : null;
  return prev;
}

/** Called after every resolver call with its result. Same rule: a throwing listener is dropped, never fatal. */
export function tapResolveOutput(output) {
  if (outputListener === null) return;
  try {
    outputListener(output);
  } catch (e) {
    outputListener = null;
    console.warn('[resolveTap] output listener threw and was removed:', e && e.message ? e.message : e);
  }
}

let frameListener = null;

/**
 * Register the one FRAME listener (or null): fn(input, output) after every resolver call, for a reader that needs
 * both together (dish pressure counts the marks the resolver placed around the input's pins). Separate from the
 * two taps above, which belong to the performance recorder. Same rule: a throwing listener is dropped.
 */
export function setResolveFrameTap(fn) {
  const prev = frameListener;
  frameListener = typeof fn === 'function' ? fn : null;
  return prev;
}

let formedProvider = null;

/** Register where the loop reads which pins have formed (curator/formationLive.js): keeps gl/ free of curator/. */
export function setFormedProvider(fn) {
  formedProvider = typeof fn === 'function' ? fn : null;
}

/** [bool] per pin, from the last resolved frame's decision; [] with no provider. A bad provider reads as none. */
export function getFormedPins() {
  if (formedProvider === null) return [];
  try {
    const f = formedProvider();
    return Array.isArray(f) ? f : [];
  } catch {
    return [];
  }
}

let limbsProvider = null;

/** Register where the loop reads each pin's pairs of wings (curator/formationLive.js getLimbPairs). */
export function setLimbsProvider(fn) {
  limbsProvider = typeof fn === 'function' ? fn : null;
}

/** [1|2] per pin from the last resolved frame's decision; [] with no provider. A bad provider reads as none. */
export function getLimbPairs() {
  if (limbsProvider === null) return [];
  try {
    const l = limbsProvider();
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}

let traitsProvider = null;

/** Register where the loop reads each moth's traits (curator/formationLive.js getPinTraits). */
export function setTraitsProvider(fn) {
  traitsProvider = typeof fn === 'function' ? fn : null;
}

/** [traits|null] per pin from the last resolved frame; [] with no provider. A bad provider reads as none. */
export function getPinTraits() {
  if (traitsProvider === null) return [];
  try {
    const t = traitsProvider();
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

let dishHostedProvider = null;

/** Register where the loop reads which pin hosts the dish creature (curator/formationLive.js getDishHosted). */
export function setDishHostedProvider(fn) {
  dishHostedProvider = typeof fn === 'function' ? fn : null;
}

/** [bool] per pin from the last resolved frame's decision; [] with no provider. A bad provider reads as none. */
export function getDishHosted() {
  if (dishHostedProvider === null) return [];
  try {
    const h = dishHostedProvider();
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}

let dishPressureProvider = null;

/** Register where the loop reads each pin's dish pressure (curator/formationLive.js getDishPressures). */
export function setDishPressureProvider(fn) {
  dishPressureProvider = typeof fn === 'function' ? fn : null;
}

/** [0..1] per pin from the last resolved frame; [] with no provider. A bad provider reads as none. */
export function getDishPressure() {
  if (dishPressureProvider === null) return [];
  try {
    const p = dishPressureProvider();
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

let resetRequested = false;

/**
 * Ask for a FRESH resolver before the next frame (#1353 step 4: `rec` restarts the scene). A performance replays
 * from a fresh resolver, so a take has to begin on one: the swarm, the feed delay, the shared scent and the morph
 * ledgers all carry state a file that starts mid-session could not reproduce. The swap happens at the top of the
 * next resolveLayers call, before the input is tapped, so the first recorded frame is the fresh resolver's first.
 */
export function requestResolverReset() {
  resetRequested = true;
}

/**
 * The live loop's resolver, with its inputs and outputs observable and a restart on request. Takes the FACTORY (so
 * it can build a fresh one), and exposes exactly what the loop uses: resolveLayers and dispose. resolveLayers hands
 * the SAME input object to the resolver and returns the same result.
 */
export function withResolveTap(createResolver) {
  if (typeof createResolver !== 'function') throw new TypeError('[resolveTap] withResolveTap needs the resolver factory');
  let inner = createResolver();
  return {
    resolveLayers(liveInput) {
      // #1461 step 2 — playing a take: the recorded input replaces the live one, one per resolved frame. After a seek
      // the resolver starts fresh and the frames before the target are resolved here without presenting.
      const pb = playbackStep(liveInput);
      let input = liveInput;
      if (pb) {
        input = pb.input;
        if (pb.rewind) {
          if (typeof inner.dispose === 'function') inner.dispose();
          inner = createResolver();
          resetRequested = false;
          for (const f of pb.catchUp) inner.resolveLayers(f);
        }
      }
      if (resetRequested) {
        resetRequested = false;
        if (typeof inner.dispose === 'function') inner.dispose();
        inner = createResolver();
      }
      if (!pb) tapResolveInput(input); // a take being played is never re-recorded
      const output = inner.resolveLayers(input);
      if (!pb) tapResolveOutput(output);
      if (frameListener !== null && !pb) {
        try {
          frameListener(input, output);
        } catch (e) {
          frameListener = null;
          console.warn('[resolveTap] frame listener threw and was removed:', e && e.message ? e.message : e);
        }
      }
      return output;
    },
    dispose() {
      if (typeof inner.dispose === 'function') inner.dispose();
    },
  };
}
