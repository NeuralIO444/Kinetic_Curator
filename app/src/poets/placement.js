// poets/placement.js — FIELD S1 (#1902): the pure placement function.
//
// piece + layout mode + seeded rng -> a frozen stamp list in unit dish space.
// No stage, no clock, no Math.random: the rng is the caller's seeded stream, so
// a placement replays bit-for-bit (spec: "Deterministic. Seeded RNG only.").
//
// Unit dish space: y in [0, 1] (fraction of dish height, downward — canvas
// convention), x in [0, aspect] in HEIGHT units (x_px = x / aspect * canvasW),
// so a square module is square on a dish of the given aspect. Each stamp:
//   { assetId, ch, x, y, rotation, em }
// x/y are the stamp CENTRE; em is the glyph cap height as a fraction of dish
// height; rotation is degrees and is 0 under every shipped recipe (all four
// poets forbid free rotation — the value exists so the invariant is checkable).
//
// Glyph metrics: Anton is a condensed grotesque; letters sit on a shared
// advance so lines are measurable. A space is a placement GAP (wider advance,
// no stamp) — the charset law: A-Z + 0-9 exist as letter stamps, and (#1982,
// #1998) the native-script sets (kana + the curated kanji) exist as poem-only
// stamps for eligible Teijo deals; #2002 grows the Latin side — Anton a–z and
// the punctuation set as poem-only stamps, one serif face (PT Serif) as
// face-bound letter stamps for Whittier, and a handful of ornament stamps
// that exist only as plate breaks; any other character has no stamp and a
// line carrying one does not map.
//
// Recipes (spec table, docs/design/field-poets-spec-2026-10-31.md):
//   grid   Greenleaf — strict grid, even spacing, no rotation.
//   bands  Greenleaf/Teijo — stratified bands, locked baseline per line.
//   single Teijo/Gibson — one line module (the piece's lines joined by gaps),
//          locked baseline, generous negative space.
//   two    Gibson — two-line module, locked baselines, generous negative space.
//   square Rosselli — square CELLS packed edge-to-edge on both axes, module
//          origin snapped to the cell grid, no free rotation.
// Density scales spacing / module size monotonically per recipe (the spec's
// hot/cool behaviour in data form); it never changes the recipe's constraints.

import { ASSETS_LETTERS } from '../data/assets/assets-letterforms.js';
import { ASSETS_KANA } from '../data/assets/assets-kana.js';
import { ASSETS_KANJI } from '../data/assets/assets-kanji.js';
import { ASSETS_LATIN } from '../data/assets/assets-latin.js';
import { ASSETS_SERIF } from '../data/assets/assets-serif.js';
import { ASSETS_ORNAMENTS } from '../data/assets/assets-ornaments.js';
import { ASSETS_PLATE } from '../data/assets/assets-plate.js';
import { ASSETS_WEAR } from '../data/assets/assets-wear.js';

/** The 36 letter stamps that exist. Any other character has no stamp. */
export const LETTER_STAMP_IDS = Object.freeze(new Set(ASSETS_LETTERS.map((a) => a.id)));

/** 'A' -> 'typ_A', '7' -> 'typ_7'; anything else -> null (no stamp exists). */
export function stampIdForChar(ch) {
  const id = `typ_${ch}`;
  return LETTER_STAMP_IDS.has(id) ? id : null;
}

/**
 * #1982 (FIELD stamps slice 1) — the kana stamps: 163 poem-only stamps baked
 * from the kana pack (46 basic + 25 dakuten/handakuten + 10 small per script,
 * plus the long-vowel mark). They exist for the poem system alone: the pack
 * joins the catalogue after the authored bake so the census and the stage
 * atlas resolve them, and the pool panel (panels/assetPoolLogic.js) and the
 * placeable pool (gl/liveResolve.mjs) exclude them by this same id set.
 */
export const KANA_STAMP_IDS = Object.freeze(new Set(ASSETS_KANA.map((a) => a.id)));
const KANA_ID_BY_CHAR = new Map(ASSETS_KANA.map((a) => [a.glyph, a.id]));

/** 'あ' -> 'typ_h_a', 'ガ' -> 'typ_k_ga'; anything else -> null (no kana stamp exists). */
export function kanaStampIdForChar(ch) {
  return KANA_ID_BY_CHAR.get(ch) ?? null;
}

/**
 * #1998 (FIELD stamps slice 2) — the curated kanji stamps: 125 poem-only
 * stamps (Teijo's native-line kanji + the decks' season/nature/quiet
 * vocabulary; curated-only by the FIELD FONT RULING, never full jōyō). Same
 * road in as the kana pack: catalogue members, excluded from the pool panel
 * and every placeable pool by id (NATIVE_STAMP_IDS below is the union the
 * dealing surfaces exclude on).
 */
