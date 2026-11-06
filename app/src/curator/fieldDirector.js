// fieldDirector.js — pure pick-time helpers for FIELD (poets) + Director headroom.
// Deterministic. No live loop. No inventing candidates. Seeded RNG only.

import { GREENLEAF } from '../poets/greenleaf.js';
import { TEIJO } from '../poets/teijo.js';
import { ROSSELLI } from '../poets/rosselli.js';
import { GIBSON } from '../poets/gibson.js';

export const POETS = Object.freeze({
  greenleaf: GREENLEAF,
  teijo: TEIJO,
  rosselli: ROSSELLI,
  gibson: GIBSON,
});

/**
 * #1932 — the genre gate: the look families whose rooms are TYPE-NATIVE
 * (Matt's clarification, 2026-11-03). Type belongs where lettering is the
 * room's own language — Swiss and Bauhaus design, and Japanese rooms (the
 * kanji contexts) — and stays out of the rest: organic fields (the Team
 * Lab-style rooms), grunge, op, memphis, engraved, marks, and every core
 * look that carries no style family. The Director reads the CURRENT dealt
 * look's family at pick time and passes eligibility in; a room outside
 * this set hears silence from FIELD, whatever its temperature. Membership
 * is a ruling, not a heuristic — change it here, by name.
 */
export const TYPE_NATIVE_FAMILIES = Object.freeze(new Set(['swiss', 'bauhaus', 'japanese']));

/** True when a look family (a data/styleLooks group id) is type-native (#1932). */
export const isTypeNativeFamily = (family) => typeof family === 'string' && TYPE_NATIVE_FAMILIES.has(family);

/** Preferred next rooms (adjacency). Data only. Used at pick time. */
export const ROOM_TRANSITIONS = Object.freeze({
  'THE CLASH': ['THE ROOM', 'AGREEMENT'],
  'THE ROOM': ['AGREEMENT', 'THE CLASH', 'DAVIS ALONE'],
  'FULL BURN': ['THE ROOM', 'THE CLASH'],
  AGREEMENT: ['THE ROOM', 'DAVIS ALONE'],
  'DAVIS ALONE': ['THE ROOM', 'AGREEMENT'],
});

/** Slow pacing debt: hot rooms in the last N keeps. Cap 6. Window 24 (#1907 fix):
 * a 12-keep burn streak must still read as debt after the room cools — at 8 the
 * streak flushed out of the window before the eval loop's 30-step scenario ends. */
export const SLOW_DEBT_CAP = 6;
export const SLOW_DEBT_WINDOW = 24;

/**
 * FIELD S4 (#1905) — keep pressure, the Curator's keep/pass velocity as the
 * intensity tracker already reads it (the sense module's normalizeKeepPassVelocity:
 * keeps-per-minute / 2, saturating at 2 decisions a minute). At or above this
 * line the pressure is HIGH: the room is being actively kept, and the pick
 * leans held and upright (spec: "Higher keep pressure or a cool room leans
 * toward Greenleaf or Teijo held forms"). 0.5 = a sustained one keep/pass
 * decision per minute. Like slow debt, pressure brakes a room that is not
 * already blazing — a live blaze (intensity > 0.65) outranks it, the #1907
 * precedence — so pressure never calls a hot room cool.
 */
export const KEEP_PRESSURE_HIGH = 0.5;

export function nextSlowDebt(history, currentVerdict) {
  const h = Array.isArray(history) ? history.slice(-SLOW_DEBT_WINDOW) : [];
  h.push(currentVerdict === 'FULL BURN' || currentVerdict === 'THE CLASH' ? 1 : 0);
  const sum = h.reduce((a, b) => a + b, 0);
  return { debt: Math.min(SLOW_DEBT_CAP, sum), history: h };
}

/**
 * Pure poet choice. Seeded. Cool / high-keep → greenleaf|teijo. Hot → rosselli|gibson.
 * Returns { poetId, piece, layout, density } or null (silence).
 *
 * #1932 — silence is the default and the poem is earned twice over: the
 * room must be TYPE-ELIGIBLE (its dealt look's family is type-native —
 * TYPE_NATIVE_FAMILIES above; the Director reads the family and affirms
 * eligibility), and the dealt piece must still clear the stamp threshold
 * where it is placed (poets/fieldForm.js, FIELD_POEM_MIN_STAMPS).
 * Eligibility defaults to false: a caller that cannot name the room's
 * family gets silence, not a poem.
 */
