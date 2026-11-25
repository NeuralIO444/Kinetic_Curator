// megamindDiscardLog.mjs — #2489: the MegaMind surfaces' discard log (the event log for thrown-out
// model replies), in the governorEventLog idiom.
//
// Matt's ruling (2026-11-24): a discarded reply goes to the event log for diagnosis — what it said
// and which check it failed stay inspectable there. It never reaches a narration surface: nothing
// ungrounded is ever presented as telemetry. Before this log, the surfaces driver threw discarded
// replies away unrecorded, which is why a discard could not be diagnosed after the fact.
//
// Kept pure and in-memory only: a module-level ring buffer, bounded at MAX_DISCARD_ENTRIES (oldest
// dropped first), never serialized — the log describes a live session's model behaviour, not the
// artwork. This module only records; the checkers in megamindSurfaces.mjs decide what is discarded.

/** Ring buffer capacity: a session's discards are a handful, not a stream. */
export const MAX_DISCARD_ENTRIES = 32;

/** A logged reply is evidence, not an archive: enough to diagnose, never the whole transcript. */
export const MAX_DISCARD_REPLY_CHARS = 500;

const entries = [];
let seq = 0;

const cleanFacts = (facts) =>
  (Array.isArray(facts) ? facts : [])
    .filter((f) => f && typeof f.label === 'string')
    .slice(0, 12)
    .map((f) => ({ label: f.label, value: f.value === undefined ? null : f.value }));

/**
 * Record one discarded reply: { surface, stage, reason, reply, facts, at? } — the surface that
 * asked, the check it failed ('shape' | 'grounding'), why in plain words, the reply text itself
 * (bounded), and the facts it was judged against. Ordering is a module-local sequence number, not
 * a clock read (the determinism law: no unseeded clock in a pure module); a caller that has a
 * timestamp may pass `at` (epoch ms) and it is kept as given. Returns the stored entry.
 */
export function recordDiscard({ surface, stage, reason, reply, facts, at } = {}) {
  const entry = {
    seq: ++seq,
    at: Number.isFinite(at) ? at : null,
    surface: typeof surface === 'string' && surface ? surface : 'unknown',
    stage: typeof stage === 'string' && stage ? stage : 'unknown',
    reason: typeof reason === 'string' && reason ? reason : 'the reply failed validation',
    reply: typeof reply === 'string' ? reply.slice(0, MAX_DISCARD_REPLY_CHARS) : '',
    facts: cleanFacts(facts),
  };
  entries.push(entry);
  if (entries.length > MAX_DISCARD_ENTRIES) entries.splice(0, entries.length - MAX_DISCARD_ENTRIES);
  return entry;
}

/** The recorded discards, oldest first. A copy — callers cannot mutate the log. */
export function readDiscards() {
  return entries.map((e) => ({ ...e, facts: e.facts.map((f) => ({ ...f })) }));
}

/** Start the log over (a fresh session, a test). */
export function clearDiscards() {
  entries.length = 0;
}
