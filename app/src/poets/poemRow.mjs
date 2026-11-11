// poets/poemRow.mjs — FIELD poem group (#1918): the pure half.
//
// Matt's rulings (2026-11-01): one slim group `poem: [POET — FIRST WORDS…] [FORM] [KEEP] [HOLD]`. On the mode strip, right of motion (Matt 2026-11-02).
// This module names the standing poem for that row (the decks carry ids + lines, no display names),
// banks a kept poem, and fixes the seeded sub-streams every poem re-deal draws from. No store, no
// React — layoutSlice is the single write site and the row only reads.

import { POET_DECKS, sanitizeFieldForm } from './fieldForm.js';

/** Display surname per deck. Greenleaf is Whittier (John Greenleaf Whittier), per the #1917/#1918 rulings. */
export const POET_SURNAMES = Object.freeze({
  greenleaf: 'Whittier',
  teijo: 'Nakamura',
  rosselli: 'Rosselli',
  gibson: 'Gibson',
});

/** The FORM chip's readout, in the spec vocabulary (#1918 ruling 2). Written as words; CSS sets the case (DS §5). */
export const POET_FORMS = Object.freeze({
  greenleaf: 'held',
  teijo: 'haiku',
  rosselli: 'quadro',
  gibson: 'fragment',
});

/**
 * Seeded sub-streams for a poem deal outside the CURATOR press (KINETIC passes, the identity chip),
 * on CH.curate beside the press's own (+0x10000..+0x40000). Index = the document's poemDeal counter:
 * every deal advances it, so deals vary while a recorded take carries the materialized form itself.
 */
export const POEM_PICK_BASE = 0x50000;
export const POEM_PLACE_BASE = 0x60000;

/**
 * #2003 — the RAY GUN tap-seed stream, beside the poem-deal streams on
 * CH.curate. Index = the session's ray-gun tap counter (layoutSlice's
 * raygunTap), never the poemDeal counter: a tap draws its seed here only,
 * so the poem deals replay bit-identically whether or not the gun was
 * ever fired. The drawn seed rides the form's raygun record; the blast is
 * recomputed from it on every draw (poets/rayGunForm.js).
 */
export const POEM_RAYGUN_BASE = 0x70000;

/**
 * #2010 P5 — the DOCTRINE draw streams, beside the poem-deal streams on CH.curate: the treatment a doctrine arms AT
 * DEAL (the Director's call) is drawn here, indexed by the deal that lands it — poemDeal for a landPoem deal, the
 * press counter for a CURATOR press deal — so a deal's doctrine arm replays with the deal and never advances the
 * performer's ray-gun tap counter (a doctrine-handed stage leaves the performer's own tap stream exactly where it was).
 */
export const POEM_DOCTRINE_BASE = 0x80000;
export const POEM_DOCTRINE_PRESS_BASE = 0x90000;

/** How many poems a take banks before the oldest falls off. */
export const MAX_POEM_KEEPS = 16;

/** How many words the identity chip shows before the ellipsis. */
export const FIRST_WORDS = 3;

/**
 * Name a standing form for the row. Returns { poetId, pieceId, surname, firstWords, truncated, form }
 * or null when no poem stands (or the form is unknown to the decks).
 */
export function poemIdentity(fieldForm) {
  if (!fieldForm || typeof fieldForm !== 'object') return null;
  const deck = POET_DECKS[fieldForm.poetId];
  if (!deck) return null;
  const piece = deck.find((p) => p.id === fieldForm.pieceId);
  if (!piece) return null;
  const words = piece.lines.join(' ').split(/\s+/).filter(Boolean);
  return {
    poetId: fieldForm.poetId,
    pieceId: piece.id,
    surname: POET_SURNAMES[fieldForm.poetId] || fieldForm.poetId,
    firstWords: words.slice(0, FIRST_WORDS).join(' '),
    truncated: words.length > FIRST_WORDS,
    form: POET_FORMS[fieldForm.poetId] || '—',
  };
}

/** The identity of a form for keep de-duplication: poet + piece + placement (exact materialization). */
function keepKey(f) {
  return JSON.stringify([f.poetId, f.pieceId, f.layout, f.aspect, f.stamps.map((s) => [s.ch, s.x, s.y, s.rotation, s.em])]);
}

/**
 * Bank a standing form. Returns the next keeps list (oldest dropped past MAX_POEM_KEEPS), or the same
 * list when the form is invalid or already banked — KEEP twice is one keeper, not two.
 */
export function keepPoem(keeps, fieldForm) {
  const list = sanitizePoemKeeps(keeps);
  const form = sanitizeFieldForm(fieldForm);
  if (!form) return list;
  const key = keepKey(form);
  if (list.some((k) => keepKey(k) === key)) return list;
  return [...list, form].slice(-MAX_POEM_KEEPS);
}

/** True when this exact materialized form is already banked. */
export function isPoemKept(keeps, fieldForm) {
  const form = sanitizeFieldForm(fieldForm);
  if (!form || !Array.isArray(keeps)) return false;
  const key = keepKey(form);
  return keeps.some((k) => k && Array.isArray(k.stamps) && keepKey(k) === key);
}

/** Trust-boundary door for a document's keeps: every entry re-validated, capped. Never throws. */
export function sanitizePoemKeeps(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const k of raw) {
    const f = sanitizeFieldForm(k);
    if (f) out.push(f);
  }
  return out.slice(-MAX_POEM_KEEPS);
}
