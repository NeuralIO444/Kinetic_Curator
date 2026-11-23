// curator/fieldRevision.mjs — #2151: the standing poem's critical pass.
//
// THE MOMENT THIS MODULE EXISTS FOR is a different one from the review
// loop's (#2006). The loop judges a FRESH LANDING — was this deal janky
// the moment it landed? This pass judges a poem that has LANDED AND IS
// LIVING on stage: read as typography, does the standing poem sit at a
// pole of the register line? Matt's ruling (2026-11-12): empty and
// crowded are TYPOGRAPHIC REGISTERS, not letter counts and not share of
// frame — EMPTY is the COVER register (one word, a masthead, large type,
// a little sub text, lots of air — the Ray Gun cover); CROWDED is the
// INTERIOR register (dense paragraphs, the inside of a magazine). The
// poem's own piece names its register (the register caches, #2310: every
// piece is tagged cover | between | interior), so the judgment reads
// the piece the form stands from — the register IS the measure.
//
// THE READERS are the shipped doctrines, in their ruled seats: CARSON
// reads the cover pole (Ray Gun IS Carson), ASHWORTH reads the
// interior/grit side. DAVIS calls them unattended; LOIS reviews through
// the loop; the REQUEST is theirs — but the words are never theirs. A
// request is a proposal into the poem system's own machinery, and the
// poem answers through it alone: a re-deal toward the other pole from
// the same poet's register stock (layoutSlice.answerFieldRevision,
// through landPoem — the deal path, the gate, the review, the ladder,
// the seeded streams; authorship is unchanged, the poets wrote every
// word that can land).
//
// PRESSURE FOLLOWS THE USER'S HANDS (Matt, 2026-11-12: "if the user is
// hot and smashing the kinetic button they want to see a wide variety
// or design books looks, if they stop and linger and start fiddling
// with settings and curator more then they can stop naggings"):
//   HOT      — smashing KINETIC: variety mode. No request fires or
//              interrupts; poem deals range across the register line
//              instead (the store's fieldVariety flag, set by the
//              driver from this classification).
//   FIDDLING — settings / curator hands on the controls: the user has
//              the wheel; requests stand down, pending ones silence.
//   WATCHING — in between: a poem standing, the user watching rather
//              than driving. The only tempo a request may fire in.
//   AWAY     — nobody in the room (the honest feed's own idle line):
//              nothing fires for an empty room.
// A user change overrides a pending request at every step: the driver
// silences it the moment the form moves, the poem is held, an exemption
// lands, or the tempo leaves watching — and the store's answer action
// re-validates all of it before it deals.
//
// ONE BITE PER FORM: a standing form draws at most one request, ever —
// answered or silenced, the record carries its key, and that exact
// materialization is never judged again. A re-deal places anew and keys
// differently, so a poem the performer deals back onto the stage is a
// new standing poem with its own rights. And the answer deals TOWARD
// the other pole — the middle band first — so an answered poem lands
// between the poles and does not draw the opposite request next.
//
// THE KNOBS. Every threshold, band and gate of this pass is a named
// constant, gathered here in one frozen object — readable in the open
// the way the MIND tab's numbers are, frozen into every banked request
// record as provenance (the fieldReview gates discipline), tunable
// later through the register seams. No tuning surface is built here.
//
// Pure: no store, no bus, no clock. The live driver
// (fieldRevisionLive.js) owns the wall clock and the tempo feed; the
// store (layoutSlice) owns the commits. Same inputs in, same judgment
// out — a take that replays the answer commit replays the identical
// form, because the answer drew from the deal's own seeded streams.
import { findPoetPiece, POET_REGISTERS } from '../poets/fieldForm.js';
import { poemFormKey } from '../poets/poemRow.mjs';

/** The driver's tick: how often the standing poem and the tempo are re-read. */
export const REVISION_TICK_MS = 1000;
/** A poem must stand this long in the watching tempo before it is judged — a landing is the loop's moment, not this pass's. */
export const REVISION_STAND_DWELL_MS = 20000;
/** The pending window: after a request fires, the poem answers once this grace passes — unless the user acts first. */
export const REVISION_ANSWER_DELAY_MS = 6000;
/** HOT: at least this many artist rolls inside the feed's flow window (loisActivity's rollsLastMinute, a 60 s window) is smashing. */
export const REVISION_HOT_ROLLS_PER_MIN = 10;
/** FIDDLING: a settings tweak younger than this means hands are on the controls right now. */
export const REVISION_FIDDLE_WINDOW_MS = 20000;
/** The register that reads EMPTY (the cover pole). */
export const REVISION_EMPTY_REGISTER = 'cover';
/** The register that reads CROWDED (the interior pole). */
export const REVISION_CROWDED_REGISTER = 'interior';

