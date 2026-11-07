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
import {
  placePiece,
  stampIdForChar,
  nativeStampIdForChar,
  lowerStampIdForChar,
  punctStampIdForChar,
  serifStampIdForChar,
  plateStampIdForChar,
  ornamentStampIdForChar,
  stampWidthEm,
  LETTER_STAMP_IDS,
  LOWER_STAMP_IDS,
  PUNCT_STAMP_IDS,
  SERIF_STAMP_IDS,
  PLATE_STAMP_IDS,
  ORNAMENT_STAMP_IDS,
  ORNAMENT_GLYPH_BY_ID,
  NATIVE_STAMP_IDS,
  PLACEMENT_LAYOUTS,
} from './placement.js';

// #2002 — the stamp classes the gate and the door judge by. A stamp is
// honest in a class when its id is in the class's set AND its glyph is the
// glyph that id names (the glyph/id pairing law every slice enforces).
const isBaseLetter = (s) => LETTER_STAMP_IDS.has(s.assetId) && stampIdForChar(s.ch) === s.assetId;
const isLower = (s) => LOWER_STAMP_IDS.has(s.assetId) && lowerStampIdForChar(s.ch) === s.assetId;
const isPunct = (s) => PUNCT_STAMP_IDS.has(s.assetId) && punctStampIdForChar(s.ch) === s.assetId;
const isSerifLetter = (s) => SERIF_STAMP_IDS.has(s.assetId) && serifStampIdForChar(s.ch) === s.assetId;
const isPlateLetter = (s) => PLATE_STAMP_IDS.has(s.assetId) && plateStampIdForChar(s.ch) === s.assetId;
const isNativeStamp = (s) => NATIVE_STAMP_IDS.has(s.assetId) && nativeStampIdForChar(s.ch) === s.assetId;
const isOrnament = (s) => ORNAMENT_STAMP_IDS.has(s.assetId) && ornamentStampIdForChar(s.ch) === s.assetId;
const isDigitGlyph = (s) => typeof s.ch === 'string' && s.ch >= '0' && s.ch <= '9';

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
 * - charset: a stamp whose assetId is not the stamp for its glyph — the
 *   charset law failed, so the stamp does not exist. The letter law stands
 *   (A-Z + 0-9); #1982 adds the native-script set as a second, CONTEXT-BOUND
 *   charset: a native stamp passes only when the caller affirms the native
 *   context (`allowKana` — a native deal at the deal site, a declared
 *   native form at the document door). The affirmed charset is the native
 *   face as ONE set: slice 1 shipped it kana-only; #1998 admits the curated
 *   kanji into the same face (NATIVE_STAMP_IDS = kana ∪ kanji), so a mixed
 *   kanji+kana form is judged whole, never as two scripts. Everywhere else
 *   a native stamp is refused, exactly as any other non-letter glyph
 *   always was. (The flag keeps its slice-1 name: it affirms the face the
 *   form marker calls 'kana' — the native face's on-disk name since #1982.)
 *   #2002 grows the Latin side on the same discipline, in three parts:
 *   the BASE charset grows (Anton lowercase + the punctuation set join the
 *   caps and digits — one face, freely mixed); the SERIF face is a second,
 *   face-bound charset affirmed by `face: 'serif'` (serif letter stamps
 *   pass only there, base letter stamps are refused there, and the shared
 *   stamps — digits and punctuation — pass in both faces); and ORNAMENT
 *   stamps carry the break-only law — they pass in a Latin-face context
 *   (base or serif, never the native context) only standing ALONE on their
 *   baseline row: an ornament sharing its row with any other stamp is
 *   glyph-adjacent inside a line, and is refused as a charset stillborn.
 *   #2005 adds the PLATE face on the same discipline, affirmed by
 *   `plate: true` (the clean plate — a third, face-bound charset: plate
 *   letter stamps pass only there, base and serif letter stamps are
 *   refused there, and the shared stamps — digits and punctuation — pass
 *   in every Latin face; ornaments stay Latin-face furniture there too).
 * - fit: a stamp that cannot fit its module — crushed below
 *   FIELD_MIN_LEGIBLE_EM by the fit shrink, or ink that lands off the dish.
 * - overlap: two stamps whose ink boxes intersect — glyphs piled into each
 *   other destroy the line they were meant to form.
 * Ink boxes come from the measured glyph metrics (placement.stampWidthEm):
 * a stamp's ink is stampWidthEm(assetId, ch)*em wide and em tall, centred
 * on (x, y) — a serif stamp measures with its own face's ruler, every
 * other stamp with the base ruler it has always used.
 * Pure: same stamps in, same verdict out.
 */
export function gateFieldForm(stamps, { aspect = DEFAULT_FIELD_ASPECT, allowKana = false, face, plate = false } = {}) {
  const asp = Number.isFinite(aspect) && aspect >= 0.5 && aspect <= 3 ? aspect : DEFAULT_FIELD_ASPECT;
  if (!Array.isArray(stamps) || stamps.length === 0) return Object.freeze({ ok: false, reason: 'fit', stampIndex: -1 });
  const serifForm = face === 'serif';
  const plateForm = plate === true;
  const ornamentIdx = [];
  for (let j = 0; j < stamps.length; j++) {
    const s = stamps[j];
    if (!s || typeof s !== 'object') return Object.freeze({ ok: false, reason: 'charset', stampIndex: j });
    if (plateForm) {
      // The plate face: its own letters, plus the face-shared stamps
      // (digits and punctuation — never base or serif letters, never native).
      if (isPlateLetter(s) || isPunct(s) || (isBaseLetter(s) && isDigitGlyph(s))) continue;
    } else if (serifForm) {
      // The serif face: its own letters, plus the face-shared stamps
      // (digits and punctuation — never base letters, never native).
      if (isSerifLetter(s) || isPunct(s) || (isBaseLetter(s) && isDigitGlyph(s))) continue;
    } else {
      // The base face: caps, digits, lowercase and punctuation, one charset.
      if (isBaseLetter(s) || isLower(s) || isPunct(s)) continue;
      if (allowKana && isNativeStamp(s)) continue;
    }
    // Ornaments are Latin-face furniture: admitted in either Latin face,
    // never in the native context, and only under the break-only law
    // (judged on the whole list below, once every stamp is classified).
    if (!allowKana && isOrnament(s)) {
      ornamentIdx.push(j);
      continue;
    }
    return Object.freeze({ ok: false, reason: 'charset', stampIndex: j });
  }
  // #2002 — the break-only law: an ornament stamp must stand alone on its
  // baseline row. Rows are exact in placement (one y per line, rows pitched
  // a full em or more apart), so a shared y is a shared line.
  for (const j of ornamentIdx) {
    for (let k = 0; k < stamps.length; k++) {
      if (k !== j && Math.abs(stamps[k].y - stamps[j].y) <= GATE_EPS) {
        return Object.freeze({ ok: false, reason: 'charset', stampIndex: j });
      }
    }
  }
  for (let j = 0; j < stamps.length; j++) {
    const s = stamps[j];
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.em) || s.em < FIELD_MIN_LEGIBLE_EM) {
      return Object.freeze({ ok: false, reason: 'fit', stampIndex: j });
    }
    const hw = (stampWidthEm(s.assetId, s.ch) * s.em) / 2;
    if (s.x - hw < -GATE_EPS || s.x + hw > asp + GATE_EPS || s.y - s.em / 2 < -GATE_EPS || s.y + s.em / 2 > 1 + GATE_EPS) {
      return Object.freeze({ ok: false, reason: 'fit', stampIndex: j });
    }
  }
  for (let i = 0; i < stamps.length; i++) {
    const p = stamps[i];
    const pw = stampWidthEm(p.assetId, p.ch) * p.em;
    for (let j = i + 1; j < stamps.length; j++) {
      const q = stamps[j];
      const xOverlap = (pw + stampWidthEm(q.assetId, q.ch) * q.em) / 2 - Math.abs(p.x - q.x);
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
  // #1982 — the script is the Director's visual call, carried on the decision
  // (choosePoet sets it only for a Teijo pick in a Japanese-context room).
  // A native deal places the piece's native face through the same recipes; a
  // piece with no native face deals its Latin lines — the deck is the
  // authority, the script is a face it may or may not carry.
  // #1998 — the native face has two depths: nativeLines (real orthography,
  // kanji + kana mixed) are served when the piece carries them, kanaLines
  // (the slice-1 kana rendering) otherwise. One face, one marker ('kana'),
  // one gate — the deal never carries two script calls.
  const nativeLines =
    Array.isArray(piece.nativeLines) && piece.nativeLines.length > 0
      ? piece.nativeLines
      : Array.isArray(piece.kanaLines) && piece.kanaLines.length > 0
        ? piece.kanaLines
        : null;
  const kana = decision.script === 'kana' && nativeLines !== null;
  // #2002 — the face is the Director's call too, carried on the decision on
  // the script marker's pattern: decision.face === 'serif' deals Whittier
  // (greenleaf) in the serif face. The face is Whittier's alone — under any
  // other poet the call is not honoured and the deal deals the base face,
  // exactly as a script call on a deck with no native face deals Latin (the
  // door refuses a serif form under another poet, so the deal never deals
  // one). A native deal outranks the face: the faces never compose.
  // #2005 — the plate is the same kind of call, one register deeper:
  // decision.plate === true deals Whittier as a PLATE — set in the plate
  // face under the plate discipline (placement.js), the form carrying the
  // `plate` register. Whittier's alone, on the serif law; and where both
  // calls ride one decision the plate SUPERSEDES the serif face and the
  // plate break — a plate is the solo room's whole treatment for that deal,
  // not a layer over the reading room's lesser ones (the plateBreak
  // furniture is the serif deal's pause; a plate's lines keep their own
  // air). A native deal outranks the plate as it outranks the face.
  const plate = !kana && decision.plate === true && decision.poetId === 'greenleaf';
  const serif = !kana && !plate && decision.face === 'serif' && decision.poetId === 'greenleaf';
  // #2002 — the sentence face: decision.case deals the piece's caseLines —
  // the deck's own rendering of the same words in lowercase + punctuation
  // (deck data, parallel to nativeLines) — when the piece carries them.
  const caseLines =
    !kana && decision.case === true && Array.isArray(piece.caseLines) && piece.caseLines.length > 0
      ? piece.caseLines
      : null;
  // #2002 — the plate break: decision.plateBreak names an ornament BY ID,
  // and the deal honours it on a Latin-face deal of a multi-line piece
  // whose recipe keeps lines as rows — never 'single', which joins its
  // lines into one baseline where a break stamp would sit inside the line.
  // The ornament rides in as its own line between the first line and the
  // rest, and the form carries the break marker (the door judges it).
  let dealLines = kana ? nativeLines : (caseLines ?? piece.lines);
  let breakId = null;
  const pieceLayout = PLACEMENT_LAYOUTS.includes(piece.layout) ? piece.layout : 'bands';
  if (
    !kana &&
    !plate &&
    typeof decision.plateBreak === 'string' &&
    ORNAMENT_STAMP_IDS.has(decision.plateBreak) &&
    pieceLayout !== 'single' &&
    dealLines.length >= 2
  ) {
    dealLines = [dealLines[0], ORNAMENT_GLYPH_BY_ID.get(decision.plateBreak), ...dealLines.slice(1)];
    breakId = decision.plateBreak;
  }
  const { layout, stamps } = placePiece({ ...piece, lines: dealLines, density }, rng, {
    aspect: asp,
    face: plate ? 'plate' : serif ? 'serif' : undefined,
  });
  // #1932 — the threshold counts LETTERS: a plate-break ornament is
  // furniture between the poem's lines, not a letter of it (#2002).
  const letterStamps = stamps.reduce((n, s) => n + (ORNAMENT_STAMP_IDS.has(s.assetId) ? 0 : 1), 0);
  if (letterStamps < FIELD_POEM_MIN_STAMPS) return silent; // #1932 — the threshold: a fragment is not a poem
  // S4 (#1905) — the stillborn gate: a form that would spawn unreadable
  // never spawns. The deal falls back to silence and the verdict rides the
  // record (layoutSlice banks it on the commit as fieldGateRefusal).
  const gate = gateFieldForm(stamps, { aspect: asp, allowKana: kana, face: serif ? 'serif' : undefined, plate });
  if (!gate.ok) return { form: null, gate };
  return {
    form: {
      poetId: decision.poetId,
      pieceId: piece.id,
      layout,
      aspect: asp,
      ...(kana ? { script: 'kana' } : {}),
      ...(serif ? { face: 'serif' } : {}),
      ...(plate ? { plate: true } : {}),
      ...(breakId ? { break: breakId } : {}),
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
 * not a stamp for its glyph, a position off the dish, a non-finite
 * size/rotation, or a stamp count outside 1..MAX_FIELD_STAMPS. #1982: a
 * native stamp is honest only inside a declared native form (script:
 * 'kana') under Teijo, the one poet whose deck carries the script. #1998:
 * the declared face is the whole native set — kana or curated kanji, each
 * glyph-matched to its id; a Latin stamp inside it, or a native stamp
 * under any other marker or poet, is refused whole. #2002: the base Latin
 * charset grows (lowercase + punctuation stamps are honest in any base
 * form, glyph-matched), and two more markers ride the same discipline —
 * `face: 'serif'` declares the serif face (Whittier only; serif letters
 * honest only inside it, base letters refused inside it, digits and
 * punctuation shared), and `break: <ornament id>` declares the form's
 * plate break (the named ornament's stamps must be present, no other
 * ornament may ride, and no marker may stand without its stamps). The
 * faces never compose: face + script together is refused whole.
 * #2005: a third register rides the same discipline — `plate: true`
 * declares the form a clean plate (set in the plate face under the plate
 * discipline; Whittier only; plate stamps honest only inside it, base and
 * serif letters refused inside it, digits and punctuation shared). Any
 * other plate value refuses the form whole; plate + face and plate +
 * script are refused (the faces never compose), and plate + raygun is
 * refused whole — the two poles of FIELD type never mix on one form.
 */
export function sanitizeFieldForm(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { poetId, pieceId, layout, aspect, stamps, script, register, face, break: plateBreak, raygun, plate } = raw;
  if (!POET_DECKS[poetId]) return null;
  if (typeof pieceId !== 'string' || pieceId.length === 0) return null;
  if (!PLACEMENT_LAYOUTS.includes(layout)) return null;
  if (!Number.isFinite(aspect) || aspect < 0.5 || aspect > 3) return null;
  if (!Array.isArray(stamps) || stamps.length === 0 || stamps.length > MAX_FIELD_STAMPS) return null;
  // #1982 — the script marker: absent/'latin' is the letter charset; 'kana'
  // declares the native-script form. The native face is Teijo's — a native
  // form under any other poet, or native stamps under any other marker, is
  // dishonest data and is refused whole. #1998: the marker keeps its
  // slice-1 value (it is the on-disk contract since #1982); what it
  // declares is now the whole native set, kana + curated kanji.
  if (script !== undefined && script !== 'latin' && script !== 'kana') return null;
  const kanaForm = script === 'kana';
  if (kanaForm && poetId !== 'teijo') return null;
  // FIELD S5 (#1906) — the register marker: absent is the form's full voice;
  // 'whisper' is the quiet presentation register of the SAME placed field
  // (the stamp path draws it at WHISPER_ALPHA of the form's alpha — nothing
  // else moves). The marker follows the script marker's discipline exactly:
  // any other value is dishonest data and refuses the form whole. The deal
  // never sets it (fieldDealReport carries no register) — it is the
  // performer's toggle on a standing form, nothing upstream may arm it.
  if (register !== undefined && register !== 'whisper') return null;
  // #2003 — the ray-gun marker: the treatment record, on the register
  // pattern — { mode, seed } rides the form's persistence so a recorded
  // take re-renders treated. The STAMPS stored on the form stay the plain
  // dealt list (the gate below judges them, overlap rule included, exactly
  // as before); the blast itself is drawn from this record at render
  // (poets/rayGunForm.js, applied in buildPlacements) and is never stored,
  // because a treated list could not pass this door — overlap is its
  // whole licence. Present-but-dishonest refuses the form whole, as the
  // register does: the record is exactly one of the three modes and a
  // uint32 seed, nothing else.
  let raygunMark;
  if (raygun !== undefined) {
    if (!raygun || typeof raygun !== 'object' || Array.isArray(raygun)) return null;
    if (raygun.mode !== 'carson' && raygun.mode !== 'greiman' && raygun.mode !== 'shot') return null;
    if (!Number.isInteger(raygun.seed) || raygun.seed < 0 || raygun.seed > 0xffffffff) return null;
    raygunMark = { mode: raygun.mode, seed: raygun.seed };
  }
  // #2002 — the face marker: absent is the base (Anton) face; 'serif'
  // declares the serif face, Whittier's (greenleaf) alone. Any other value
  // is dishonest data and refuses the form whole, on the script marker's
  // discipline. The faces never compose: a serif declaration on a native
  // form is refused (and the poet law already keeps the two apart — Teijo
  // carries the script, Greenleaf the serif).
  if (face !== undefined && face !== 'serif') return null;
  const serifForm = face === 'serif';
  if (serifForm && poetId !== 'greenleaf') return null;
  if (serifForm && kanaForm) return null;
  // #2005 — the plate register: `plate: true` declares the form a clean
  // plate. Any other value (false, a string, a number) is dishonest data
  // and refuses the form whole, on the register marker's discipline. The
  // plate is Whittier's alone; it never stands on a native form; and the
  // faces never compose — a plate declaration beside the serif face is
  // refused whole. The two poles never mix: a form claiming a plate AND a
  // ray-gun record is refused whole, whichever order the record was
  // written in (the store's ray-gun cycle also refuses to arm on a plate —
  // layoutSlice.cyclePoemRaygun — so the claim can only arrive as data).
  if (plate !== undefined && plate !== true) return null;
  const plateForm = plate === true;
  if (plateForm && poetId !== 'greenleaf') return null;
  if (plateForm && kanaForm) return null;
  if (plateForm && serifForm) return null;
  if (plateForm && raygunMark !== undefined) return null;
  // #2002 — the break marker: the ornament id of the form's plate break.
  // It must name a real ornament stamp, and it is refused in a native form
  // (ornaments are Latin-face furniture — charset purity). Its agreement
  // with the stamps is judged in the loop below and after it: an ornament
  // stamp riding without the marker, a break stamp of another ornament,
  // or the marker standing without its stamps all refuse the form whole.
  if (plateBreak !== undefined && (typeof plateBreak !== 'string' || !ORNAMENT_STAMP_IDS.has(plateBreak))) return null;
  if (plateBreak !== undefined && kanaForm) return null;
  const out = new Array(stamps.length);
  let ornamentStamps = 0;
  for (let j = 0; j < stamps.length; j++) {
    const s = stamps[j];
    if (!s || typeof s !== 'object') return null;
    if (typeof s.ch !== 'string' || s.ch.length !== 1) return null;
    const isLetter = isBaseLetter(s);
    const isNative = isNativeStamp(s);
    const isPlate = isPlateLetter(s);
    const orn = isOrnament(s);
    if (orn) {
      if (s.assetId !== plateBreak) return null; // an undeclared (or differently declared) break stamp
      ornamentStamps++;
    }
    if (
      kanaForm
        ? !isNative
        : plateForm
          ? !(isPlate || isPunct(s) || (isLetter && isDigitGlyph(s)) || orn)
          : serifForm
            ? !(isSerifLetter(s) || isPunct(s) || (isLetter && isDigitGlyph(s)) || orn)
            : !(isLetter || isLower(s) || isPunct(s) || orn)
    )
      return null;
    if (!Number.isFinite(s.x) || s.x < 0 || s.x > aspect) return null;
    if (!Number.isFinite(s.y) || s.y < 0 || s.y > 1) return null;
    if (!Number.isFinite(s.rotation)) return null;
    if (!Number.isFinite(s.em) || s.em <= 0 || s.em > 0.3) return null;
    out[j] = { assetId: s.assetId, ch: s.ch, x: s.x, y: s.y, rotation: s.rotation, em: s.em };
  }
  if (plateBreak !== undefined && ornamentStamps === 0) return null; // the marker stands without its stamps
  // S4 (#1905) — the stillborn gate guards this door too: a stored form
  // whose stamps are individually honest but jointly unreadable (ink off
  // the dish, glyphs overlapping, type crushed under the legibility
  // floor) is refused whole, exactly as at the deal. #2002: the gate also
  // judges the break-only law here — an ornament sharing its row with
  // another stamp never passes this door.
  if (!gateFieldForm(out, { aspect, allowKana: kanaForm, face: serifForm ? 'serif' : undefined, plate: plateForm }).ok) return null;
  return {
    poetId,
    pieceId,
    layout,
    aspect,
    ...(kanaForm ? { script: 'kana' } : {}),
    ...(serifForm ? { face: 'serif' } : {}),
    ...(plateForm ? { plate: true } : {}),
    ...(plateBreak !== undefined ? { break: plateBreak } : {}),
    ...(register === 'whisper' ? { register: 'whisper' } : {}),
    ...(raygunMark !== undefined ? { raygun: raygunMark } : {}),
    stamps: out,
  };
}
