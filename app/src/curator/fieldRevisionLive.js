// curator/fieldRevisionLive.js — #2151: the standing poem's critical
// pass, wired live. The pure core (fieldRevision.mjs) judges; this
// driver owns everything with a clock in it — the dwell a poem must
// stand before it is judged, the grace a pending request waits before
// the poem answers, and the tempo feed the pressure law reads — and it
// writes nothing itself: requests, silences and answers are store
// actions (layoutSlice), each re-validated at the commit. A fault here
// is swallowed whole: the pass is a critic, never a load-bearing wall,
// and a broken critic must not break the stage it watches.
//
// The lifecycle, per tick (REVISION_TICK_MS):
//   - the tempo is classified from the honest feed (loisActivity) and
//     the store's variety flag follows it (hot deals range widely);
//   - a PENDING request is babysat: the form moved, the poem was held,
//     an exemption landed, or the tempo left watching → the request is
//     silenced (the user's hand overrides); the grace elapsed in the
//     watching tempo → the poem answers;
//   - a standing poem with no record is judged once it has stood the
//     dwell in the watching tempo, unheld and unexempt (the review
//     loop's own exemption table: kept, held, plated, ray-gunned and
//     whispered forms are beyond critics) — and only when its register
//     reads empty or crowded. One bite per form: a form the record
//     already names is never judged again.
// Muted while a take plays back (isReplaying): a replay is a recording
// of decisions already made, and a critic has no business making new
// ones inside it — the take contract (still = live) is the materialized
// forms in the document, which this driver never touches mid-replay.
import { loisActivity } from './loisActivity.js';
import {
  classifyTempo,
  judgeStandingPoem,
  standingPoemKey,
  REVISION_TICK_MS,
  REVISION_STAND_DWELL_MS,
  REVISION_ANSWER_DELAY_MS,
} from './fieldRevision.mjs';
import { reviewExemption } from './fieldReview.mjs';
import { sanitizeFieldForm } from '../poets/fieldForm.js';

/**
 * Start the pass. { getState } is the store's own accessor (App passes
 * useStore.getState); the actions are read off it per tick, so a store
 * without them is simply a stage the pass cannot speak to. Returns
 * stop(). Throws TypeError on a missing getState — a wiring bug, not a
 * runtime condition (the review voice's contract).
 */
export function startFieldRevision({
  getState,
  isReplaying = () => false,
  now = () => Date.now(),
  snapshot = () => loisActivity.snapshot(),
  setInterval: si = globalThis.setInterval,
  clearInterval: ci = globalThis.clearInterval,
} = {}) {
  if (typeof getState !== 'function') {
    throw new TypeError('startFieldRevision: the store getState accessor is required');
  }
  let stopped = false;
  let standingKey = null; // the form the dwell clock is timing, by its materialization key
  let standingDwellMs = 0; // dwell accumulated in the WATCHING tempo only — time hot/fiddling/away never counts
  let lastTickAt = null; // the previous tick's clock read, the dwell accumulator's other end
  let pendingSince = 0; // when THIS driver saw the pending request appear (the grace clock)
  let variety = null; // the last hot flag written to the store

  const tick = () => {
    if (stopped) return;
    try {
      if (isReplaying()) {
        standingKey = null; // dwell restarts after playback: a replay proves nothing about standing
        standingDwellMs = 0;
        lastTickAt = null;
        return;
      }
      const state = getState();
      const at = now();
      const tempo = classifyTempo(snapshot(), at);
      const hot = tempo === 'hot';
      if (variety !== hot) {
        variety = hot;
        state.setFieldVariety?.(hot);
      }
      const form = sanitizeFieldForm(state.layoutParams?.fieldForm);
      const key = form ? standingPoemKey(form) : null;
      if (key !== standingKey) {
        standingKey = key;
        standingDwellMs = 0;
      } else if (key !== null && tempo === 'watching' && lastTickAt !== null) {
        standingDwellMs += at - lastTickAt; // the clock runs only while the user is watching
      }
      lastTickAt = at;
      const held = !!state.lockedParams?.fieldForm && !!form;
      const rec = state.fieldRevision ?? null;

      if (rec && rec.status === 'pending') {
        if (!form || held || rec.formKey !== key) {
          state.cancelFieldRevision?.('form-moved');
          return;
        }
        if (reviewExemption(form, state.layoutParams?.poemKeeps)) {
          state.cancelFieldRevision?.('exempt');
          return;
        }
        if (tempo !== 'watching') {
          state.cancelFieldRevision?.(tempo);
          return;
        }
        if (pendingSince === 0) pendingSince = at;
        if (at - pendingSince >= REVISION_ANSWER_DELAY_MS) {
          pendingSince = 0;
          state.answerFieldRevision?.();
        }
        return;
      }
      pendingSince = 0;

      if (!form || held) return;
      if (rec && rec.formKey === key) return; // one bite per form — this materialization was already judged
      if (tempo !== 'watching') return;
      if (standingDwellMs < REVISION_STAND_DWELL_MS) return;
      if (reviewExemption(form, state.layoutParams?.poemKeeps)) return;
      const judged = judgeStandingPoem(form);
      if (!judged || judged.read === 'fine') return;
      state.requestFieldRevision?.({
        formKey: key,
        register: judged.register,
        read: judged.read,
        doctrine: judged.doctrine,
      });
    } catch {
      /* the critic swallows its own faults — see the header */
    }
  };

  const timer = typeof si === 'function' ? si(tick, REVISION_TICK_MS) : null;
  if (timer && typeof timer.unref === 'function') timer.unref();
  return () => {
    stopped = true;
    if (timer !== null && typeof ci === 'function') ci(timer);
  };
}