export function choosePoet({
  intensity = 0.5,
  slowDebt = 0,
  keepPressure = 0,
  genreLean = null,
  rng = () => 0.5,
  lastRejected = false,
  typeEligible = false,
  japaneseContext = false,
  bauhausContext = false,
  soloContext = false,
} = {}) {
  // #1932 — the genre gate outranks temperature: a non-type-native room is
  // silent, full stop.
  if (!typeEligible) return null;
  if (lastRejected && rng() < 0.7) return null; // damp after rejection
  // Precedence (#1907 fix): a live blaze outranks debt — debt brakes a neutral
  // room toward held forms, it does not call a hot room cool. As first written,
  // debt >= 3 forced the cool pool at any intensity, so a permanently hot room
  // measured hotBias ~0 against the module's own documented behaviour.
  // S4 (#1905): high keep pressure brakes the same way debt does — held and
  // upright in any room not already blazing — and loses to the same blaze.
  const cool =
    intensity < 0.35 ||
    (slowDebt >= 3 && intensity <= 0.65) ||
    (keepPressure >= KEEP_PRESSURE_HIGH && intensity <= 0.65);
  const hot = intensity > 0.65;
  const pool = cool
    ? ['greenleaf', 'teijo']
    : hot
      ? ['rosselli', 'gibson']
      : ['greenleaf', 'teijo', 'rosselli', 'gibson'];
  const poetId = pool[Math.floor(rng() * pool.length)] || 'greenleaf';
  const deck = POETS[poetId];
  if (!deck || deck.length === 0) return null;
  const piece = deck[Math.floor(rng() * deck.length)];
  const density = genreLean === 'dense' ? Math.min(1, (piece.density || 0.4) + 0.15) : piece.density || 0.4;
  return {
    poetId,
    pieceId: piece.id,
    lines: piece.lines,
    layout: piece.layout || 'bands',
    density,
    // #1982 — script is a visual, so it is the Director's call (the poets own
    // words + form): in a Japanese-context room a Teijo pick deals in her
    // native script. The marker rides the decision; fieldForm places the
    // deck's kanaLines for it, and a Swiss/Bauhaus room never sees it.
    ...(poetId === 'teijo' && japaneseContext ? { script: 'kana' } : {}),
    // #2002 (fix loop; Matt's ruling, 2026-11-06) — the slice-3 calls are the
    // Director's too, affirmed from the room on the script pattern (the
    // contexts are derived by fieldEval's step from the room as it stands;
    // none of them draws from the deal stream):
    // - face: the solo room (DAVIS ALONE — one artist in the room, nobody
    //   directing) is the reading room: a Whittier pick there stands in her
    //   book face, the print register. Hers alone, like Teijo's script.
    ...(poetId === 'greenleaf' && soloContext ? { face: 'serif' } : {}),
    // - case: a Bauhaus room deals the sentence face — the school's print
    //   culture wrote lowercase as a house style. No poet gate: the deck is
    //   the authority, and a deck with no caseLines deals its caps, exactly
    //   as a script call on a deck with no native face deals Latin.
    ...(bauhausContext ? { case: true } : {}),
    // - plateBreak: the solo room has space around the poem, and a
    //   long-form piece (3+ lines) gets its plate break — the section mark,
    //   the break furniture the epic names, called by id with no draw.
    //   fieldForm degrades the call where it cannot stand (a 'single'
    //   layout, a native deal).
    ...(soloContext && piece.lines.length >= 3 ? { plateBreak: 'typ_o_sect' } : {}),
  };
}

/** Preferred next room from adjacency, or null. Pure. */
export function preferredNext(currentVerdict, rng = () => 0.5) {
  const next = ROOM_TRANSITIONS[currentVerdict];
  if (!next || next.length === 0) return null;
  return next[Math.floor(rng() * next.length)];
}
