// poets/fieldForm.js — FIELD S3 (#1904): the armed form as data.
//
// The Director's pick (a { poetId, pieceId } deal) becomes a placement the
// stamp path can carry: `fieldFormForDeal` places the dealt piece off the
// caller's seeded stream and returns the payload that rides the layer's
// recipe data (layoutParams.fieldForm). Silence is null — no payload, no
// stamps, the dish exactly as it was.
//
// `sanitizeFieldForm` is the trust-boundary door for that payload (mirrors
// sanitizeFieldMap's discipline): the params live in the project document,
// which can be hand-edited or arrive from an older build, so the stamp path
// re-validates on every read. A form that fails validation is refused whole
// (null) — a stillborn form never spawns (the S4 law, enforced early here).

import { GREENLEAF } from './greenleaf.js';
import { TEIJO } from './teijo.js';
import { ROSSELLI } from './rosselli.js';
import { GIBSON } from './gibson.js';
import { placePiece, stampIdForChar, LETTER_STAMP_IDS, PLACEMENT_LAYOUTS } from './placement.js';

export const POET_DECKS = Object.freeze({
  greenleaf: GREENLEAF,
  teijo: TEIJO,
  rosselli: ROSSELLI,
  gibson: GIBSON,
});

/** Hard ceiling on a form's stamp count (a poem is dozens of glyphs, not thousands). */
export const MAX_FIELD_STAMPS = 200;

export const DEFAULT_FIELD_ASPECT = 10 / 7;

/**
 * Deal a form from a Director decision. `decision` is the tick's poet
 * ({ poetId, pieceId, layout?, density? }) or a choosePoet decision; the
 * piece itself is always re-read from the deck (the deck is the authority —
 * a decision names a piece, it does not carry one). The decision's density
 * (genre-lean adjusted at pick time) wins over the deck's when present.
 * Returns the layoutParams.fieldForm payload, or null for silence
 * (null decision, unknown poet/piece, or a piece that places no stamps).
 */
export function fieldFormForDeal(decision, rng, { aspect = DEFAULT_FIELD_ASPECT } = {}) {
  if (!decision || typeof decision !== 'object') return null;
  const deck = POET_DECKS[decision.poetId];
  if (!deck) return null;
  const piece = deck.find((p) => p.id === decision.pieceId);
  if (!piece) return null;
  const density = Number.isFinite(decision.density) ? decision.density : piece.density;
  const asp = Number.isFinite(aspect) && aspect >= 0.5 && aspect <= 3 ? aspect : DEFAULT_FIELD_ASPECT;
  const { layout, stamps } = placePiece({ ...piece, density }, rng, { aspect: asp });
  if (!stamps.length) return null;
  return {
    poetId: decision.poetId,
    pieceId: piece.id,
    layout,
    aspect: asp,
    stamps: stamps.map((s) => ({
      assetId: s.assetId,
      ch: s.ch,
      x: s.x,
      y: s.y,
      rotation: s.rotation,
      em: s.em,
    })),
  };
}

/**
 * Validate a raw fieldForm payload (document data). Returns a normalized
 * copy carrying only the known fields, or null when the form is absent or
 * dishonest in any particular — unknown poet or layout, a stamp id that is
 * not a letter stamp or does not match its glyph, a position off the dish,
 * a non-finite size/rotation, or a stamp count outside 1..MAX_FIELD_STAMPS.
 */
export function sanitizeFieldForm(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { poetId, pieceId, layout, aspect, stamps } = raw;
  if (!POET_DECKS[poetId]) return null;
  if (typeof pieceId !== 'string' || pieceId.length === 0) return null;
  if (!PLACEMENT_LAYOUTS.includes(layout)) return null;
  if (!Number.isFinite(aspect) || aspect < 0.5 || aspect > 3) return null;
  if (!Array.isArray(stamps) || stamps.length === 0 || stamps.length > MAX_FIELD_STAMPS) return null;
  const out = new Array(stamps.length);
  for (let j = 0; j < stamps.length; j++) {
    const s = stamps[j];
    if (!s || typeof s !== 'object') return null;
    if (!LETTER_STAMP_IDS.has(s.assetId)) return null;
    if (typeof s.ch !== 'string' || s.ch.length !== 1 || stampIdForChar(s.ch) !== s.assetId) return null;
    if (!Number.isFinite(s.x) || s.x < 0 || s.x > aspect) return null;
    if (!Number.isFinite(s.y) || s.y < 0 || s.y > 1) return null;
    if (!Number.isFinite(s.rotation)) return null;
    if (!Number.isFinite(s.em) || s.em <= 0 || s.em > 0.3) return null;
    out[j] = { assetId: s.assetId, ch: s.ch, x: s.x, y: s.y, rotation: s.rotation, em: s.em };
  }
  return { poetId, pieceId, layout, aspect, stamps: out };
}
