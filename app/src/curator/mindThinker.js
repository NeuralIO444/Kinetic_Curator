// mindThinker.js — #1462 Mind 1: one persona's `think` loop. Pure of the bus and the clock: the caller hands it bars.
//
// The rules (parked-directions design, Matt 2026-10-13):
//   - at most ONE request in flight per persona, and at most ONE decision per bar
//   - a reply that arrives more than MAX_LATE_BARS after it was asked is thrown away
//   - a malformed reply is dropped and logged, never applied
//   - the rules backend answers synchronously and is the fallback forever; the model backend (Apple Intelligence via the
//     Swift helper, #1462 spec update 2026-10-13) is asked on every eligible bar while it is reported available, its
//     reply lands on a LATER bar, and every bar it has not answered the rules answer (a slow, failing or absent model
//     never silences a persona). Callers never branch on which answered.
//   - every decision carries the bar, the backend, the seed it was asked with and `invented` (a state outside the
//     canonical set), so a take can record it verbatim and a replay never asks a backend again
import { validateReply, isInvented, PERSONAS } from './mindContract.js';
import { rulesReply } from './mindRules.js';

export const MAX_LATE_BARS = 2;
/** The two backends, in the order they are asked. */
export const BACKENDS = Object.freeze(['apple', 'rules', 'demo']); // 'demo': the ?debug=mind stand-in, never shipped live

/**
 * @param persona   'davis' | 'lois' | 'queen'
 * @param mind      optional async (context, { persona, seed, bar }) => reply  (the model backend)
 * @param backend   the model backend's name in decisions (default 'apple')
 * @param available () => boolean     is the model backend up right now
 * @param log       (kind, info) => void   dropped / late / error notices (never throws)
 */
export function createThinker({ persona, mind = null, backend = 'apple', available = () => false, log = () => {}, maxLateBars = MAX_LATE_BARS } = {}) {
  if (!PERSONAS.includes(persona)) throw new TypeError(`[mind] unknown persona ${String(persona)}`);
  let lastBar = -Infinity; // the bar of the last decision made
  let flight = null; // { bar, seed, done: bool, reply: any, failed: bool }
  const note = (kind, info) => { try { log(kind, { persona, ...info }); } catch { /* a logger must not break the loop */ } };

  const decide = (bar, from, seed, raw) => {
    const reply = validateReply(persona, raw);
    if (!reply) { note('dropped', { bar, backend: from, reason: 'malformed' }); return null; }
    lastBar = bar;
    return { persona, bar, backend: from, seed, invented: isInvented(persona, reply), reply };
  };

  return {
    /**
     * Called once per bar. Returns the decision made this bar, or null (nothing to do, or nothing valid).
     * @param bar     the bar number (monotone)
     * @param context a buildContext() object
     * @param seed    the seed this decision is rolled with (the document seed combined with the bar, by the caller)
     */
    onBar({ bar, context, seed = 0 }) {
      if (!Number.isInteger(bar) || bar === lastBar) return null; // one decision per bar
      // a model reply that came back since the last bar: use it if it is on time and valid
      if (flight && flight.done) {
        const f = flight; flight = null;
        if (f.failed) note('error', { bar });
        else if (bar - f.bar > maxLateBars) note('late', { bar, askedAt: f.bar, lateBars: bar - f.bar });
        else { const d = decide(bar, backend, f.seed, f.reply); if (d) return d; }
        // nothing usable from the model this bar: the rules answer below, and the model is asked again next bar
        return decide(bar, 'rules', seed, rulesReply(persona, context, { seed, bar }));
      }
      // the model is asked at most once at a time; the request is made off the bar, and the rules answer THIS bar
      // (and every bar the model has not answered): a slow or absent model never silences a persona
      if (!flight && mind && available()) {
        const f = { bar, seed, done: false, reply: null, failed: false };
        flight = f;
        Promise.resolve()
          .then(() => mind(context, { persona, seed, bar }))
          .then((reply) => { f.reply = reply; f.done = true; }, () => { f.failed = true; f.done = true; });
      }
      return decide(bar, 'rules', seed, rulesReply(persona, context, { seed, bar }));
    },
    /** True while a model request is outstanding. */
    inFlight: () => flight !== null,
    reset() { lastBar = -Infinity; flight = null; },
  };
}
