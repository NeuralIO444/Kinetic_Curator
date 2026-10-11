// resolveTap.mjs — #1353 step 2: the one place the live loop's frame inputs can be observed.
//
// liveLoop hands every frame's `input` to the resolver. A performance is exactly that input sequence (the resolver is
// a pure function of it: liveResolve.determinism.selfcheck.mjs). This module is the tap: liveLoop wraps its resolver
// with withResolveTap(), so every resolveLayers(input) call passes its input through tapResolveInput(input) first,
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

/**
 * The resolver, with its inputs observable. Everything else (dispose and friends) is the original, by prototype:
 * only resolveLayers is shadowed, and it hands the SAME input object to the same function.
 */
export function withResolveTap(resolver) {
  const tapped = Object.create(resolver);
  tapped.resolveLayers = (input) => {
    tapResolveInput(input);
    return resolver.resolveLayers(input);
  };
  return tapped;
}