export const KANJI_STAMP_IDS = Object.freeze(new Set(ASSETS_KANJI.map((a) => a.id)));
const KANJI_ID_BY_CHAR = new Map(ASSETS_KANJI.map((a) => [a.glyph, a.id]));

/** '夏' -> 'typ_j_natsu'; anything else -> null (no kanji stamp exists). */
export function kanjiStampIdForChar(ch) {
  return KANJI_ID_BY_CHAR.get(ch) ?? null;
}

/**
 * The native-script face as ONE set (slice 1's kana + slice 2's kanji): a
 * native form's stamps are members of this union, each glyph-matched to its
 * id. The gate and the document door judge the face whole — a Latin stamp
 * inside a native form is refused, and a native stamp is honest only inside
 * a declared native form (fieldForm.js).
 */
export const NATIVE_STAMP_IDS = Object.freeze(new Set([...KANA_STAMP_IDS, ...KANJI_STAMP_IDS]));

/** 'あ' -> 'typ_h_a', '夏' -> 'typ_j_natsu'; anything else -> null (no native stamp exists). */
export function nativeStampIdForChar(ch) {
  return kanaStampIdForChar(ch) ?? kanjiStampIdForChar(ch);
}

/**
 * #2002 (FIELD stamps slice 3) — the Latin growth of the base face: Anton
 * lowercase (26) and the punctuation set (17), baked as their own pack on the
 * caps pack's reference (scripts/gen-latin.mjs). Same road in as the native
 * packs: catalogue members, poem-only, excluded from every dealing surface
 * by id (POEM_ONLY_STAMP_IDS below is the union those surfaces exclude on).
 * They are the BASE face's own charset, not a second face — a form may mix
 * caps, lowercase, digits and punctuation freely; the gate's Latin charset
 * is the union (fieldForm.js).
 */
export const LOWER_STAMP_IDS = Object.freeze(
  new Set(ASSETS_LATIN.filter((a) => a.tags.includes('lowercase')).map((a) => a.id)),
);
export const PUNCT_STAMP_IDS = Object.freeze(
  new Set(ASSETS_LATIN.filter((a) => a.tags.includes('punct')).map((a) => a.id)),
);
/** The whole Anton lowercase + punctuation pack, as one set. */
export const LATIN_STAMP_IDS = Object.freeze(new Set(ASSETS_LATIN.map((a) => a.id)));
const LATIN_ID_BY_CHAR = new Map(ASSETS_LATIN.map((a) => [a.glyph, a.id]));

/** 'a' -> 'typ_l_a'; anything else -> null (no lowercase stamp exists). */
export function lowerStampIdForChar(ch) {
  const id = LATIN_ID_BY_CHAR.get(ch);
  return id !== undefined && LOWER_STAMP_IDS.has(id) ? id : null;
}

/** '.' -> 'typ_p_period', '’' -> 'typ_p_rsquo'; anything else -> null (no punctuation stamp exists). */
export function punctStampIdForChar(ch) {
  const id = LATIN_ID_BY_CHAR.get(ch);
  return id !== undefined && PUNCT_STAMP_IDS.has(id) ? id : null;
}

/** 'a' -> 'typ_l_a', '.' -> 'typ_p_period'; anything else -> null (no slice-3 Latin stamp exists). */
export function latinStampIdForChar(ch) {
  return LATIN_ID_BY_CHAR.get(ch) ?? null;
}

/**
 * #2002 — the serif face: A–Z + a–z in PT Serif Bold (scripts/gen-serif.mjs),
 * Whittier's book face. Letter stamps are FACE-BOUND: a serif stamp is
 * honest only inside a serif-declared form (fieldForm.js carries the `face`
 * marker on the `script` marker's pattern), and base letter stamps are
 * refused inside one; digits and punctuation stamps are face-SHARED (the
 * base packs serve them in a serif form unchanged), so this pack is letters
 * only. The serif resolver is consulted only by a serif placement — the
 * base resolver below never returns a serif id.
 */
export const SERIF_STAMP_IDS = Object.freeze(new Set(ASSETS_SERIF.map((a) => a.id)));
const SERIF_ID_BY_CHAR = new Map(ASSETS_SERIF.map((a) => [a.glyph, a.id]));

/** 'A' -> 'typ_s_A', 'a' -> 'typ_s_a'; anything else -> null (no serif stamp exists). */
export function serifStampIdForChar(ch) {
  return SERIF_ID_BY_CHAR.get(ch) ?? null;
}

