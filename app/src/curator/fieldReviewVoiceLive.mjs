// fieldReviewVoiceLive.mjs — #2006 SLICE 2: the review loop's voice,
// wired live. Watches the banked verdict record (state.fieldReview,
// slice 1) and speaks each FRESH landing's verdict onto the footer tape
// — the same loisRank slot a CURATOR rank writes, so the latest verdict
// owns the tape and a spoken line is replaceable by the next verdict.
//
// The discipline (spec §3.6, §3.7, §4 slice 2):
//   - DAVIS speaks CLEAN, LOIS speaks JANKY, EXEMPT stays silent (the
//     poem was never judged — there is no verdict to speak).
//   - Frequency: Davis does not woohoo every clean deal into noise — a
//     spoken Davis-clean suppresses the next clean's speech (its record
//     stands unspoken, exactly slice 1's) until a janky verdict speaks
//     and resets the gate. LOIS always speaks.
//   - The RULES line is spoken first, synchronously — it is the line of
//     record. The Mind backend is then ASKED (mindThinker rails: the
//     shared model object App hands startMind, one flight per persona,
//     the 300 ms ask cap) to phrase the line and order the approved
//     rungs. A valid, on-time proposal for the STILL-STANDING record
//     replaces the spoken line and the record's voice extension; the
//     model never changes a verdict (fieldReviewVoice validates the
//     proposal — numbers are the rules' own or the proposal drops).
//   - Fallback is silence about the fallback: unavailable, throwing,
//     malformed, out-of-set or late ⇒ the rules line stands, its
//     provenance already marked backend:'rules'. No UI names a backend.
//   - Replay: the driver is muted while a take plays back (App passes
//     the same isReplaying startMind gets) — a replay NEVER asks a
//     backend and never re-speaks. Spoken lines are runtime theatre;
//     the banked RECORD is the authority, and it re-derives bit-for-bit
//     without the voice (the extension is absent on a re-derived
//     record, and nothing anywhere reads it to decide anything).
//   - Fail-closed, on the whisper idiom: a voice never breaks the room.
//     Any throw in speaking or amending is logged and swallowed; the
//     record simply stands unspoken.
import { emit, Events } from '../composition/eventBus.js';
import { getMusicalTime } from '../composition/clockLive.js';
import { POET_SURNAMES } from '../poets/poemRow.mjs';
import { speakVerdict } from './loisRank.js';
import { ASK_TIMEOUT_MS } from './mindApple.js';
import { getMindRoom } from './mindRoom.js';
import { contextHash } from './mindLive.js';
import { askSeedFor, reviewAskContext, validateReviewProposal, voiceForRecord } from './fieldReviewVoice.mjs';

const keyOf = (rec) => `${rec.seed}|${rec.stream}|${rec.verdict}|${rec.gate ?? ''}`;

const defaultBar = () => {
  try {
    const bar = getMusicalTime().bar;
    return Number.isInteger(bar) && bar >= 0 ? bar : null;
  } catch {
    return null;
  }
};

const defaultNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/**
 * Start the voice. { getState, subscribe } are the store's own (App
 * passes useStore.getState / useStore.subscribe); `model` is the SAME
 * shared model object startMind receives (null = no backend wired —
 * the rules speak alone); `isReplaying` mutes the voice during take
 * playback. Returns stop(). Throws TypeError on a missing store —
 * a wiring bug, not a runtime condition (mindLive's contract).
 */
