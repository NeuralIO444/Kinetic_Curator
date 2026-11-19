// hornLines.mjs — the horns' chat lines for THE ROOM (#2388, Persona Kernel P8). DRAFTS, UNSIGNED.
//
// The sign mechanism is the copy matrix's, extended: the words live in docs/research/directors-copy-matrix-horns-2026-11-19.md
// (the page Matt reads), this module carries them as data, and hornLines.selfcheck re-parses the page and fails on
// any character that differs. Every line is `signed: false` until Matt signs it; the page marks each line
// `Status: UNSIGNED` and signing is flipping that marker to `SIGNED` there AND `signed` to true here (the selfcheck
// fails if the two disagree). `linesForTurn` returns only signed lines, so NOTHING below renders today. Claude never
// signs a line.
//
// Voice: each horn speaks in its own register, grounded in its record (personas/*.mjs) and nothing else — BLAST: hot
// geometry, move the letters; HYBRID: colour, layers, pushes back on raw chaos, agrees with the grid; SWISS GRIT: the
// grid first, destruction by rule. No biography is invented. Callsigns only (R6); QUEEN and GOVERNOR never speak here.
//
// A line fires on a band turn (personas/bandLive.js, `band:turn`): a horn answering a call (agree / disagree / lay
// out) or, as the soloist, being cut by COVER. `{to}` is the addressee's callsign.
import { getPersona } from '../personas/registry.mjs';

/** @typedef {{ id:string, horn:'carson'|'greiman'|'ashworth', ctx:'agree'|'disagree'|'layOut'|'cut', to:(string|null), text:string, signed:boolean }} HornLine */

/** @type {HornLine[]} */
export const HORN_LINES = [
  { id: 'H01', horn: 'carson', ctx: 'agree', to: null, text: 'answers {to} — yes. Hotter.', signed: false },
  { id: 'H02', horn: 'carson', ctx: 'disagree', to: null, text: 'answers {to} — no.', signed: false },
  { id: 'H03', horn: 'carson', ctx: 'layOut', to: null, text: 'lays out. {to} has it.', signed: false },
  { id: 'H04', horn: 'carson', ctx: 'cut', to: 'lois', text: 'answers COVER — no.', signed: false },
  { id: 'H05', horn: 'greiman', ctx: 'agree', to: null, text: "answers {to} — yes. I'll build on it.", signed: false },
  {
    id: 'H06',
    horn: 'greiman',
    ctx: 'agree',
    to: 'ashworth',
    text: 'answers SWISS GRIT — yes. The grid holds.',
    signed: false,
  },
  {
    id: 'H07',
    horn: 'greiman',
    ctx: 'disagree',
    to: null,
    text: 'answers {to} — no. Try another colour.',
    signed: false,
  },
  { id: 'H08', horn: 'greiman', ctx: 'disagree', to: 'carson', text: 'answers BLAST — no. Too raw.', signed: false },
  { id: 'H09', horn: 'greiman', ctx: 'layOut', to: null, text: 'lays out. {to} has it.', signed: false },
  { id: 'H10', horn: 'greiman', ctx: 'cut', to: 'lois', text: 'answers COVER — heard.', signed: false },
  { id: 'H11', horn: 'ashworth', ctx: 'agree', to: null, text: 'answers {to} — yes. By rule.', signed: false },
  { id: 'H12', horn: 'ashworth', ctx: 'disagree', to: null, text: 'answers {to} — no. Set it first.', signed: false },
  { id: 'H13', horn: 'ashworth', ctx: 'layOut', to: null, text: 'lays out. {to} has it.', signed: false },
  {
    id: 'H14',
    horn: 'ashworth',
    ctx: 'cut',
    to: 'lois',
    text: 'answers COVER — noted. Back to the grid.',
    signed: false,
  },
];

/** The callsign a seat id shows as on a surface, or null (QUEEN and GOVERNOR are never named). */
export function callsignOf(id) {
  try {
    const c = getPersona(id).identity.callsign;
    return typeof c === 'string' && c ? c : null;
  } catch {
    return null;
  }
}

/** The line for a horn in a context, most specific first (an addressee-specific line, then the generic one). Signed only. */
export function lineFor(horn, ctx, to, lines = HORN_LINES) {
  const signed = lines.filter((l) => l.signed === true && l.horn === horn && l.ctx === ctx);
  return signed.find((l) => l.to === to && to) || signed.find((l) => l.to === null) || null;
}

const fill = (text, to) => text.replace('{to}', to || '');

/**
 * The chat lines one band turn earns: [{ persona, id, text }] in answer order. Only SIGNED lines; an unsigned
 * line never renders, so with the shipped (all unsigned) table this is always []. Pure.
 */
export function linesForTurn(turn, lines = HORN_LINES) {
  const out = [];
  if (!turn || turn.kind !== 'trade' || !Array.isArray(turn.answers)) return out;
  const caller = turn.by;
  const to = callsignOf(caller);
  for (const a of turn.answers) {
    if (!a || !['carson', 'greiman', 'ashworth'].includes(a.by) || !to) continue;
    const l = lineFor(a.by, a.verdict, caller, lines);
    if (l) out.push({ persona: a.by, id: l.id, text: fill(l.text, to) });
  }
  // the soloist cut by COVER answers COVER
  if (
    ['carson', 'greiman', 'ashworth'].includes(caller) &&
    turn.answers.some((a) => a && a.by === 'lois' && a.move === 'cut')
  ) {
    const l = lineFor(caller, 'cut', 'lois', lines);
    if (l) out.push({ persona: caller, id: l.id, text: fill(l.text, 'COVER') });
  }
  return out;
}