/**
 * #2002 — the ornaments: § ¶ † ‡ in PT Serif Bold (scripts/gen-ornaments.mjs;
 * the fleuron and asterism are absent from both bake fonts, the long dash
 * already ships as the face-shared punctuation stamp — see the generator).
 * BREAK-ONLY: an ornament exists only as a standalone plate-break stamp
 * between a poem's lines, never glyph-adjacent inside a line, never in a
 * native form — the gate and the door judge that law (fieldForm.js).
 */
export const ORNAMENT_STAMP_IDS = Object.freeze(new Set(ASSETS_ORNAMENTS.map((a) => a.id)));
const ORNAMENT_ID_BY_CHAR = new Map(ASSETS_ORNAMENTS.map((a) => [a.glyph, a.id]));
/** Ornament id -> its glyph ('typ_o_sect' -> '§'): the deal names a break by id. */
export const ORNAMENT_GLYPH_BY_ID = new Map(ASSETS_ORNAMENTS.map((a) => [a.id, a.glyph]));

/** '§' -> 'typ_o_sect'; anything else -> null (no ornament stamp exists). */
export function ornamentStampIdForChar(ch) {
  return ORNAMENT_ID_BY_CHAR.get(ch) ?? null;
}

/**
 * #2005 — the plate face: A–Z + a–z in Fraunces, instanced for display
 * (scripts/gen-plate.mjs: the variable font pinned at opsz 144 / wght 400 /
 * SOFT 0 / WONK 0), Whittier's plate face. Letter stamps are FACE-BOUND, on
 * the serif discipline: a plate stamp is honest only inside a plate-declared
 * form (fieldForm.js carries the `plate` register on the `register`
 * marker's pattern), base and serif letter stamps are refused inside one,
 * and digits and punctuation stamps are face-SHARED (the base packs serve
 * them in a plate form unchanged), so this pack is letters only. The plate
 * resolver is consulted only by a plate placement — the base resolver below
 * never returns a plate id.
 */
export const PLATE_STAMP_IDS = Object.freeze(new Set(ASSETS_PLATE.map((a) => a.id)));
const PLATE_ID_BY_CHAR = new Map(ASSETS_PLATE.map((a) => [a.glyph, a.id]));

/** 'A' -> 'typ_f_A', 'a' -> 'typ_f_a'; anything else -> null (no plate stamp exists). */
export function plateStampIdForChar(ch) {
  return PLATE_ID_BY_CHAR.get(ch) ?? null;
}

/**
 * #2010 (RAY GUN P1 · TORN & XEROXED) — the worn letters: a torn and a xerox
 * variant of every treatable Latin letter (Anton caps + lowercase, PT Serif),
 * baked from those packs' own outlines (scripts/gen-wear.mjs). Not a face of
 * their own: each variant names its source stamp (`wearOf`), measures with
 * its source's ruler (stampWidthEm), and is only ever reached by the ray
 * gun's draw moving a treated stamp to ITS OWN letter's variant
 * (poets/rayGunForm.js). No placement and no gate ever resolves one; a
 * stored form never carries one (the treated list is never stored).
 */
export const WEAR_KINDS = Object.freeze(['torn', 'xerox']);
export const WEAR_STAMP_IDS = Object.freeze(new Set(ASSETS_WEAR.map((a) => a.id)));
/** Worn id -> the source stamp it wears ('typ_tn_s_A' -> 'typ_s_A'). */
export const WEAR_SOURCE_BY_ID = new Map(ASSETS_WEAR.map((a) => [a.id, a.wearOf]));
const WEAR_ID_BY_SOURCE = new Map(
  ASSETS_WEAR.map((a) => [`${a.wearOf}|${a.tags.includes('torn') ? 'torn' : 'xerox'}`, a.id]),
);
/** The worn variant of a source stamp ('typ_A', 'torn' -> 'typ_tn_A'), or null when that stamp has no wear. */
export function wearStampIdFor(assetId, kind) {
  return WEAR_ID_BY_SOURCE.get(`${assetId}|${kind}`) ?? null;
}

/**
 * The poem-only union — EVERY stamp pack the FIELD director deals alone:
 * the native face (kana ∪ kanji), the Latin growth (lowercase + punctuation),
 * the serif face, the ornaments, and (#2005) the plate face. This is the set
 * the containment surfaces exclude on (the pool panel, chapter decks, the
 * KINETIC roll, the dice chokepoint, the placeable pool, the voice wardrobe
 * draw): catalogue members all, marks never. It grows here, in one place,
 * never as a second list elsewhere.
 */
export const POEM_ONLY_STAMP_IDS = Object.freeze(
  new Set([
    ...NATIVE_STAMP_IDS,
    ...LATIN_STAMP_IDS,
    ...SERIF_STAMP_IDS,
    ...ORNAMENT_STAMP_IDS,
    ...PLATE_STAMP_IDS,
    ...WEAR_STAMP_IDS,
  ]),
);