export function startReviewVoice({
  getState,
  subscribe,
  model = null,
  isReplaying = () => false,
  speak = speakVerdict,
  bar: barOf = defaultBar,
  now = defaultNow,
  log = () => {},
} = {}) {
  if (typeof getState !== 'function' || typeof subscribe !== 'function') {
    throw new TypeError('startReviewVoice: the store getState/subscribe accessors are required');
  }

  let stopped = false;
  // A record already standing when the voice starts is history, not a
  // landing: the voice speaks landings, so it starts from the present.
  let lastRecord = getState().fieldReview ?? null;
  let lastSpoken = null; // 'davis-clean' | 'lois-janky' | null — the frequency gate
  const flights = { davis: null, lois: null }; // one flight per persona, thinker discipline

  const amend = (extension, rec) => {
    try {
      getState().amendFieldReviewVoice?.(extension, { seed: rec.seed, stream: rec.stream });
    } catch (err) {
      log('review-voice:amend-failed', String(err));
    }
  };

  const maybeAsk = (rec, rulesExt, bar) => {
    if (!model || typeof model.ask !== 'function') return;
    const persona = rulesExt.persona;
    if (flights[persona]) return; // a flight is already out for this persona
    let available = false;
    try {
      available = !!model.available();
    } catch {
      available = false;
    }
    if (!available) return; // the rules line stands, marked as rules
    const form = getState().layoutParams?.fieldForm ?? null;
    let room = null;
    try {
      room = getMindRoom();
    } catch {
      room = null;
    }
    const ctx = reviewAskContext(rec, {
      poet: form ? (POET_SURNAMES[form.poetId] ?? form.poetId ?? null) : null,
      piece: form?.pieceId ?? null,
      room,
    });
    if (!ctx) return;
    const seed = askSeedFor(rec);
    const askedAt = now();
    const key = keyOf(rec);
    const flight = { key };
    flights[persona] = flight;
    emit(Events.MIND_REQ, { persona, bar, seed, contextHash: contextHash(ctx) });
    let pending;
    try {
      pending = model.ask(persona, ctx, { seed, bar });
    } catch (err) {
      if (flights[persona] === flight) flights[persona] = null;
      log('review-voice:ask-failed', String(err));
      return;
    }
    Promise.resolve(pending).then(
      (raw) => {
        if (flights[persona] === flight) flights[persona] = null;
        if (stopped) return;
        const latencyMs = Math.round(now() - askedAt);
        const proposal = validateReviewProposal(raw, rec);
        emit(Events.MIND_REPLY, {
          persona,
          bar,
          backend: model.name ?? 'apple',
          latencyMs,
          reply: proposal ? { line: proposal.line } : null,
        });
        if (!proposal) {
          log('review-voice:proposal-dropped', { persona, key });
          return;
        }
        // Late is dropped, on the ask cap: the rules line already
        // spoke for this landing; a tardy rephrase would rewrite a
        // verdict the room has moved past.
        if (latencyMs > ASK_TIMEOUT_MS) {
          log('review-voice:proposal-late', { persona, key, latencyMs });
          return;
        }
        if (isReplaying()) return;
        // The proposal colours ITS OWN landing or none: if the room
        // has landed again (or the standing voice is no longer the
        // rules line this ask set out to rephrase), it is dropped.
        const cur = getState().fieldReview ?? null;
        if (!cur || keyOf(cur) !== key || cur.voice?.backend !== 'rules') return;
        const ext = {
          persona,
          line: proposal.line,
          bar,
          backend: model.name === 'demo' ? 'demo' : 'apple',
          seed,
        };
        const order = proposal.rungOrder ?? rulesExt.rungOrder;
        if (order) ext.rungOrder = [...order];
        // Amend before speaking (as in handle): the record's provenance
        // is banked before the tape moves, so the two can never diverge
        // — the writes are one synchronous block either way.
        amend(ext, rec);
        try {
          speak(ext.line);
        } catch (err) {
          log('review-voice:speak-failed', String(err));
        }
      },
      (err) => {
        if (flights[persona] === flight) flights[persona] = null;
        log('review-voice:ask-failed', String(err));
      },
    );
  };

  const handle = (rec) => {
    if (!rec) return; // no landing: silence
    if (rec.voice) return; // already spoken — the voice is idempotent
    if (isReplaying()) return; // a replay never asks, never re-speaks
    const bar = barOf();
    const rulesExt = voiceForRecord(rec, bar);
    if (!rulesExt) return; // exempt: the tape stays silent
    // Frequency discipline: a standing Davis woohoo is not re-cheered
    // by the next clean deal. The record stands unspoken (exactly
    // slice 1's shape) and the tape keeps the line it has.
    if (rec.verdict === 'clean' && lastSpoken === 'davis-clean') return;
    // Amend before speaking: provenance is banked before the tape
    // moves, structurally — both writes happen in this one synchronous
    // block (the record key was pre-checked above), so no observer can
    // interleave and the reorder changes nothing observable.
    amend(rulesExt, rec);
    try {
      speak(rulesExt.line);
    } catch (err) {
      log('review-voice:speak-failed', String(err));
    }
    lastSpoken = rec.verdict === 'clean' ? 'davis-clean' : 'lois-janky';
    maybeAsk(rec, rulesExt, bar);
  };

  const onState = () => {
    if (stopped) return;
    let rec = null;
    try {
      rec = getState().fieldReview ?? null;
    } catch {
      return;
    }
    if (rec === lastRecord) return; // HOLD carry-by et al: same record, no landing
    lastRecord = rec;
    try {
      handle(rec);
    } catch (err) {
      log('review-voice:failed', String(err));
    }
  };

  const unsubscribe = subscribe(onState);

  return function stop() {
    stopped = true;
    try {
      unsubscribe?.();
    } catch {
      /* already gone */
    }
  };
}
