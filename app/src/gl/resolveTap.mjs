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
    resolveLayers(input) {
      if (resetRequested) {
        resetRequested = false;
        if (typeof inner.dispose === 'function') inner.dispose();
        inner = createResolver();
      }
      tapResolveInput(input);
      const output = inner.resolveLayers(input);
      tapResolveOutput(output);
      return output;
    },
    dispose() {
      if (typeof inner.dispose === 'function') inner.dispose();
    },
  };
}