/**
 * Any glyph the poem system can stamp in the BASE face: a letter/digit
 * stamp, a native-script stamp, a lowercase/punctuation stamp, or an
 * ornament. (Serif stamps are deliberately absent: they resolve only under
 * a serif placement, so a base deal can never deal one by accident.)
 */
export function stampIdForGlyph(ch) {
  return stampIdForChar(ch) ?? nativeStampIdForChar(ch) ?? latinStampIdForChar(ch) ?? ornamentStampIdForChar(ch);
}

/** True when every non-space character of the line maps to an existing stamp. */
export function lineMapsToStamps(line) {
  for (const ch of String(line)) {
    if (ch === ' ') continue;
    if (!stampIdForGlyph(ch)) return false;
  }
  return true;
}

export const PLACEMENT_LAYOUTS = Object.freeze(['grid', 'bands', 'single', 'two', 'square']);

/**
 * #1928 — the type plate's metrics are MEASURED from the baked glyphs, not guessed. Every letter stamp is drawn in a
 * 100-unit box with its cap height spanning GLYPH_CAP_UNITS (y 10..90), so 1 em of cap height = 80 box units. A glyph's
 * advance is its own ink width plus TRACK — proportional, so an M or W never overruns its neighbour (the old flat 0.62 em
 * advance was narrower than M/W at 0.78–0.80 em, and with the stage scale 2.3x too large every word collided).
 */
export const GLYPH_CAP_UNITS = 80;
const inkWidthEm = (svg) => {
  const nums = (svg.match(/d="([^"]+)"/g) || []).join(' ').match(/-?\d+(?:\.\d+)?/g) || [];
  const xs = nums.filter((_, i) => i % 2 === 0).map(Number);
  return xs.length ? (Math.max(...xs) - Math.min(...xs)) / GLYPH_CAP_UNITS : 0.5;
};
const GLYPH_W = (() => {
  const out = {};
  for (const a of ASSETS_LETTERS) out[a.id.slice(4)] = inkWidthEm(a.svg);
  // #1982 — kana measured by the same ruler (the kana pack bakes to the same
  // 100-unit box, body height = GLYPH_CAP_UNITS), keyed by the glyph itself.
  for (const a of ASSETS_KANA) out[a.glyph] = inkWidthEm(a.svg);
  // #1998 — kanji measured by the same ruler too (the kanji pack bakes to
  // the same box on the same あ reference), keyed by the glyph itself.
  for (const a of ASSETS_KANJI) out[a.glyph] = inkWidthEm(a.svg);
  // #2002 — the Latin growth measured by the same ruler (the latin pack
  // bakes to the same box on the caps' own 'H' reference), keyed by glyph:
  // lowercase and punctuation advances are their own measured widths, so a
  // mixed-case line is laid out honestly, glyph by glyph.
  for (const a of ASSETS_LATIN) out[a.glyph] = inkWidthEm(a.svg);
  // #2002 — ornaments measured too (their own row's fit is judged with them).
  for (const a of ASSETS_ORNAMENTS) out[a.glyph] = inkWidthEm(a.svg);
  return Object.freeze(out);
})();
/**
 * #2002 — the serif face's measured widths, keyed by glyph, in a table of
 * their own: a serif 'A' and an Anton 'A' are different ink, and the
 * char-keyed GLYPH_W above is the base face's ruler. A serif placement and
 * the gate (for a serif form) measure with this table; the base face's
 * measurements never move.
 */
const SERIF_GLYPH_W = (() => {
  const out = {};
  for (const a of ASSETS_SERIF) out[a.glyph] = inkWidthEm(a.svg);
  return Object.freeze(out);
})();
/** A serif glyph's ink width in em units (0 for a character with no serif stamp). */
export const serifGlyphWidthEm = (ch) => SERIF_GLYPH_W[ch] ?? 0;
/**
 * #2005 — the plate face's measured widths, keyed by glyph, in a table of
 * their own, on the serif table's discipline: a plate 'A' and a PT Serif
 * 'A' and an Anton 'A' are three different inks, and each face's forms are
 * measured with its own ruler. A plate placement and the gate (for a plate
 * form) measure with this table; the other faces' measurements never move.
 */
const PLATE_GLYPH_W = (() => {
  const out = {};
  for (const a of ASSETS_PLATE) out[a.glyph] = inkWidthEm(a.svg);
  return Object.freeze(out);
})();
/** A plate glyph's ink width in em units (0 for a character with no plate stamp). */
export const plateGlyphWidthEm = (ch) => PLATE_GLYPH_W[ch] ?? 0;
/** The widest plate LETTER's ink width, em units — the plate grid's even cell base, on GLYPH_MAX_W's pattern. */
export const PLATE_GLYPH_MAX_W = Math.max(...ASSETS_PLATE.map((a) => PLATE_GLYPH_W[a.glyph]));
/**
 * The widest LETTER's ink width, em units (W). The grid and square recipes use it as their even
 * cell — deliberately letters only: those recipes are the Latin poets' (Greenleaf's grid,
 * Rosselli's quadro), and a native deal rides the proportional recipes (bands/single), where each
 * glyph advances by its own measured width. Native widths never move a Latin placement.
 */
