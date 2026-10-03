// #722 — behave pills ease steering over ~1s. No canvas dissolve.
//
// Live-only. The studio / WASM still path does not import this module and
// does not run a second ease: a still is the settled verb. A session that
// never taps a pill stays on the raw row (bit-identical). Mid-ease capture
// is refused by omission — there is no ease state to bake off the live loop.
import { morphEase } from '../../gl/paletteMix.mjs';

export const BEHAVE_EASE_MS = 1000;
/** Branch gate. A blended mold/levy/lorenz gain under this stays off. */
export const BEHAVE_GAIN_EPS = 1e-4;

export function blendBehave(from, to, t) {
  const e = morphEase(Math.min(1, Math.max(0, t)));
  const keys = new Set([...Object.keys(from || {}), ...Object.keys(to || {})]);
  const out = { ...to };
  for (const k of keys) {
    const a = from?.[k];
    const b = to?.[k];
    if (typeof b === 'number') out[k] = (typeof a === 'number' ? a : 0) + (b - (typeof a === 'number' ? a : 0)) * e;
  }
  return out;
}

/** Curl vs point, matching resolveWindMode's default (no explicit override). */
export function windKernelFor(behave, mode) {
  return (behave === 'flock' || behave === 'mold' || mode === 'murmuration') ? 'curl' : 'point';
}

/**
 * Step the live ease. Clock is dtSec from the loop (sim seconds) — pause,
 * cut6, and a 30 fps drop stretch the ease; thaw does not finish it.
 * First sight of a verb adopts it, so an untouched session is identity.
 * A retap mid-blend re-targets from the current eased row and holds the
 * wind kernel already in use until this ease lands.
 */
export function stepBehaveEase(state, id, profile, dtSec, mode) {
  const dtMs = Math.max(0, Number(dtSec) || 0) * 1000;
  if (!state || state.id == null) {
    const windHold = windKernelFor(id, mode);
    return {
      state: { id, from: profile, to: profile, elapsed: BEHAVE_EASE_MS, windHold },
      profile,
      t: 1,
      windHold,
    };
  }
  let next = state;
  if (state.id !== id) {
    const tPrev = Math.min(1, state.elapsed / BEHAVE_EASE_MS);
    const from = blendBehave(state.from, state.to, tPrev);
    const windHold = tPrev >= 1 ? windKernelFor(state.id, mode) : state.windHold;
    next = { id, from, to: profile, elapsed: 0, windHold };
  } else {
    next = { ...state, to: profile, elapsed: state.elapsed + dtMs };
  }
  const t = Math.min(1, next.elapsed / BEHAVE_EASE_MS);
  const blended = t >= 1 ? profile : blendBehave(next.from, next.to, t);
  const windHold = t >= 1 ? windKernelFor(id, mode) : next.windHold;
  if (t >= 1) next = { ...next, elapsed: BEHAVE_EASE_MS, windHold };
  return { state: next, profile: blended, t, windHold };
}