/** Every knob of this pass, frozen — banked into each request record as the gates it was judged under. */
export const FIELD_REVISION_KNOBS = Object.freeze({
  tickMs: REVISION_TICK_MS,
  standDwellMs: REVISION_STAND_DWELL_MS,
  answerDelayMs: REVISION_ANSWER_DELAY_MS,
  hotRollsPerMin: REVISION_HOT_ROLLS_PER_MIN,
  fiddleWindowMs: REVISION_FIDDLE_WINDOW_MS,
  emptyRegister: REVISION_EMPTY_REGISTER,
  crowdedRegister: REVISION_CROWDED_REGISTER,
});

/** A standing form's key (poets/poemRow's poemFormKey): poet + piece + exact materialization, or null. */
export function standingPoemKey(form) {
  return poemFormKey(form);
}

/**
 * Judge one standing form by its register. Returns
 *   { read: 'empty',   doctrine: 'carson',   register: 'cover' }
 *   { read: 'crowded', doctrine: 'ashworth', register: 'interior' }
 *   { read: 'fine',    doctrine: null,       register }
 * or null when there is nothing to judge — no form, or a form whose
 * piece the supply does not know. A deck piece carries no register
 * tag: the dealt decks live between the poles (their whole range is
 * the middle of the line), so an untagged piece reads fine — only a
 * cache piece can stand AT a pole. The doctrine named is the pole's
 * reader: CARSON for the cover pole, ASHWORTH for the interior.
 */
export function judgeStandingPoem(form) {
  if (!form || typeof form !== 'object') return null;
  const piece = findPoetPiece(form.poetId, form.pieceId);
  if (!piece) return null;
  const register = typeof piece.register === 'string' ? piece.register : null;
  if (register === REVISION_EMPTY_REGISTER) return { read: 'empty', doctrine: 'carson', register };
  if (register === REVISION_CROWDED_REGISTER) return { read: 'crowded', doctrine: 'ashworth', register };
  return { read: 'fine', doctrine: null, register };
}

/**
 * The pressure law, as a pure read of the honest feed's snapshot
 * (loisActivity.snapshot — the same record the pill and Davis read).
 * `now` is the snapshot's own clock (snapshot.now); the caller passes
 * it so this stays a function of the record alone.
 *   'hot'      — rolls at or over the hot line inside the flow window
 *   'fiddling' — a settings tweak inside the fiddle window, or an undo
 *                burst live right now
 *   'away'     — the feed's own away line (idle past LOIS_AWAY_MS), or
 *                no snapshot at all: no evidence of a watcher
 *   'watching' — none of the above: present, hands off, poem standing
 */
export function classifyTempo(snapshot, now) {
  if (!snapshot || typeof snapshot !== 'object') return 'away';
  if (snapshot.away) return 'away';
  if ((snapshot.rollsLastMinute ?? 0) >= REVISION_HOT_ROLLS_PER_MIN) return 'hot';
  const at = Number.isFinite(now) ? now : snapshot.now;
  const lastTweak = snapshot.lastTweak;
  if (
    lastTweak &&
    Number.isFinite(lastTweak.ts) &&
    Number.isFinite(at) &&
    at - lastTweak.ts < REVISION_FIDDLE_WINDOW_MS
  )
    return 'fiddling';
  if ((snapshot.undoBurstSize ?? 0) > 0) return 'fiddling';
  return 'watching';
}

/**
 * The poem's answer to a request: a deal decision naming a piece from
 * the SAME poet's register cache, toward the other pole from the
 * standing piece — the middle band first (an answered poem lands
 * between the poles), the far pole when the middle has nothing the
 * standing piece is not. The standing piece itself is never the answer.
 * The decision carries the standing form's script call, so a poem
 * standing in the native face is answered in the native face. Drawn off
 * the caller's seeded stream (the deal index's own pick stream, at the
 * store) — the answer is a deal, with a deal's replay discipline.
 * Returns null when there is nothing honest to answer with (the
 * standing piece is not at a pole, or the cache holds no other band).
 */
export function pickRevisionDecision(form, rng) {
  if (!form || typeof form !== 'object') return null;
  const standing = findPoetPiece(form.poetId, form.pieceId);
  const register = standing && typeof standing.register === 'string' ? standing.register : null;
  if (register !== REVISION_EMPTY_REGISTER && register !== REVISION_CROWDED_REGISTER) return null;
  const cache = POET_REGISTERS[form.poetId] ?? [];
  const bands =
    register === REVISION_EMPTY_REGISTER
      ? ['between', REVISION_CROWDED_REGISTER]
      : ['between', REVISION_EMPTY_REGISTER];
  const draw = typeof rng === 'function' ? rng : () => 0.5;
  for (const band of bands) {
    const pool = cache.filter((p) => p.register === band && p.id !== form.pieceId);
    if (pool.length === 0) continue;
    const piece = pool[Math.min(pool.length - 1, Math.floor(draw() * pool.length))];
    return {
      poetId: form.poetId,
      pieceId: piece.id,
      layout: piece.layout,
      density: piece.density,
      ...(form.script === 'kana' ? { script: 'kana' } : {}),
    };
  }
  return null;
}