export const GLYPH_MAX_W = Math.max(...ASSETS_LETTERS.map((a) => GLYPH_W[a.id.slice(4)]));
/** A glyph's ink width in em units (0 for a space or a character with no stamp). */
export const glyphWidthEm = (ch) => GLYPH_W[ch] ?? 0;
/**
 * A STAMP's ink width in em units, by its id: a serif stamp measures with
 * the serif ruler, a plate stamp with the plate ruler, every other stamp
 * with the base ruler. The gate judges fit and overlap with this, so a
 * serif or plate form is measured in its own face. A worn stamp (#2010)
 * measures with its SOURCE's ruler: a torn serif 'A' is serif ink.
 */
export const stampWidthEm = (assetId, ch) => {
  const id = WEAR_SOURCE_BY_ID.get(assetId) ?? assetId;
  return SERIF_STAMP_IDS.has(id) ? serifGlyphWidthEm(ch) : PLATE_STAMP_IDS.has(id) ? plateGlyphWidthEm(ch) : glyphWidthEm(ch);
};
const TRACK = 0.16; // letterspacing between glyphs, em units — air a plate reads through
/**
 * #2005 — the plate's set discipline: the constants a plate form is SET by,
 * named so the suite can measure a dealt plate against them (they are the
 * strictest composition the placement system deals — a plate is set like a
 * printed plate, not placed like a poem):
 * - PLATE_TRACK: letterspacing in the plate face — wider than TRACK, the
 *   title-page air a display face is spaced with.
 * - PLATE_PITCH_EM: the leading — one baseline pitch for every row recipe,
 *   generous and fixed (the row recipes' own pitches are 1.45–1.9).
 * - PLATE_MARGIN: the optical margin, dish-height units — the module never
 *   comes closer to the dish edge than this (the placement margin is 0.05).
 * - PLATE_MEASURE: the measure — the module never exceeds this fraction of
 *   the dish width, the column a book page sets its type in.
 * - PLATE_EM_FLOOR: the smallest type size a GRID plate may deal at. The
 *   grid fit compounds the wide Fraunces cell + PLATE_TRACK through the
 *   measure clamp and dealt grid plates at half their bands siblings'
 *   size (g1 0.0290 against the serif's 0.0589 — the #2018 audit's
 *   confirmed defect). When the fit would clamp a grid plate under the
 *   floor, the measure yields (the module widens toward its margins'
 *   box, then the rows re-break at the floor) — the floor itself yields
 *   only to the dish's edge. Bands/two/single plates keep the shipped
 *   fit; their deals already land at 0.068–0.072.
 * Every stamp still sits on the recipe's shared baseline grid at rotation 0
 * — the discipline is the grid kept, with plate air.
 */
export const PLATE_TRACK = 0.26;
export const PLATE_PITCH_EM = 2.4;
export const PLATE_MARGIN = 0.13;
export const PLATE_MEASURE = 0.66;
export const PLATE_EM_FLOOR = 0.045;
const ADV = GLYPH_MAX_W + TRACK; // the grid's even cell: the widest glyph plus tracking, so no glyph overruns
/**
 * Rosselli's square cell, in em (cap heights), on BOTH axes: wide enough for the widest glyph plus tracking, and a
 * touch of leading so packed rows never kiss. Cells stay square and edge-to-edge — the quadro is the cell grid.
 */
