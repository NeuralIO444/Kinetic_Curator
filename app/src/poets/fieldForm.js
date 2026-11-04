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
//
// FIELD S4 (#1905) completes that law at the deal itself: `gateFieldForm`
// judges a placed form for legibility — charset, fit, overlap — and
// `fieldDealReport` refuses a stillborn deal (silence) WITH its verdict
// attached, so the refusal is a record, never a silent null. The same gate
// runs inside sanitizeFieldForm: a stored form that would spawn unreadable
// is refused at the document door too.

import { GREENLEAF } from './greenleaf.js';
import { TEIJO } from './teijo.js';
import { ROSSELLI } from './rosselli.js';
import { GIBSON } from './gibson.js';
import { placePiece, stampIdForChar, glyphWidthEm, LETTER_STAMP_IDS, PLACEMENT_LAYOUTS } from './placement.js';

export const POET_DECKS = Object.freeze({
  greenleaf: GREENLEAF,
  teijo: TEIJO,
  rosselli: ROSSELLI,
  gibson: GIBSON,
});

/** Hard ceiling on a form's stamp count (a poem is dozens of glyphs, not thousands). */
export const MAX_FIELD_STAMPS = 200;

/**
 * #1932 — the poem threshold (Matt's clarification, 2026-11-03: a poem forms
 * only once enough letters are on stage to form one — "not just three random
 * shapes"). Measured over the shipped decks with placePiece itself (every
 * piece × densities {0, 0.25, 0.5, 0.8, 1} × aspects {0.6, 1, 10/7, 16/9,
 * 2.6}; the count is structural — one stamp per non-space glyph — so it does
 * not move): every real piece places 15–35 stamps, the smallest being Gibson
 * w2 ('CHROME' / 'AND THE CUT') at 15. The gate sits at 12 — under every
 * complete poem in the decks, and over any fragment: the longest single word
 * in any deck is 9 letters, so no word, and no scrap of two short words,
 * clears it. A dealt piece that places fewer stamps than this is a fragment,
 * not a poem, and the deal is silence.
 */
export const FIELD_POEM_MIN_STAMPS = 12;

export const DEFAULT_FIELD_ASPECT = 10 / 7;

/**
 * FIELD S4 (#1905) — the legibility floor: a stamp whose cap height is
 * smaller than this is not type, it is a smudge, and a form carrying one is
 * stillborn. Placement fits a module by shrinking it (fitEm), so a line
 * that cannot fit its module at a readable size is exactly a form crushed
 * under this floor. Grounded by measurement, not taste: over every shipped
 * deck piece × densities {0, 0.25, 0.5, 0.8, 1} × aspects {0.5, 0.6, 1,
 * 10/7, 16/9, 2.6, 3} (the deal path's full aspect range), the smallest em
 * placePiece ever deals a real poem is 0.0180 (greenleaf g1, density 1,
 * aspect 0.5). The floor sits at 0.010 — a form must be crushed to ~55% of
 * the smallest form the decks ever place before the gate calls it
 * stillborn. The battery (curator/fieldBattery.selfcheck.mjs) re-measures
 * the shipped minimum and fails if a real placement ever comes near it.
 */
export const FIELD_MIN_LEGIBLE_EM = 0.01;

/** Float dust only: shipped recipes separate ink boxes by TRACK*em (>= 0.0028). */
const GATE_EPS = 1e-6;

/**
 * FIELD S4 (#1905) — the stillborn gate. Judges a PLACED form (a stamp list
 * in unit dish space, as placePiece deals it) for legibility under its
 * constraint, and returns a frozen verdict:
 *   { ok: true, reason: 'ok' }
 *   { ok: false, reason: 'charset' | 'fit' | 'overlap', stampIndex }
 * - charset: a stamp whose assetId is not the letter stamp for its glyph —
 *   the charset law (A-Z + 0-9 only) failed, so the stamp does not exist.
 * - fit: a stamp that cannot fit its module — crushed below
 *   FIELD_MIN_LEGIBLE_EM by the fit shrink, or ink that lands off the dish.
 * - overlap: two stamps whose ink boxes intersect — glyphs piled into each
 *   other destroy the line they were meant to form.
 * Ink boxes come from the measured glyph metrics (placement.glyphWidthEm):
 * a stamp's ink is glyphWidthEm(ch)*em wide and em tall, centred on (x, y).
 * Pure: same stamps in, same verdict out.
 */
