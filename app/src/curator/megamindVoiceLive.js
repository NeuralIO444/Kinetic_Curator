// megamindVoiceLive.js — #1526 MegaMind S2: the live Ollama persona backend + the backend chain.
//
// The model object startMind consumes. It reads the capability registry S1 publishes (never a name,
// never an assumption): no record, a cloud-badged record, or a model that has failed twice running
// means NOT available, and the personas run on the next backend down the chain — silently, exactly as
// the ordering ruling requires (Matt, 2026-11-10: a connected Ollama answers; disconnect or a dead
// model returns silently to the default chain — Apple where present, else the rules the thinker keeps
// underneath). A fresh registry record (a reconnect, a re-detect) clears the failure latch, the format
// ladder and the cadence: a new measurement earns new trust.
//
// Cadence is not failure: when the measured tier says "not this bar", ask() rejects with kind 'cadence'
// and the CHAIN rethrows it — the tier's consultation rhythm is the design, so it never falls through
// to Apple (which would speak at its own cadence under a tier-C badge). Real failures (down, bad-reply,
// drift) DO fall through: that is what "a dead model returns to the default chain" means.
import { getCapabilities, subscribeCapabilities } from '../composition/capabilityRegistry.mjs';
import {
  adapterError,
  askPersonaReply,
  createCadencePolicy,
  createFormatLadder,
  localRecord,
  DEEP_MAX_LATE_BARS,
} from './megamindVoice.mjs';

/** Consecutive real failures after which the model is read as dead until the link re-measures. */
export const FAILURES_TO_LATCH = 2;

/**
 * @param fetchImpl  fetch (real by default; injected by the selfcheck)
 * @param getRecord  () => the live capability record (the registry by default; injected by the selfcheck)
 * @param subscribe  (fn) => unsub — record-change notifications (the registry's by default)
 */
export function createOllamaModel({
  fetchImpl = (...a) => globalThis.fetch(...a),
  getRecord = getCapabilities,
  subscribe = subscribeCapabilities,
} = {}) {
  const ladder = createFormatLadder();
  const cadence = createCadencePolicy();
  let failures = 0;
  let seenAt = null; // the `at` of the record the latch/ladder/cadence were built under
  const syncRecord = () => {
    const rec = localRecord(getRecord());
    if (rec && rec.at !== seenAt) {
      seenAt = rec.at;
      failures = 0;
      ladder.reset();
      cadence.reset();
    }
    if (!rec) seenAt = null;
    return rec;
  };
  try {
    subscribe(() => syncRecord());
  } catch {
    /* a model without registry notifications still reads the record per ask */
  }
  const record = () => syncRecord();
  const available = () => !!record() && failures < FAILURES_TO_LATCH;
  return {
    name: 'ollama',
    maxLateBars: DEEP_MAX_LATE_BARS,
    available,
    /** The answering backend's identity for mind:status / the take's systems record. */
    info() {
      const rec = record();
      return rec ? { backend: 'ollama', model: rec.model } : { backend: 'ollama' };
    },
    /**
     * One persona's reply, as the stamped envelope the thinker reads ({ backend, reply }) — the stamp is
     * how a decision records which backend actually answered when a chain heads the thinker. Rejects with
     * an adapterError: 'cadence' (not this bar — not a failure), 'down' / 'bad-reply' / 'drift' (failures).
     */
    async ask(persona, context, { bar = 0 } = {}) {
      const rec = record();
      if (!rec || failures >= FAILURES_TO_LATCH) throw adapterError('down', 'no local model is linked');
      const plan = cadence.plan(rec, persona, { bar, context });
      if (plan.act === 'skip') throw adapterError('cadence', `tier ${rec.tier}: not this bar`);
      if (plan.act === 'cache') return { backend: 'ollama', reply: plan.reply };
      try {
        const reply = await askPersonaReply({ fetchImpl, record: rec, persona, context, ladder });
        failures = 0;
        cadence.store(persona, context, reply);
        return { backend: 'ollama', reply };
      } catch (e) {
        failures += 1;
        throw e;
      }
    },
    /** Test/diagnostic view of the latch. */
    failures: () => failures,
  };
}

/**
 * The backend chain App hands startMind (the ordering ruling as an object): the Ollama model answers
 * while it is linked and alive; its real failures fall through to the Apple model in the same ask; a
 * cadence skip rethrows so the rules answer the bar (see the header). Apple replies are stamped
 * { backend: 'apple' } so the books name who answered. With neither available, ask rejects and the
 * thinker's rules answer — the chain never invents a third state.
 *
 * @param apple   the Apple model object App builds ({ name:'apple', available, info, ask }) or null
 * @param ollama  the Ollama model (the app-wide singleton by default)
 */
export function createMindChain(apple, ollama = ensureOllamaModel()) {
  const appleUp = () => {
    try {
      return !!(apple && apple.available());
    } catch {
      return false;
    }
  };
  return {
    name: 'ollama',
    maxLateBars: DEEP_MAX_LATE_BARS,
    available: () => ollama.available() || appleUp(),
    info() {
      if (ollama.available()) return ollama.info();
      if (appleUp()) {
        let info;
        try {
          info = typeof apple.info === 'function' ? apple.info() : null;
        } catch {
          info = null;
        }
        return { backend: 'apple', ...(info && info.model ? { model: info.model } : {}) };
      }
      return { backend: 'rules' };
    },
    async ask(persona, context, meta) {
      if (ollama.available()) {
        try {
          return await ollama.ask(persona, context, meta);
        } catch (e) {
          if (e && e.kind === 'cadence') throw e; // the tier's rhythm, not a fault: rules answer, Apple stays out
          // a dead or unusable model falls through to the default chain, silently
        }
      }
      if (appleUp()) {
        const reply = await apple.ask(persona, context, meta);
        return { backend: 'apple', reply };
      }
      throw adapterError('down', 'no model backend is available');
    },
  };
}

// ── the app-wide singleton ─────────────────────────────────────────────────────────────────────────────────
let singleton = null;
export function ensureOllamaModel() {
  if (!singleton) singleton = createOllamaModel();
  return singleton;
}