export const SQUARE_CELL = Math.max(1.12, GLYPH_MAX_W + TRACK);
const SPACE_ADV = 0.42; // a space: a gap, wider than nothing, narrower than a glyph
const MARGIN = 0.05; // dish margin, height units
const MAX_W = 0.88; // module max width, fraction of dish width (in height units: * aspect)
const MAX_H = 0.88; // module max height, fraction of dish height

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * A glyph's advance in em units. `adv` null = proportional (its own width + track); a number = an even cell (grid),
 * which must be at least the glyph's width + track, so even cells never overlap either. `track` is the call's
 * letterspacing (TRACK for every deal; PLATE_TRACK under a plate placement, #2005).
 */
const advanceOf = (ch, adv, spaceAdv, widthOf = glyphWidthEm, track = TRACK) =>
  ch === ' '
    ? adv == null
      ? spaceAdv
      : adv // on a strict grid a word break is one empty cell, so words never run together
    : adv == null
      ? widthOf(ch) + track
      : Math.max(adv, widthOf(ch) + track);

/** Advance width of a line in em units (spaces count as gaps). The last glyph's tracking is not counted. */
function lineAdvanceEm(line, adv, spaceAdv, widthOf = glyphWidthEm, track = TRACK) {
  let w = 0;
  for (const ch of line) w += advanceOf(ch, adv, spaceAdv, widthOf, track);
  return Math.max(0, w - (line.length && line.at(-1) !== ' ' ? track : 0));
}

/**
 * #2018 — re-break one grid line into rows whose advance fits
 * `maxAdvanceEm`, measured by the same lineAdvanceEm the layout uses.
 * Breaks prefer spaces — the break eats the space, as typesetting does —
 * and fall back to a hard cell break inside a word longer than a row, so
 * a row always fits while the grid's even cell survives whole in every
 * row. Deterministic, consumes no draws; a line that already fits is
 * returned untouched.
 */
function wrapGridRows(line, adv, spaceAdv, widthOf, track, maxAdvanceEm) {
  if (lineAdvanceEm(line, adv, spaceAdv, widthOf, track) <= maxAdvanceEm) return [line];
  const fits = (s) => lineAdvanceEm(s, adv, spaceAdv, widthOf, track) <= maxAdvanceEm;
  const rows = [];
  let row = '';
  for (const ch of line) {
    if (row && !fits(row + ch)) {
      const cut = row.lastIndexOf(' ');
      if (cut > 0) {
        rows.push(row.slice(0, cut));
        row = row.slice(cut + 1) + ch;
      } else {
        rows.push(row);
        row = ch;
      }
    } else {
      row += ch;
    }
  }
  if (row) rows.push(row);
  return rows.length ? rows : [line];
}

/** Lay one line's stamps along a baseline. Returns stamps in unit space. */
function layLine(line, { ox, oy, em, adv, spaceAdv, resolveId = stampIdForGlyph, widthOf = glyphWidthEm, track = TRACK }) {
  const out = [];
  let cursor = 0;
  for (const ch of line) {
    const a = advanceOf(ch, adv, spaceAdv, widthOf, track);
    if (ch !== ' ') {
      out.push(
        Object.freeze({
          assetId: resolveId(ch),
          ch,
          // the glyph's ink centred in its own advance (minus the trailing track)
          x: ox + (cursor + (a - track) / 2) * em,
          y: oy,
          rotation: 0,
          em,
        }),
      );
    }
    cursor += a;
  }
  return out;
}

/** Seeded module origin: uniform inside the margins, module fully on the dish. */
function moduleOrigin(rng, w, h, aspect, margin = MARGIN) {
  const spanX = Math.max(0, aspect - 2 * margin - w);
  const spanY = Math.max(0, 1 - 2 * margin - h);
  return { ox: margin + rng() * spanX, oy: margin + rng() * spanY };
}

/** Shrink em so the module fits the fit box; returns the fit em. */
function fitEm(em, wEm, hEm, aspect, maxW = MAX_W, maxH = MAX_H) {
  let f = em;
  const w = wEm * f;
  if (w > maxW * aspect) f *= (maxW * aspect) / w;
  const h = hEm * f;
  if (h > maxH) f *= maxH / h;
  return f;
}

/**
 * Place one piece. `piece` is a deck entry { id, lines, layout, density }
 * (density may be the deal's adjusted value). `rng` is a seeded () => [0,1).
 * Draw order is fixed per recipe and documented per branch — a given
 * (piece, seed) always deals the same form.
 *
 * `face: 'serif'` (#2002) places the piece in the serif face: letters
 * resolve to the serif pack and measure with the serif ruler, while digits
 * and punctuation stay the face-shared base stamps. Any other call is the
 * base face — the resolver and ruler every shipped deal has always used.
 *
 * `face: 'plate'` (#2005) places the piece as a PLATE: letters resolve to
 * the plate pack and measure with the plate ruler (digits and punctuation
 * face-shared, as in every face), and the composition is set by the plate
 * discipline — PLATE_TRACK letterspacing, PLATE_PITCH_EM leading on the row
 * recipes, PLATE_MARGIN optical margins, PLATE_MEASURE across. The draw
 * structure is the recipe's own (same draws, same order): a plate deal
 * consumes its stream exactly as the plain deal of the same piece does.
 * Rosselli's square keeps its cell law under any face — the quadro IS its
 * discipline, and the Director never calls a plate on it.
 */
export function placePiece(piece, rng, { aspect = 10 / 7, face } = {}) {
  const lines = Array.isArray(piece?.lines) ? piece.lines.map((l) => String(l)) : [];
  const layout = PLACEMENT_LAYOUTS.includes(piece?.layout) ? piece.layout : 'bands';
  const density = clamp01(piece?.density ?? 0.4);
  const draw = typeof rng === 'function' ? rng : () => 0.5;
  const asp = Number.isFinite(aspect) && aspect > 0 ? aspect : 10 / 7;
  // #2002 — the serif resolver claims every letter first, so stampIdForChar
  // in this chain serves digits only (face-shared); punctuation is shared
  // too, and the ornaments — Latin-face furniture, admissible in either
  // face under the break-only law — resolve here as well (a plate-break
  // line placed in a serif deal must still find its stamp). The serif ruler
  // falls back to the base ruler for the shared stamps (their ink IS the
  // base ink), which is the `||` below (0 = no serif glyph).
  // #2005 — the plate resolver and ruler stand on the same pattern.
  const plate = face === 'plate';
  const resolveId = plate
    ? (ch) => plateStampIdForChar(ch) ?? punctStampIdForChar(ch) ?? ornamentStampIdForChar(ch) ?? stampIdForChar(ch)
    : face === 'serif'
      ? (ch) => serifStampIdForChar(ch) ?? punctStampIdForChar(ch) ?? ornamentStampIdForChar(ch) ?? stampIdForChar(ch)
      : stampIdForGlyph;
  const widthOf = plate
    ? (ch) => plateGlyphWidthEm(ch) || glyphWidthEm(ch)
    : face === 'serif'
      ? (ch) => serifGlyphWidthEm(ch) || glyphWidthEm(ch)
      : glyphWidthEm;
  const track = plate ? PLATE_TRACK : TRACK;
  const margin = plate ? PLATE_MARGIN : MARGIN;
  // The plate's fit box: the measure across (or the margins' own box,
  // whichever is narrower at this aspect), the margins' box down — so a
  // plate module always lands whole inside its optical margins.
  const fitMaxW = plate ? Math.min(PLATE_MEASURE, (asp - 2 * PLATE_MARGIN) / asp) : MAX_W;
  const fitMaxH = plate ? 1 - 2 * PLATE_MARGIN : MAX_H;

  let stamps = [];
  if (layout === 'grid') {
    // Even advance for every glyph (the grid is the law); spacing widens a
    // little with density (Greenleaf hot: "slightly wider spacing").
    const adv = (plate ? PLATE_GLYPH_MAX_W + PLATE_TRACK : ADV) * (1 + 0.35 * density);
    let em = 0.062 + 0.03 * density; // #1928: em is now TRUE cap height (exact stage scale); sized to read as a plate
    const pitchEm = plate ? PLATE_PITCH_EM : 1.5;
    let rows = lines;
    let wEm = Math.max(0, ...lines.map((l) => lineAdvanceEm(l, adv, SPACE_ADV, widthOf, track)));
    let hEm = lines.length > 0 ? (lines.length - 1) * pitchEm + 1 : 0;
    em = fitEm(em, wEm, hEm, asp, fitMaxW, fitMaxH);
    if (plate && em < PLATE_EM_FLOOR) {
      // #2018 (audit lever 4) — the em floor: the fit above clamps grid
      // plates to half size (the wide cell + track through the measure).
      // The measure yields first: refit against the optical margins' own
      // box — if the floor fits there, the deal takes it. If even the
      // margins cannot hold the floor, the rows re-break at the floor so
      // each row fits the fit box itself, and the final fit may pull the
      // deal under the floor only where the dish's height binds — the
      // edge is sovereign, the measure is not. Grid plates only; the
      // draw structure (and its count) is unchanged.
      const marginBoxW = (asp - 2 * PLATE_MARGIN) / asp;
      if (fitEm(PLATE_EM_FLOOR, wEm, hEm, asp, marginBoxW, fitMaxH) >= PLATE_EM_FLOOR) {
        em = PLATE_EM_FLOOR;
      } else {
        rows = lines.flatMap((l) => wrapGridRows(l, adv, SPACE_ADV, widthOf, track, (fitMaxW * asp) / PLATE_EM_FLOOR));
        wEm = Math.max(0, ...rows.map((l) => lineAdvanceEm(l, adv, SPACE_ADV, widthOf, track)));
        hEm = rows.length > 0 ? (rows.length - 1) * pitchEm + 1 : 0;
        em = fitEm(PLATE_EM_FLOOR, wEm, hEm, asp, fitMaxW, fitMaxH);
      }
    }
    const { ox, oy } = moduleOrigin(draw, wEm * em, hEm * em, asp, margin);
    rows.forEach((line, r) => {
      stamps.push(
        ...layLine(line, { ox, oy: oy + (r * pitchEm + 0.5) * em, em, adv, spaceAdv: SPACE_ADV, resolveId, widthOf, track }),
      );
    });
  } else if (layout === 'bands') {
    // Stratified bands: each line its own band on a locked baseline, bands
    // separated by air; each band's x-offset is dealt (stratified, not justified).
    const adv = null; // #1928: proportional (each band is a run of type, not a grid)
    let em = 0.06 + 0.027 * density;
    const pitchEm = plate ? PLATE_PITCH_EM : 1.9;
    const wEm = Math.max(0, ...lines.map((l) => lineAdvanceEm(l, adv, SPACE_ADV, widthOf, track)));
    const hEm = lines.length > 0 ? (lines.length - 1) * pitchEm + 1 : 0;
    em = fitEm(em, wEm, hEm, asp, fitMaxW, fitMaxH);
    const { ox, oy } = moduleOrigin(draw, wEm * em, hEm * em, asp, margin);
    lines.forEach((line, r) => {
      const lw = lineAdvanceEm(line, adv, SPACE_ADV, widthOf, track) * em;
      const slack = Math.max(0, wEm * em - lw);
      const lineOx = ox + draw() * slack;
      stamps.push(
        ...layLine(line, { ox: lineOx, oy: oy + (r * pitchEm + 0.5) * em, em, adv, spaceAdv: SPACE_ADV, resolveId, widthOf, track }),
      );
    });
  } else if (layout === 'single') {
    // One-line module: the piece's lines join into a single locked baseline
    // (line breaks become gaps). Generous negative space: the module is
    // small against the dish and fit-clamped well inside it.
    const joined = lines.join(' ');
    const adv = null; // #1928: proportional
    let em = 0.054 + 0.033 * density;
    const wEm = lineAdvanceEm(joined, adv, SPACE_ADV, widthOf, track);
    em = fitEm(em, wEm, 1, asp, fitMaxW, fitMaxH);
    const { ox, oy } = moduleOrigin(draw, wEm * em, em, asp, margin);
    stamps = layLine(joined, { ox, oy: oy + 0.5 * em, em, adv, spaceAdv: SPACE_ADV, resolveId, widthOf, track });
  } else if (layout === 'two') {
    // Two-line module, locked baselines, generous negative space.
    const adv = null; // #1928: proportional
    let em = 0.054 + 0.03 * density;
    const pitchEm = plate ? PLATE_PITCH_EM : 1.45;
    const wEm = Math.max(0, ...lines.map((l) => lineAdvanceEm(l, adv, SPACE_ADV, widthOf, track)));
    const hEm = lines.length > 0 ? (lines.length - 1) * pitchEm + 1 : 0;
    em = fitEm(em, wEm, hEm, asp, fitMaxW, fitMaxH);
    const { ox, oy } = moduleOrigin(draw, wEm * em, hEm * em, asp, margin);
    lines.forEach((line, r) => {
      stamps.push(
        ...layLine(line, { ox, oy: oy + (r * pitchEm + 0.5) * em, em, adv, spaceAdv: SPACE_ADV, resolveId, widthOf, track }),
      );
    });
  } else {
    // square — Rosselli: square cells (advance == pitch == em in cell units),
    // letters packed edge-to-edge, module origin snapped to the cell grid.
    const cellOf = (line) => [...line].length; // every character is one cell; spaces are empty cells
    const cellsWide = Math.max(0, ...lines.map(cellOf));
    // #1928: a cell is square and must hold the widest glyph with tracking, so the cell is CELL em on both axes
    // (letters still pack edge-to-edge on the cell grid — Rosselli's quadro — but never into each other).
    const CELL = SQUARE_CELL;
    let em = cellsWide > 0 ? (0.34 + 0.4 * density) / (cellsWide * CELL) : 0.05;
    const wEm = cellsWide * CELL;
    const hEm = lines.length * CELL;
    em = fitEm(em, wEm, hEm, asp);
    const raw = moduleOrigin(draw, wEm * em, hEm * em, asp);
    const step = CELL * em;
    // snap to the cell grid; if the snap pushed the module past the far margin, step back whole cells — the origin
    // stays on the grid and the module stays on the dish
    let ox = Math.round(raw.ox / step) * step;
    let oy = Math.round(raw.oy / step) * step;
    while (ox + wEm * em > asp - MARGIN + 1e-12 && ox - step >= 0) ox -= step;
    while (oy + hEm * em > 1 - MARGIN + 1e-12 && oy - step >= 0) oy -= step;
    lines.forEach((line, r) => {
      let cell = 0;
      for (const ch of line) {
        if (ch !== ' ') {
          stamps.push(
            Object.freeze({
              assetId: resolveId(ch),
              ch,
              x: ox + (cell + 0.5) * step,
              y: oy + (r + 0.5) * step,
              rotation: 0,
              em,
            }),
          );
        }
        cell += 1;
      }
    });
  }

  return Object.freeze({ layout, stamps: Object.freeze(stamps) });
}