export function gateFieldForm(stamps, { aspect = DEFAULT_FIELD_ASPECT } = {}) {
  const asp = Number.isFinite(aspect) && aspect >= 0.5 && aspect <= 3 ? aspect : DEFAULT_FIELD_ASPECT;
  if (!Array.isArray(stamps) || stamps.length === 0) return Object.freeze({ ok: false, reason: 'fit', stampIndex: -1 });
  for (let j = 0; j < stamps.length; j++) {
    const s = stamps[j];
    if (!s || typeof s !== 'object' || !LETTER_STAMP_IDS.has(s.assetId) || stampIdForChar(s.ch) !== s.assetId) {
      return Object.freeze({ ok: false, reason: 'charset', stampIndex: j });
    }
  }
  for (let j = 0; j < stamps.length; j++) {
    const s = stamps[j];
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.em) || s.em < FIELD_MIN_LEGIBLE_EM) {
      return Object.freeze({ ok: false, reason: 'fit', stampIndex: j });
    }
    const hw = (glyphWidthEm(s.ch) * s.em) / 2;
    if (s.x - hw < -GATE_EPS || s.x + hw > asp + GATE_EPS || s.y - s.em / 2 < -GATE_EPS || s.y + s.em / 2 > 1 + GATE_EPS) {
      return Object.freeze({ ok: false, reason: 'fit', stampIndex: j });
    }
  }
  for (let i = 0; i < stamps.length; i++) {
    const p = stamps[i];
    const pw = glyphWidthEm(p.ch) * p.em;
    for (let j = i + 1; j < stamps.length; j++) {
      const q = stamps[j];
      const xOverlap = (pw + glyphWidthEm(q.ch) * q.em) / 2 - Math.abs(p.x - q.x);
      if (xOverlap <= GATE_EPS) continue;
      const yOverlap = (p.em + q.em) / 2 - Math.abs(p.y - q.y);
      if (yOverlap > GATE_EPS) return Object.freeze({ ok: false, reason: 'overlap', stampIndex: j });
    }
  }
  return Object.freeze({ ok: true, reason: 'ok' });
}

/**
 * Deal a form from a Director decision, WITH the deal's record attached.
 * Returns { form, gate }:
 * - form: the layoutParams.fieldForm payload, or null for silence.
 * - gate: the stillborn gate's verdict when the gate refused the deal
 *   (form is null because the form would have spawned unreadable — S4),
 *   otherwise null. Plain silence (no decision, unknown poet/piece, a
 *   fragment under the #1932 threshold) is not a gate refusal and reports
 *   gate: null — the record distinguishes "the Director dealt nothing"
 *   from "the gate stopped a stillborn form", so a refusal is never
 *   mistaken for silence.
 * `decision` is the tick's poet ({ poetId, pieceId, layout?, density? }) or
 * a choosePoet decision; the piece itself is always re-read from the deck
 * (the deck is the authority — a decision names a piece, it does not carry
 * one). The decision's density (genre-lean adjusted at pick time) wins over
 * the deck's when present.
 */
export function fieldDealReport(decision, rng, { aspect = DEFAULT_FIELD_ASPECT } = {}) {
  const silent = { form: null, gate: null };
  if (!decision || typeof decision !== 'object') return silent;
  const deck = POET_DECKS[decision.poetId];
  if (!deck) return silent;
  const piece = deck.find((p) => p.id === decision.pieceId);
  if (!piece) return silent;
  const density = Number.isFinite(decision.density) ? decision.density : piece.density;
  const asp = Number.isFinite(aspect) && aspect >= 0.5 && aspect <= 3 ? aspect : DEFAULT_FIELD_ASPECT;
  const { layout, stamps } = placePiece({ ...piece, density }, rng, { aspect: asp });
  if (stamps.length < FIELD_POEM_MIN_STAMPS) return silent; // #1932 — the threshold: a fragment is not a poem
  // S4 (#1905) — the stillborn gate: a form that would spawn unreadable
  // never spawns. The deal falls back to silence and the verdict rides the
  // record (layoutSlice banks it on the commit as fieldGateRefusal).
  const gate = gateFieldForm(stamps, { aspect: asp });
  if (!gate.ok) return { form: null, gate };
  return {
    form: {
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
    },
    gate: null,
  };
}

/**
 * Deal a form from a Director decision. `decision` is the tick's poet
 * ({ poetId, pieceId, layout?, density? }) or a choosePoet decision; the
 * piece itself is always re-read from the deck (the deck is the authority —
 * a decision names a piece, it does not carry one). The decision's density
 * (genre-lean adjusted at pick time) wins over the deck's when present.
 * Returns the layoutParams.fieldForm payload, or null for silence
 * (null decision, unknown poet/piece, a piece that places fewer than
 * FIELD_POEM_MIN_STAMPS stamps — #1932: a fragment is not a poem — or a
 * stillborn form the S4 gate refused; use fieldDealReport when the
 * refusal itself matters).
 */
export function fieldFormForDeal(decision, rng, opts = {}) {
  return fieldDealReport(decision, rng, opts).form;
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
  // S4 (#1905) — the stillborn gate guards this door too: a stored form
  // whose stamps are individually honest but jointly unreadable (ink off
  // the dish, glyphs overlapping, type crushed under the legibility
  // floor) is refused whole, exactly as at the deal.
  if (!gateFieldForm(out, { aspect }).ok) return null;
  return { poetId, pieceId, layout, aspect, stamps: out };
}
