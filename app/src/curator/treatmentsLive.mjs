// treatmentsLive.mjs — #2010 (RAY GUN line, slice 1): the named `treatments` surface and the bus's one emitter.
//
// Ruled 2026-11-06 (D4) — the treatment bus records come FIRST, before any new engine, so the bus is reviewed as a
// standalone piece and every later flow (P1–P5) is born log-accountable. Spec: docs/design/raygun-headroom-2026-11-06.md
// §8d (what the bus may carry) and §9 F8/F9 (the flows this slice opens).
//
// TWO PARTS, one constitution ("capabilities are called, state is published, signals are announced"):
//
// 1. THE SURFACE — `treatments.read / arm / disarm / cycle`, on the shelf pattern (curator/shelf.mjs): a named
//    capability KINETIC, CURATOR, WetLab and (later) the doctrines call. It owns NO state: every write goes through
//    the owning slice (layoutSlice.setPoemRaygun / cyclePoemRaygun), so a surface call is exactly the performer's tap —
//    same seed stream, same undo step, same plate refusal. Each call names who caused it (`by`).
//
// 2. THE ANNOUNCER — one store watcher. Whenever the standing poem's treatment record changes, by ANY path (a surface
//    call, an undo, a re-deal that drops the record, a project load), it announces the change on the bus:
//    treatment:arm { target, mode, seed, from } / treatment:disarm { target, mode }, with the envelope's cause (the
//    surface call's `by`; `document` for a change that arrived with the document — undo, a re-deal, a load — even when
//    a persona's re-deal caused it; `playback` for a live touch made while a take plays back) and
//    the musical stamp. Watching the record rather than the calls is what makes the log complete: the log can never
//    say a treatment stands when the form says it does not.
//
// WHAT THE BUS NEVER DOES HERE: carry state. Payloads are frozen copies of plain data, nothing listens in order to
// apply them, and replay consults the form's record, never the event history (§8d). Turn every listener off and the
// stage renders bit-identically.
import { emit as busEmit, Events } from '../composition/eventBus.js';
import { treatmentState, TREATMENT_TARGETS, TREATMENT_CAUSES } from './treatmentRecord.mjs';

/** A surface caller must name itself; `document` is the announcer's word for changes nobody called. */
const CALLERS = Object.freeze(TREATMENT_CAUSES.filter((c) => c !== 'document'));

let bound = null; // { getState } while started
let pendingCause = null; // the surface call in flight (store writes are synchronous: the watcher runs inside it)

const poemRecord = (state) => treatmentState(state && state.layoutParams && state.layoutParams.fieldForm?.raygun);
const same = (a, b) => (a === null ? b === null : b !== null && a.mode === b.mode && a.seed === b.seed);

/**
 * Start the announcer and bind the surface. `getState` / `subscribe` are the store's; `isReplaying` marks changes
 * made while a take plays back. Returns stop().
 */
export function startTreatments({ getState, subscribe, isReplaying = () => false, emit = busEmit } = {}) {
  if (typeof getState !== 'function' || typeof subscribe !== 'function') return () => {};
  let prev = poemRecord(getState());
  // ORDER: announcements queue and drain one at a time. A listener that writes the record while hearing an
  // announcement re-enters this watcher; its announcement waits behind the one in flight, so every listener hears
  // changes in the order they happened (the take's log never contradicts the form).
  const queue = [];
  let draining = false;
  const off = subscribe((s) => {
    const cur = poemRecord(s);
    if (same(prev, cur)) return;
    const from = prev;
    prev = cur;
    let replaying = false;
    try {
      replaying = !!isReplaying();
    } catch {
      replaying = false;
    }
    // `playback`: a change made while a take is playing back. Replayed treatments never reach the store (playback
    // overlays the take's scene on the loop, not the store), so this marks a live touch during playback — which the
    // take recorder drops, as it drops all playback-time traffic.
    const cause = replaying ? 'playback' : pendingCause || 'document';
    queue.push(
      cur
        ? [
            Events.TREATMENT_ARM,
            Object.freeze({ target: 'poem', mode: cur.mode, seed: cur.seed, from: from ? from.mode : null }),
            cause,
          ]
        : [Events.TREATMENT_DISARM, Object.freeze({ target: 'poem', mode: from.mode }), cause],
    );
    if (draining) return;
    draining = true;
    try {
      while (queue.length) {
        const [ev, payload, c] = queue.shift();
        emit(ev, payload, { cause: c });
      }
    } finally {
      draining = false;
      queue.length = 0;
    }
  });
  const mine = { getState };
  bound = mine;
  return () => {
    off();
    if (bound === mine) bound = null;
  };
}

/** Run one store write as `by`. Returns whether the target's record changed. */
function act(target, by, write) {
  if (!bound || !TREATMENT_TARGETS.includes(target) || !CALLERS.includes(by)) return false;
  const state = bound.getState();
  // HOLD is sovereign for every caller but the performer (§9: lock-respecting). The performer's own gun works on a
  // held poem (#2003 ruling: HOLD guards the poem's VALUE against re-deals, not the hand that holds it); DAVIS, the
  // Director, LOIS and the doctrines (RAY GUN P5) never treat a held poem.
  if (by !== 'performer' && state.lockedParams && state.lockedParams.fieldForm) return false;
  const before = poemRecord(state);
  const outer = pendingCause;
  pendingCause = by;
  try {
    write(state);
  } finally {
    pendingCause = outer;
  }
  return !same(before, poemRecord(bound.getState()));
}

/**
 * The core API's treatments surface. Every write returns true when it landed (the record changed), false when it
 * was refused (no poem standing, a plate, an unknown mode or caller, nothing to change, the surface not started).
 */
export const treatments = Object.freeze({
  targets: TREATMENT_TARGETS,
  callers: CALLERS,
  /** The treatment standing on `target`: { mode, seed } (a copy), or null. */
  read(target) {
    if (!bound || !TREATMENT_TARGETS.includes(target)) return null;
    return poemRecord(bound.getState());
  },
  /** Arm a named mode on `target` (re-arming another mode replaces it; the same mode is a no-op). */
  arm(target, { mode, by } = {}) {
    return act(target, by, (s) => s.setPoemRaygun(mode));
  },
  /** Take the treatment off `target`; it stands plain. */
  disarm(target, { by } = {}) {
    return act(target, by, (s) => s.setPoemRaygun(null));
  },
  /** The poem row's gesture: plain → carson → greiman → shot → plain. */
  cycle(target, { by } = {}) {
    return act(target, by, (s) => s.cyclePoemRaygun());
  },
});
