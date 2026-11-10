// fieldPlate.selfcheck.mjs — #2005: the clean plate.
//
// Pins the plate's whole contract, on the fieldLatin pattern:
//  - the pack: Fraunces A–Z + a–z (52), instanced for display at bake time
//    (opsz 144 / wght 400 / SOFT 0 / WONK 0 — scripts/gen-plate.mjs records
//    the pinned fetch, the instancing command, and both md5s) — path data
//    only, every glyph rasterizing with real ink under the pinned font
//    with NO system fonts (the #1970 CI condition). The plate face is its
//    own drawing: its outlines differ from the serif face's, glyph for
//    glyph.
//  - the resolver: plate ids NEVER resolve in the base face; a plate stamp
//    measures with the plate ruler (stampWidthEm), as a serif stamp
//    measures with its own.
//  - the set discipline, MEASURED on dealt plate forms: every stamp on the
//    recipe's baseline grid at rotation 0; row pitch = PLATE_PITCH_EM;
//    tracking = PLATE_TRACK (ink gaps in the proportional recipes, the
//    even cell in the grid); every ink box inside the PLATE_MARGIN optical
//    margins; the module inside the PLATE_MEASURE. Across every Whittier
//    piece, five aspects, three seeds.
//  - the deal law: the plate call is Whittier's alone (it degrades under
//    any other poet, the deck is the authority), it supersedes the serif
//    face and the plate break on its deal, and it composes with the
//    sentence face. A plate deal consumes its stream exactly as the plain
//    deal of the same piece does (same draws, same order).
//  - the face law (gate + door): plate stamps pass only in a declared
//    plate form, base and serif letters are refused inside one, digits +
//    punctuation are shared, a plate form is Whittier-only, the faces
//    never compose. The register's door law: any plate value but `true`
//    refuses the form whole; pre-plate documents sanitize byte-identically
//    (no plate key is ever added to a form that does not carry one).
//  - the poles never mix: plate + raygun is refused at the door, and the
//    store's ray-gun cycle does not arm on a plate form.
//  - the room (render seam): while a plate stands, non-form marks whose
//    ink enters its zone render at PLATE_ROOM_ALPHA and marks whose ink
//    stays clear are untouched, the plate's own stamps at full presence;
//    a whispered plate still quiets its room (the registers compose).
//    (#2018: the test is the mark's ink FOOTPRINT — centre ± half its ink
//    extent — applied on the final, mirrored list; the plate's items
//    draw last in their layer; the plate's stamps deal in the palette
//    swatch most distant from the layer's mark colours; grid plates
//    never deal under PLATE_EM_FLOOR. The dense-stage section at the end
//    measures the room's zone effective opacity at drive density — the
//    sparse seam fixture below proves the mechanism, the dense one
//    proves presence.)
//  - poem-only: the catalogue carries the pack (701 + 52), the authored
//    bake does not, the panel's records stay 313, and every dealing
//    surface excludes the grown poem-only union by id.
//  - the producer (Matt's ruling pattern, from #2002's fix loop): the
//    Director calls the plate from the room — the solo room at its
//    stillest (intensity ≤ PLATE_CALL_MAX_INTENSITY), Whittier only,
//    superseding the serif call, with NO draw spent on the call. The last
//    section drives the LIVE path (choosePoet under the contexts step
//    derives; a real Director's dealPoet in a production-shaped solo
//    room) and measures the dealt frequency: plates are exactly the
//    still-band share of solo Whittier deals — a minority, and none
//    outside the stillest band.
import assert from 'node:assert';
import { Resvg } from '@resvg/resvg-js';
import { ASSETS, ASSETS_AUTHORED } from '../data/assets/index.js';
import { ASSETS_PLATE } from '../data/assets/assets-plate.js';
import { ASSETS_SERIF } from '../data/assets/assets-serif.js';
import { RESVG_FONT } from '../assets/resvgFont.mjs';
import {
  stampIdForChar,
  plateStampIdForChar,
  serifStampIdForChar,
  punctStampIdForChar,
  stampIdForGlyph,
  glyphWidthEm,
  serifGlyphWidthEm,
  plateGlyphWidthEm,
  stampWidthEm,
  placePiece,
  PLATE_STAMP_IDS,
  SERIF_STAMP_IDS,
  PUNCT_STAMP_IDS,
  NATIVE_STAMP_IDS,
  POEM_ONLY_STAMP_IDS,
  PLATE_TRACK,
  PLATE_PITCH_EM,
  PLATE_MARGIN,
  PLATE_MEASURE,
  PLATE_EM_FLOOR,
  PLATE_GLYPH_MAX_W,
} from './placement.js';
import { fieldDealReport, sanitizeFieldForm, gateFieldForm } from './fieldForm.js';
import { GREENLEAF } from './greenleaf.js';
import { keepPoem as bankPoem, sanitizePoemKeeps } from './poemRow.mjs';
import { buildPlacements, PLATE_ROOM_ALPHA, PLATE_ZONE_PAD_EM, WHISPER_ALPHA } from '../engine/buildPlacements.js';
import { poolDescriptors, categoryCounts } from '../panels/assetPoolLogic.mjs';
import { CHAPTER_UNDEALT, chapterAssets } from '../data/chapters.js';
import { NEVER_DEALT, dealableRecords } from '../state/rollPool.mjs';
import { dealCast } from '../curator/dice.js';
import { VOICE_DECK } from '../data/voiceDeck.js';
import { mkRng } from '../engine/prng.js';
import { choosePoet, PLATE_CALL_MAX_INTENSITY } from '../curator/fieldDirector.js';
import { step, INITIAL_STATE } from '../curator/fieldEval.js';
import { createDirector } from '../curator/director.js';
import { useStore } from '../state/store.js';
import { ACCENT_OFFSET } from '../engine/kernel/color/index.js';

const EPS = 1e-9;

// ── The pack ─────────────────────────────────────────────────────────────
assert.strictEqual(ASSETS_PLATE.length, 52, 'the plate pack is A–Z + a–z');
assert.strictEqual(new Set(ASSETS_PLATE.map((a) => a.id)).size, 52, 'plate ids unique');
assert.strictEqual(new Set(ASSETS_PLATE.map((a) => a.glyph)).size, 52, 'plate glyphs unique');
for (const a of ASSETS_PLATE) {
  assert.ok(a.svg.startsWith('<path d="') && !a.svg.includes('<text'), `${a.id}: path data only, never <text>`);
  assert.strictEqual(plateStampIdForChar(a.glyph), a.id, `${a.id}: glyph <-> id bijection`);
  assert.ok(a.tags.includes('fraunces'), `${a.id}: tagged with its face's name`);
}
for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz') {
  assert.strictEqual(plateStampIdForChar(ch), `typ_f_${ch}`, `${ch}: a plate stamp exists`);
}
// The plate face is drawn, not remapped from another face: its outlines
// differ from the serif face's for the same glyph, and its lowercase sits
// at x-height below its caps (the instanced font's own metrics: x 868
// against cap 1400 at upm 2000 — see STAGING-REPORT-2005.md).
const inkH = (svg) => {
  const nums = (svg.match(/d="([^"]+)"/g) || []).join(' ').match(/-?\d+(?:\.\d+)?/g) || [];
  const ys = nums.filter((_, i) => i % 2 === 1).map(Number);
  return Math.max(...ys) - Math.min(...ys);
};
for (const ch of ['A', 'a', 'W', 'g']) {
  const plate = ASSETS_PLATE.find((a) => a.glyph === ch);
  const serif = ASSETS_SERIF.find((a) => a.glyph === ch);
  assert.notStrictEqual(plate.svg, serif.svg, `${ch}: the plate outline is its own drawing, not the serif's`);
}
assert.ok(
  inkH(ASSETS_PLATE.find((a) => a.glyph === 'a').svg) < inkH(ASSETS_PLATE.find((a) => a.glyph === 'A').svg),
  'a sits at x-height below A in the plate face',
);

// ── Ink under the pinned font, no system fonts (the #1970 condition) ────
for (const a of ASSETS_PLATE) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">' +
    a.svg.replaceAll('var(--ink)', '#ffffff') +
    '</svg>';
  const img = new Resvg(svg, { font: RESVG_FONT, fitTo: { mode: 'width', value: 100 } }).render();
  const px = img.pixels; // read ONCE: the getter materializes the buffer per access
  let ink = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 8) ink++;
  assert.ok(ink > 0, `${a.id} rasterizes with real ink under the pinned font`);
}

// ── The resolver + the rulers ────────────────────────────────────────────
assert.strictEqual(stampIdForGlyph('A'), 'typ_A', 'the base resolver never returns a plate id (caps)');
assert.strictEqual(stampIdForGlyph('a'), 'typ_l_a', 'the base resolver never returns a plate id (lowercase)');
assert.ok(plateGlyphWidthEm('W') > 0 && plateGlyphWidthEm('W') !== glyphWidthEm('W'), 'plate widths are their own ruler');
assert.ok(plateGlyphWidthEm('W') !== serifGlyphWidthEm('W'), 'the plate ruler is not the serif ruler');
assert.strictEqual(stampWidthEm('typ_f_A', 'A'), plateGlyphWidthEm('A'), 'a plate stamp measures plate');
assert.strictEqual(stampWidthEm('typ_s_A', 'A'), serifGlyphWidthEm('A'), 'a serif stamp still measures serif');
assert.strictEqual(stampWidthEm('typ_A', 'A'), glyphWidthEm('A'), 'a base stamp still measures base');
assert.strictEqual(NATIVE_STAMP_IDS.size, 289, 'the native face did NOT grow: the plate is Latin-side');
// #2010 RE-PIN (cause: RAY GUN P1 · TORN & XEROXED): the worn letters (208) join the union on the same road.
assert.strictEqual(POEM_ONLY_STAMP_IDS.size, 388 + 52 + 208, 'the poem-only union grew by exactly the plate pack (and #2010’s worn letters)');
for (const id of PLATE_STAMP_IDS) {
  assert.ok(POEM_ONLY_STAMP_IDS.has(id), `${id}: in the poem-only union`);
  assert.ok(!NATIVE_STAMP_IDS.has(id), `${id}: not in the native face`);
}

// ── The deals + the set discipline, measured ─────────────────────────────
const rowsOf = (form) => {
  const rows = new Map();
  for (const s of form.stamps) {
    if (!rows.has(s.y)) rows.set(s.y, []);
    rows.get(s.y).push(s);
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, stamps]) => stamps.sort((a, b) => a.x - b.x));
};
/** Ink gap between two consecutive stamps of a row, in dish units. */
const inkGap = (prev, cur) =>
  cur.x - (stampWidthEm(cur.assetId, cur.ch) * cur.em) / 2 - (prev.x + (stampWidthEm(prev.assetId, prev.ch) * prev.em) / 2);

/** Measure a dealt plate form against the set discipline, whole. */
function measurePlate(form, label) {
  assert.ok(form && form.plate === true, `${label}: the form declares its plate`);
  assert.ok(
    form.stamps.every(
      (s) => PLATE_STAMP_IDS.has(s.assetId) || PUNCT_STAMP_IDS.has(s.assetId) || (stampIdForChar(s.ch) === s.assetId && s.ch >= '0' && s.ch <= '9'),
    ),
    `${label}: every stamp is a plate stamp or a face-shared stamp`,
  );
  assert.ok(form.stamps.every((s) => s.rotation === 0), `${label}: no rotation — every stamp upright`);
  const em = form.stamps[0].em;
  assert.ok(form.stamps.every((s) => s.em === em), `${label}: one type size across the plate`);
  const rows = rowsOf(form);
  // The baseline grid: rows pitched exactly PLATE_PITCH_EM apart (in em).
  for (let r = 1; r < rows.length; r++) {
    const pitch = rows[r][0].y - rows[r - 1][0].y;
    assert.ok(Math.abs(pitch - PLATE_PITCH_EM * em) < 1e-9, `${label}: row pitch is PLATE_PITCH_EM (got ${pitch / em})`);
  }
  // The optical margins: every ink box inside them, on both axes.
  for (const s of form.stamps) {
    const hw = (stampWidthEm(s.assetId, s.ch) * s.em) / 2;
    assert.ok(s.x - hw >= PLATE_MARGIN - 1e-9, `${label}: ink respects the left optical margin`);
    assert.ok(s.x + hw <= form.aspect - PLATE_MARGIN + 1e-9, `${label}: ink respects the right optical margin`);
    assert.ok(s.y - s.em / 2 >= PLATE_MARGIN - 1e-9, `${label}: ink respects the top optical margin`);
    assert.ok(s.y + s.em / 2 <= 1 - PLATE_MARGIN + 1e-9, `${label}: ink respects the bottom optical margin`);
  }
  // The measure: the plate's ink spans no more than PLATE_MEASURE of the dish width.
  const xs = form.stamps.map((s) => [s.x - (stampWidthEm(s.assetId, s.ch) * s.em) / 2, s.x + (stampWidthEm(s.assetId, s.ch) * s.em) / 2]);
  const inkWidth = Math.max(...xs.map(([, r]) => r)) - Math.min(...xs.map(([l]) => l));
  // #2018 — the grid em floor yields the measure, for grid plates only:
  // a floored deal's ink may pass PLATE_MEASURE, but never its optical
  // margins, and only at or over the floor. Every other plate — and
  // every wrapped grid deal, whose rows re-break to fit the measure —
  // keeps the shipped measure assertion below.
  const gridYield =
    form.layout === 'grid' && inkWidth > PLATE_MEASURE * form.aspect && em >= PLATE_EM_FLOOR - 1e-9 &&
    inkWidth <= form.aspect - 2 * PLATE_MARGIN + 1e-9;
  assert.ok(
    inkWidth <= PLATE_MEASURE * form.aspect + 1e-9 || gridYield,
    `${label}: the ink sits inside the measure (or, grid-floored, inside the optical margins at the floor)`,
  );
  return { rows, em };
}

const plateDeal = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1', plate: true }, mkRng(42), { aspect: 10 / 7 });
assert.ok(plateDeal.form, 'a plate deal spawns a form');
assert.strictEqual(plateDeal.gate, null, 'a plate deal is not a gate refusal');
{
  const { rows, em } = measurePlate(plateDeal.form, 'g1 grid plate');
  // The grid's tracking is its even cell: uniform centre steps, each cell
  // the widest plate glyph plus PLATE_TRACK (widened by the recipe's
  // density spacing), and no ink gap under PLATE_TRACK.
  const piece = GREENLEAF.find((p) => p.id === 'g1');
  const wantCell = (PLATE_GLYPH_MAX_W + PLATE_TRACK) * (1 + 0.35 * piece.density) * em;
  for (const row of rows) {
    for (let i = 1; i < row.length; i++) {
      const step = row[i].x - row[i - 1].x;
      const cells = step / wantCell;
      assert.ok(
        Math.abs(cells - Math.round(cells)) < 1e-6 && Math.round(cells) >= 1,
        'g1 grid plate: centre steps are whole plate cells (one within a word, two across a space)',
      );
      assert.ok(inkGap(row[i - 1], row[i]) >= PLATE_TRACK * em - 1e-9, 'g1 grid plate: no ink gap under PLATE_TRACK');
    }
  }
}
const bandsDeal = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g2', plate: true }, mkRng(7), { aspect: 16 / 9 });
assert.ok(bandsDeal.form, 'a bands plate deal spawns');
{
  const { rows, em } = measurePlate(bandsDeal.form, 'g2 bands plate');
  // The proportional recipes track by the gap itself: intra-word ink gaps
  // are exactly PLATE_TRACK; nothing anywhere is tighter.
  let sawExact = 0;
  for (const row of rows) {
    for (let i = 1; i < row.length; i++) {
      const gap = inkGap(row[i - 1], row[i]);
      assert.ok(gap >= PLATE_TRACK * em - 1e-9, 'g2 bands plate: no ink gap under PLATE_TRACK');
      if (Math.abs(gap - PLATE_TRACK * em) < 1e-9) sawExact++;
    }
  }
  assert.ok(sawExact > 0, 'g2 bands plate: intra-word gaps are exactly PLATE_TRACK');
}
// The discipline holds across the whole deck, the stage's aspects, and seeds.
for (const piece of GREENLEAF) {
  for (const aspect of [0.6, 1, 10 / 7, 16 / 9, 2.6]) {
    for (const seed of [1, 7, 42]) {
      const { form, gate } = fieldDealReport({ poetId: 'greenleaf', pieceId: piece.id, plate: true }, mkRng(seed), { aspect });
      assert.ok(form && !gate, `${piece.id} @ ${aspect} seed ${seed}: the plate deal spawns`);
      measurePlate(form, `${piece.id} @ ${aspect} seed ${seed}`);
      if (piece.layout === 'grid') {
        // #2018 — the em floor, across the sweep: a grid plate deals at
        // or over PLATE_EM_FLOOR, unless the dish's own height binds at
        // the floor (the module's height exactly fills the fit box —
        // the floor yielded to the edge, the only yield left).
        const em = form.stamps[0].em;
        const ys = form.stamps.map((s) => s.y);
        const heightBound = Math.max(...ys) - Math.min(...ys) + em >= 1 - 2 * PLATE_MARGIN - 1e-6;
        assert.ok(
          em >= PLATE_EM_FLOOR - 1e-9 || heightBound,
          `${piece.id} @ ${aspect} seed ${seed}: a grid plate deals at the em floor (got ${em})`,
        );
      }
      assert.deepStrictEqual(sanitizeFieldForm(form), form, `${piece.id} @ ${aspect}: the plate form round-trips the door`);
    }
  }
}
// A plate deal consumes its stream exactly as the plain deal does: the
// discipline changes constants, never the draw structure.
for (const pieceId of ['g1', 'g2']) {
  const counted = (decision) => {
    let draws = 0;
    const base = mkRng(99);
    const rng = () => {
      draws++;
      return base();
    };
    fieldDealReport(decision, rng, { aspect: 10 / 7 });
    return draws;
  };
  assert.strictEqual(
    counted({ poetId: 'greenleaf', pieceId, plate: true }),
    counted({ poetId: 'greenleaf', pieceId }),
    `${pieceId}: the plate deal draws exactly what the plain deal draws`,
  );
}

// ── The deal law ─────────────────────────────────────────────────────────
const teijoPlate = fieldDealReport({ poetId: 'teijo', pieceId: 't1', plate: true }, mkRng(42), { aspect: 10 / 7 });
assert.ok(teijoPlate.form && !('plate' in teijoPlate.form), 'a plate call under another poet is not honoured');
assert.ok(
  !teijoPlate.form.stamps.some((s) => PLATE_STAMP_IDS.has(s.assetId)),
  'no plate stamp is dealt outside Whittier',
);
const plateCase = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1', plate: true, case: true }, mkRng(42), { aspect: 10 / 7 });
assert.ok(plateCase.form && plateCase.form.plate === true, 'the plate composes with the sentence face');
assert.ok(
  plateCase.form.stamps.some((s) => PLATE_STAMP_IDS.has(s.assetId) && s.ch >= 'a' && s.ch <= 'z'),
  'the plate sentence form deals lowercase plate stamps',
);
assert.ok(
  plateCase.form.stamps.some((s) => PUNCT_STAMP_IDS.has(s.assetId)),
  'punctuation in a plate form is the shared base stamp (face-shared, not duplicated)',
);
assert.deepStrictEqual(sanitizeFieldForm(plateCase.form), plateCase.form, 'a plate sentence form round-trips the door');
const plateFull = fieldDealReport(
  { poetId: 'greenleaf', pieceId: 'g2', plate: true, face: 'serif', plateBreak: 'typ_o_sect' },
  mkRng(42),
  { aspect: 10 / 7 },
);
assert.ok(plateFull.form && plateFull.form.plate === true, 'the plate is honoured over the lesser calls');
assert.ok(!('face' in plateFull.form) && !('break' in plateFull.form), 'the plate supersedes the serif face and the plate break');
assert.ok(
  plateFull.form.stamps.every((s) => PLATE_STAMP_IDS.has(s.assetId) || PUNCT_STAMP_IDS.has(s.assetId)),
  'a superseding plate deals plate stamps only (plus shared punctuation)',
);

// ── The gate's plate law ─────────────────────────────────────────────────
const at = (assetId, ch, x, y = 0.5) => ({ assetId, ch, x, y, rotation: 0, em: 0.1 });
assert.ok(
  gateFieldForm([at('typ_f_A', 'A', 0.3), at('typ_f_B', 'B', 0.7)], { aspect: 10 / 7, plate: true }).ok,
  'plate stamps pass in the affirmed plate context',
);
assert.strictEqual(
  gateFieldForm([at('typ_f_A', 'A', 0.3), at('typ_f_B', 'B', 0.7)], { aspect: 10 / 7 }).ok,
  false,
  'plate stamps are refused without the affirmed plate context',
);
assert.strictEqual(
  gateFieldForm(plateDeal.form.stamps, { aspect: plateDeal.form.aspect }).reason,
  'charset',
  'a dealt plate form, re-audited bare, fails on charset (not fit, not overlap)',
);
assert.ok(
  gateFieldForm(plateDeal.form.stamps, { aspect: plateDeal.form.aspect, plate: true }).ok,
  'a dealt plate form passes the gate in its affirmed context',
);
assert.ok(
  gateFieldForm([at('typ_f_A', 'A', 0.3), at('typ_7', '7', 0.7)], { aspect: 10 / 7, plate: true }).ok,
  'a digit stamp is face-shared: honest inside a plate form',
);
assert.strictEqual(
  gateFieldForm([at('typ_f_A', 'A', 0.3), at('typ_B', 'B', 0.7)], { aspect: 10 / 7, plate: true }).ok,
  false,
  'a base letter stamp inside a plate context is refused',
);
assert.strictEqual(
  gateFieldForm([at('typ_f_A', 'A', 0.3), at('typ_s_B', 'B', 0.7)], { aspect: 10 / 7, plate: true }).ok,
  false,
  'a serif letter stamp inside a plate context is refused — the faces never compose',
);
assert.strictEqual(
  gateFieldForm([at('typ_f_A', 'A', 0.3), at('typ_j_natsu', '夏', 0.7)], { aspect: 10 / 7, plate: true }).ok,
  false,
  'a native stamp inside a plate context is refused',
);
assert.ok(
  gateFieldForm([at('typ_f_A', 'A', 0.5, 0.25), at('typ_o_sect', '§', 0.5, 0.55), at('typ_f_B', 'B', 0.5, 0.85)], {
    aspect: 10 / 7,
    plate: true,
  }).ok,
  'an ornament alone on its row passes in a plate form, as in every Latin face',
);
assert.strictEqual(
  gateFieldForm([at('typ_f_A', 'A', 0.3), at('typ_o_sect', '§', 0.7)], { aspect: 10 / 7, plate: true }).ok,
  false,
  'an ornament sharing a row inside a plate form is refused (the break-only law)',
);
assert.strictEqual(
  gateFieldForm([at('typ_f_A', 'B', 0.5)], { aspect: 10 / 7, plate: true }).ok,
  false,
  'a plate stamp whose glyph disagrees with its id is refused',
);

// ── The document door's plate law ────────────────────────────────────────
assert.deepStrictEqual(sanitizeFieldForm(plateDeal.form), plateDeal.form, 'a plate form round-trips the door');
assert.strictEqual(sanitizeFieldForm({ ...plateDeal.form, plate: false }), null, 'plate: false is dishonest data — refused whole');
assert.strictEqual(sanitizeFieldForm({ ...plateDeal.form, plate: 'true' }), null, 'a string plate value refuses the form whole');
assert.strictEqual(sanitizeFieldForm({ ...plateDeal.form, plate: 1 }), null, 'a numeric plate value refuses the form whole');
assert.strictEqual(sanitizeFieldForm({ ...plateDeal.form, plate: undefined }), null, 'plate stamps without the declared register are refused');
assert.strictEqual(sanitizeFieldForm({ ...plateDeal.form, poetId: 'teijo' }), null, 'a plate form under another poet is refused');
assert.strictEqual(
  sanitizeFieldForm({ ...plateDeal.form, face: 'serif' }),
  null,
  'plate + face together is refused — the faces never compose',
);
assert.strictEqual(sanitizeFieldForm({ ...plateDeal.form, script: 'kana' }), null, 'plate + script together is refused');
assert.strictEqual(
  sanitizeFieldForm({
    ...plateDeal.form,
    stamps: plateDeal.form.stamps.map((s, j) => (j === 0 ? { ...s, assetId: `typ_${s.ch}` } : s)),
  }),
  null,
  'a base letter stamp inside a declared plate form is refused',
);
assert.strictEqual(
  sanitizeFieldForm({
    ...plateDeal.form,
    stamps: plateDeal.form.stamps.map((s, j) => (j === 0 ? { ...s, assetId: `typ_s_${s.ch}` } : s)),
  }),
  null,
  'a serif letter stamp inside a declared plate form is refused',
);
assert.deepStrictEqual(
  sanitizeFieldForm({ ...plateDeal.form, register: 'whisper' }),
  { ...plateDeal.form, register: 'whisper' },
  'a whispered plate form round-trips — plate and register compose',
);
const banked = bankPoem([], plateDeal.form);
assert.strictEqual(banked.length, 1, 'KEEP banks a plate form');
assert.deepStrictEqual(sanitizePoemKeeps(banked), banked, 'a banked plate keeper re-validates through the door');
// Pre-plate documents are untouched by the register's existence: a plain
// form and a serif form sanitize with no plate key added, byte-identical.
const plainForm = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(42), { aspect: 10 / 7 }).form;
assert.ok(!('plate' in sanitizeFieldForm(plainForm)), 'a plain form gains no plate key at the door');
assert.deepStrictEqual(sanitizeFieldForm(plainForm), plainForm, 'a plain form round-trips exactly as before the plate existed');

// ── The poles never mix ──────────────────────────────────────────────────
assert.strictEqual(
  sanitizeFieldForm({ ...plateDeal.form, raygun: { mode: 'carson', seed: 7 } }),
  null,
  'plate + raygun (carson) is refused at the door',
);
assert.strictEqual(
  sanitizeFieldForm({ ...plateDeal.form, raygun: { mode: 'shot', seed: 0 } }),
  null,
  'plate + raygun (shot) is refused at the door',
);
{
  // The store's gun does not arm on a plate (layoutSlice.cyclePoemRaygun):
  // the gesture does not land — no record, no undo step, no tap drawn.
  const S = () => useStore.getState();
  const base = S();
  useStore.setState({
    layoutParams: { ...base.layoutParams, composition: 'raster', fieldForm: plateDeal.form },
    lockedParams: {},
    poemDeal: 0,
    raygunTap: 0,
    historyUndoStack: [],
    historyRedoStack: [],
  });
  S().cyclePoemRaygun();
  assert.deepStrictEqual(S().layoutParams.fieldForm, plateDeal.form, 'the gun does not arm on a plate form');
  assert.strictEqual(S().raygunTap, 0, 'no tap is drawn against a plate');
  assert.strictEqual(S().historyUndoStack.length, 0, 'the refused gesture leaves no undo step');
  // Control: on a plain form the same gesture arms, exactly as #2003 shipped.
  useStore.setState({
    layoutParams: { ...base.layoutParams, composition: 'raster', fieldForm: plainForm },
    historyUndoStack: [],
    historyRedoStack: [],
    raygunTap: 0,
  });
  S().cyclePoemRaygun();
  assert.ok(S().layoutParams.fieldForm.raygun, 'control: the gun still arms on a plain form');
}

// ── The room, at the render seam ─────────────────────────────────────────
// The fixture stands on fieldStampPath's: the same buildPlacements call
// with no form, and with the plate form armed. The stage build is
// deterministic on (params, seed), so the two item lists correspond
// item for item; the plate may move ONLY the alpha of marks inside its
// zone, and its own stamps stand at full presence.
const seamAssets = [
  { id: 'a', weight: 'heavy' },
  { id: 'b', weight: 'medium' },
  { id: 'c', weight: 'light' },
];
const seamPalette = { swatches: ['#111', '#222', '#333', '#444'] };
const seamParams = {
  mode: 'grid',
  composition: 'default',
  count: 40,
  scale: [0.4, 0.8],
  rotate: [0, 45],
  alpha: [60, 100],
  jitter: 10,
  density: 100,
  zTiers: 1,
  bleed: false,
  mirror: false,
  overlap: true,
  displacement: 0,
  noiseFreq: 0.005,
  noiseSpeed: 0.5,
};
const seamCaps = { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true };
// The seam's plate: the g2 deal at seed 42. Its zone (measured against the
// fixture's mark rows below) holds a real population of the 40 marks —
// inside and outside populations are both real, so suppression and
// non-suppression are both exercised, not vacuously true.
const seamForm = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g2', plate: true }, mkRng(42), { aspect: 10 / 7 }).form;
const SW = 1000;
const SH = 700;
const seamBuild = (layoutParams) =>
  buildPlacements({ layoutParams, seed: 0x1a4f, activeAssets: seamAssets, palette: seamPalette, caps: seamCaps, canvasW: SW, canvasH: SH });
const zoneOf = (form) => {
  let zx0 = Infinity;
  let zy0 = Infinity;
  let zx1 = -Infinity;
  let zy1 = -Infinity;
  let emMax = 0;
  for (const s of form.stamps) {
    const cx = (s.x / form.aspect) * SW;
    const cy = s.y * SH;
    const hw = ((stampWidthEm(s.assetId, s.ch) * s.em) / 2 / form.aspect) * SW;
    const hh = (s.em / 2) * SH;
    zx0 = Math.min(zx0, cx - hw);
    zx1 = Math.max(zx1, cx + hw);
    zy0 = Math.min(zy0, cy - hh);
    zy1 = Math.max(zy1, cy + hh);
    emMax = Math.max(emMax, s.em);
  }
  const padX = ((PLATE_ZONE_PAD_EM * emMax) / form.aspect) * SW;
  const padY = PLATE_ZONE_PAD_EM * emMax * SH;
  return [zx0 - padX, zy0 - padY, zx1 + padX, zy1 + padY];
};
/** #2018 — the footprint test, in the suite's own terms (the audit's
 * geometry): a mark's ink box is its centre ± 50 × scale — the scene
 * contract's central cell box, the middle hundred of the ±100-unit quad —
 * and the room takes any mark whose ink ENTERS the zone, centre or not. */
const inkEnters = (item, [zx0, zy0, zx1, zy1]) => {
  const hx = 50 * item.scale;
  const hy = 50 * (item.scaleY ?? item.scale);
  return item.x + hx >= zx0 && item.x - hx <= zx1 && item.y + hy >= zy0 && item.y - hy <= zy1;
};
const centreIn = (item, [zx0, zy0, zx1, zy1]) => item.x >= zx0 && item.x <= zx1 && item.y >= zy0 && item.y <= zy1;
{
  const plainBuild = seamBuild(seamParams);
  const plateBuild = seamBuild({ ...seamParams, fieldForm: seamForm });
  assert.strictEqual(
    plateBuild.items.length,
    plainBuild.items.length + seamForm.stamps.length,
    'the plate build appends exactly the form’s stamps',
  );
  const [zx0, zy0, zx1, zy1] = zoneOf(seamForm);
  const zone = [zx0, zy0, zx1, zy1];
  let inZone = 0;
  let outZone = 0;
  let leanIn = 0;
  for (let i = 0; i < plainBuild.items.length; i++) {
    const before = plainBuild.items[i];
    const after = plateBuild.items[i];
    assert.strictEqual(after.x, before.x, 'a mark’s position never moves for a plate');
    assert.strictEqual(after.y, before.y, 'a mark’s position never moves for a plate');
    const inside = inkEnters(before, zone);
    if (inside) {
      inZone++;
      if (!centreIn(before, zone)) leanIn++;
      assert.ok(Math.abs(after.alpha - before.alpha * PLATE_ROOM_ALPHA) < 1e-9, 'a mark whose ink enters the zone is suppressed to PLATE_ROOM_ALPHA');
    } else {
      outZone++;
      assert.strictEqual(after.alpha, before.alpha, 'a mark whose ink stays clear of the zone is untouched');
    }
  }
  assert.ok(inZone > 0, 'the fixture’s zone holds marks to suppress');
  assert.ok(outZone > 0, 'the fixture’s dish holds marks outside the zone');
  const fieldItems = plateBuild.items.slice(plainBuild.items.length);
  assert.ok(fieldItems.every((it) => it.alpha === 100), 'the plate’s own stamps stand at full presence (the top of the alpha range)');
  assert.deepStrictEqual(
    fieldItems.map((it) => it.assetId),
    seamForm.stamps.map((s) => s.assetId),
    'the field items are the plate’s stamps, in order',
  );
  // When the plate leaves, the stage returns exactly: the same call with
  // no form reproduces the original list byte for byte.
  const afterBuild = seamBuild(seamParams);
  assert.strictEqual(JSON.stringify(afterBuild.items), JSON.stringify(plainBuild.items), 'no plate standing: the item list is the pre-plate list, exactly');
  // The registers compose at the seam too: a whispered plate is quiet
  // itself, and still quiets its room.
  const whispered = seamBuild({ ...seamParams, fieldForm: { ...seamForm, register: 'whisper' } });
  const wField = whispered.items.slice(plainBuild.items.length);
  assert.ok(wField.every((it) => Math.abs(it.alpha - 100 * WHISPER_ALPHA) < 1e-9), 'a whispered plate draws at the whisper alpha');
  let wIn = 0;
  for (let i = 0; i < plainBuild.items.length; i++) {
    const before = plainBuild.items[i];
    const inside = inkEnters(before, zone);
    if (inside) {
      wIn++;
      assert.ok(Math.abs(whispered.items[i].alpha - before.alpha * PLATE_ROOM_ALPHA) < 1e-9, 'a whispered plate still quiets its room');
    }
  }
  assert.ok(wIn === inZone, 'the whispered plate’s zone is the plate’s zone');
}

// ── Poem-only: catalogue yes, authored bake no, panel no ─────────────────
assert.strictEqual(ASSETS_AUTHORED.length, 312, 'the authored bake is untouched');
assert.ok(!ASSETS_PLATE.some((a) => ASSETS_AUTHORED.includes(a)), 'no plate stamp is authored content');
// #2008 RE-PIN (cause: the riso glyph expansion): the composed riso icon set (24) joins the
// catalogue on the plate pack's road — the sum grows by exactly the set; the riso suites own
// their containment pins.
// #2010 RE-PIN (cause: RAY GUN P1 · TORN & XEROXED): the worn letters (208) join on the same road.
assert.strictEqual(
  ASSETS.length,
  701 + 52 + 24 + 208,
  'the catalogue arithmetic: 701 + 52 plate stamps + 24 riso icons (#2008) + 208 worn letters (#2010)',
);
for (const a of ASSETS_PLATE) {
  assert.ok(ASSETS.some((x) => x.id === a.id), `${a.id}: resolves in the catalogue`);
  assert.ok(CHAPTER_UNDEALT.includes(a.id), `${a.id}: chapter-undealt`);
  assert.ok(NEVER_DEALT.includes(a.id), `${a.id}: roll-undealt`);
}
const recs = poolDescriptors(ASSETS);
assert.strictEqual(recs.length, 313, "the pool's records are exactly what they were before the pack");
assert.ok(!recs.some((r) => POEM_ONLY_STAMP_IDS.has(r.id)), 'no poem-only record reaches the panel');
assert.strictEqual(categoryCounts(recs).all, 313, "the pool's headline count is unchanged");
assert.ok(!chapterAssets('swiss').some((id) => POEM_ONLY_STAMP_IDS.has(id)), 'the swiss chapter deck holds no poem-only stamps');
assert.ok(!chapterAssets('now').some((id) => POEM_ONLY_STAMP_IDS.has(id)), 'the Now chapter deck holds no poem-only stamps');
assert.ok(!dealableRecords(ASSETS).some((r) => POEM_ONLY_STAMP_IDS.has(r.id)), 'a KINETIC roll never deals a poem-only stamp');
for (const v of VOICE_DECK) {
  const worn = Object.keys(v.def.assets).filter((id) => v.def.assets[id]);
  assert.ok(!worn.some((id) => POEM_ONLY_STAMP_IDS.has(id)), `${v.id}: the wardrobe wears no poem-only stamp`);
}
// The dice chokepoint: the pack's presence moves nothing (dealCast filters
// the poem-only union before any draw — the slice-3 census, re-run whole).
{
  const census = (pool, seed) => {
    const rng = mkRng(seed);
    const out = [];
    for (let i = 0; i < 600; i++) out.push(dealCast(pool, 5, rng, 0.5, []).map((a) => a.id).join(','));
    return out;
  };
  const visiblePool = ASSETS.filter((a) => !POEM_ONLY_STAMP_IDS.has(a.id));
  assert.deepStrictEqual(census(ASSETS, 2005), census(visiblePool, 2005), 'the 600-cast seeded census is identical with and without the packs present');
}

// ── The producer ─────────────────────────────────────────────────────────
// The Director calls the plate from the room, like the kana script and
// the slice-3 calls: contexts derived in fieldEval's step, affirmed in
// choosePoet, carried by dealPoet. No context draws from the deal stream:
// the pick spends exactly the two draws it always spends (pool, piece).
const seqRng = (vals) => {
  let i = 0;
  return () => (i < vals.length ? vals[i++] : 0.5);
};
const countedPick = (args) => {
  let draws = 0;
  const pick = choosePoet({
    ...args,
    rng: () => {
      draws++;
      return 0;
    },
  });
  return { pick, draws };
};
{
  const { pick, draws } = countedPick({ intensity: 0.2, typeEligible: true });
  assert.ok(pick && pick.poetId === 'greenleaf' && pick.pieceId === 'g1', 'the plain pick is greenleaf g1');
  assert.ok(!('plate' in pick) && !('face' in pick) && !('case' in pick) && !('plateBreak' in pick), 'no context affirmed: no call rides the decision');
  assert.strictEqual(draws, 2, 'the plain pick spends its two draws');
}
{
  const { pick, draws } = countedPick({ intensity: 0.2, typeEligible: true, soloContext: true });
  assert.strictEqual(pick.plate, true, 'the solo room at its stillest affirms the plate for Whittier');
  assert.ok(!('face' in pick), 'the plate supersedes the serif call at the pick');
  assert.strictEqual(draws, 2, 'the plate call spends no draw');
}
{
  const atLine = choosePoet({ intensity: PLATE_CALL_MAX_INTENSITY, rng: () => 0, typeEligible: true, soloContext: true });
  assert.strictEqual(atLine.plate, true, 'at the stillness line, the plate is called');
  const overLine = choosePoet({ intensity: PLATE_CALL_MAX_INTENSITY + 0.01, rng: () => 0, typeEligible: true, soloContext: true });
  assert.ok(!('plate' in overLine) && overLine.face === 'serif', 'over the line, the solo room deals the serif reading instead');
  const warmSolo = choosePoet({ intensity: 0.5, rng: () => 0, typeEligible: true, soloContext: true });
  assert.ok(warmSolo.face === 'serif' && !('plate' in warmSolo), 'a warm solo room deals serif, never a plate');
  const stillTeijo = choosePoet({ intensity: 0.1, rng: seqRng([0.9, 0.0]), typeEligible: true, soloContext: true });
  assert.ok(stillTeijo && stillTeijo.poetId === 'teijo' && stillTeijo.pieceId === 't1', 'the scripted draw picks teijo t1');
  assert.ok(!('plate' in stillTeijo) && !('face' in stillTeijo), 'the plate is Whittier-only at the pick, as at the door');
  assert.strictEqual(stillTeijo.plateBreak, 'typ_o_sect', 'the long-form break call is undisturbed by the plate’s existence');
}
// step: the contexts are the room's, derived exactly as the slice-3 ones.
{
  const stillStep = step({ ...INITIAL_STATE }, { intensity: 0.2, verdict: 'DAVIS ALONE', lookFamily: 'swiss' }, () => 0);
  assert.strictEqual(stillStep.decision.plate, true, 'step: a still DAVIS ALONE room affirms the plate through the real step');
  const warmStep = step({ ...INITIAL_STATE }, { intensity: 0.5, verdict: 'DAVIS ALONE', lookFamily: 'swiss' }, () => 0);
  assert.ok(warmStep.decision.face === 'serif' && !('plate' in warmStep.decision), 'step: a warm DAVIS ALONE room affirms serif, not the plate');
  const roomStep = step({ ...INITIAL_STATE }, { intensity: 0.2, verdict: 'THE ROOM', lookFamily: 'swiss' }, () => 0);
  assert.ok(!('plate' in roomStep.decision) && !('face' in roomStep.decision), 'step: an ordinary room at the same intensity affirms nothing');
}
// The dealt frequency, measured on a seeded solo sweep: plates are
// exactly the still-band share of solo Whittier deals — present, a
// minority of the reading room's Whittier deals, and none outside the
// stillest band (the serif call takes every other solo Whittier deal).
{
  const rng = mkRng(2005);
  let soloWhittier = 0;
  let stillWhittier = 0;
  let plates = 0;
  let serifs = 0;
  let platesOutsideStill = 0;
  for (let i = 0; i < 3000; i++) {
    const intensity = rng();
    const pick = choosePoet({ intensity, rng, typeEligible: true, soloContext: true });
    if (!pick || pick.poetId !== 'greenleaf') continue;
    soloWhittier++;
    if (intensity <= PLATE_CALL_MAX_INTENSITY) {
      stillWhittier++;
      if (pick.plate) plates++;
    } else {
      if (pick.plate) platesOutsideStill++;
      if (pick.face === 'serif') serifs++;
    }
  }
  assert.strictEqual(plates, stillWhittier, 'every still-band solo Whittier pick deals a plate');
  assert.strictEqual(platesOutsideStill, 0, 'no plate is dealt outside the stillest band');
  assert.ok(plates > 0, 'plates are dealt in the sweep');
  assert.ok(serifs > plates, `plates are the minority of the reading room's Whittier deals (plates ${plates}, serif ${serifs}, of ${soloWhittier} solo Whittier picks)`);
}
// The Director itself: dealPoet is the store's poem-deal entry (landPoem).
// The room is set the production way (the fieldLatin fixture): ticks that
// name the look's family and, for the solo room, LOIS away with the
// generator rolling unattended.
const directorInRoom = ({ feed, lookFamily }) => {
  const d = createDirector({ now: () => 1000 });
  let verdict = null;
  for (let i = 0; i < 3; i++) {
    const r = d.tick({ feed, audio: 0.1, nowTs: 1000 + i * 1000, lookFamily });
    verdict = r.gains.room ? r.gains.room.verdict : null;
  }
  return { d, verdict };
};
{
  const { d, verdict } = directorInRoom({ feed: { away: true, rollsLastMinute: 3 }, lookFamily: 'swiss' });
  assert.strictEqual(verdict, 'DAVIS ALONE', 'setup: LOIS away, generator rolling — the Director stands in the solo room');
  const decision = d.dealPoet({ fieldRng: () => 0, lookFamily: 'swiss' });
  assert.ok(decision && decision.poetId === 'greenleaf' && decision.plate === true, 'live path: the still solo room deals Whittier with the plate call');
  assert.ok(!('face' in decision), 'live path: the plate deal carries no serif call');
  const { form, gate } = fieldDealReport(decision, mkRng(7), { aspect: 10 / 7 });
  assert.ok(form && !gate, 'live path: the plate deal spawns through the real deal');
  assert.strictEqual(form.plate, true, 'live path: the form on the dish is a plate form');
  measurePlate(form, 'live-path plate');
  assert.deepStrictEqual(sanitizeFieldForm(form), form, 'live path: the plate form round-trips the door');
}
{
  const { d, verdict } = directorInRoom({ feed: {}, lookFamily: 'swiss' });
  assert.notStrictEqual(verdict, 'DAVIS ALONE', 'setup: LOIS present — not the solo room');
  const decision = d.dealPoet({ fieldRng: () => 0, lookFamily: 'swiss' });
  assert.ok(decision && decision.poetId === 'greenleaf', 'live path: the plain room still deals Whittier');
  assert.ok(
    !('plate' in decision) && !('face' in decision) && !('case' in decision) && !('plateBreak' in decision),
    'live path: outside the affirming rooms the deal is the plain deal, exactly as before',
  );
}

// ── #2018: the em floor, measured on dealt plates ────────────────────────
// The audit's Q4 table, re-read through the real deal path at 10/7: the
// grid pieces dealt at half size (g1 0.0290, g3 0.0374); the floor puts
// them at PLATE_EM_FLOOR exactly (g1 by re-breaking its rows, g3 by the
// measure yielding), and the bands pieces are untouched.
{
  const emOf = (pieceId) => fieldDealReport({ poetId: 'greenleaf', pieceId, plate: true }, mkRng(42), { aspect: 10 / 7 }).form.stamps[0].em;
  assert.ok(Math.abs(emOf('g1') - PLATE_EM_FLOOR) < 1e-9, 'g1 grid plate deals at the em floor (was 0.0290 before #2018)');
  assert.ok(Math.abs(emOf('g3') - PLATE_EM_FLOOR) < 1e-9, 'g3 grid plate deals at the em floor (was 0.0374 before #2018)');
  assert.ok(Math.abs(emOf('g2') - 0.0677) < 5e-4, 'g2 bands plate is unchanged (0.0677, the audit’s reading)');
  assert.ok(Math.abs(emOf('g4') - 0.0721) < 5e-4, 'g4 bands plate is unchanged (0.0721, the audit’s reading)');
  const g1Rows = new Set(fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1', plate: true }, mkRng(42), { aspect: 10 / 7 }).form.stamps.map((s) => s.y));
  assert.strictEqual(g1Rows.size, 3, 'g1 reaches the floor by re-breaking: its two lines deal as three rows');
}

// ── #2018: the dense stage — the room at drive density ───────────────────
// The audit's core complaint about the seam fixture above: composited,
// its zone was 6–40× clearer than a real dense layer, and it only ever
// asserted per-item alphas. This fixture stands on the audit's dense
// parameters (count 450, scale [0.4, 1.6], alpha [40, 100], density 92 —
// the geometry stage deals 401 of the 450, as in the audit's B build)
// and MEASURES the zone: a CPU composite of the built list in draw
// order, the audit's method — premultiplied source-over of each mark's
// rasterized ink (Resvg, the pack test's way) mapped to its central cell
// box, area-weighted per pixel.
const denseAssets = ASSETS_AUTHORED.slice(0, 3).map((a, i) => ({ id: a.id, weight: ['heavy', 'medium', 'light'][i] }));
const densePalette = { swatches: ['#0d2b2e', '#27565a', '#5f8285', '#a8bcbb', '#e8e3d5', '#8a4b23'] };
const denseParams = {
  mode: 'grid',
  composition: 'default',
  count: 450,
  scale: [0.4, 1.6],
  rotate: [0, 45],
  alpha: [40, 100],
  jitter: 10,
  density: 92,
  zTiers: 1,
  bleed: false,
  mirror: false,
  overlap: false,
  displacement: 0,
  noiseFreq: 0.005,
  noiseSpeed: 0.5,
};
const denseCaps = { maxCount: 900, maxCountMirrored: 900, maxParticles: 200, allowMirror: true };
const denseForm = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1', plate: true }, mkRng(42), { aspect: 10 / 7 }).form;
const denseBuild = (layoutParams) =>
  buildPlacements({ layoutParams, seed: 0x1a4f, activeAssets: denseAssets, palette: densePalette, caps: denseCaps, canvasW: SW, canvasH: SH });
const inkGridOf = new Map();
for (const da of denseAssets) {
  const src = ASSETS_AUTHORED.find((a) => a.id === da.id);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">' +
    src.svg.replaceAll('var(--ink)', '#ffffff').replaceAll('var(--accent)', '#ffffff') +
    '</svg>';
  const img = new Resvg(svg, { font: RESVG_FONT, fitTo: { mode: 'width', value: 100 } }).render();
  const px = img.pixels; // read ONCE: the getter materializes the buffer per access
  const grid = new Float32Array(100 * 100);
  for (let i = 0; i < 100 * 100; i++) grid[i] = px[i * 4 + 3] / 255;
  inkGridOf.set(da.id, grid);
}
/** Zone effective opacity of a marks-only item list: 1 − mean transmittance over the zone. */
const zoneCoverage = (items, [zx0, zy0, zx1, zy1]) => {
  const w = Math.max(1, Math.round(zx1 - zx0));
  const h = Math.max(1, Math.round(zy1 - zy0));
  const T = new Float32Array(w * h).fill(1);
  for (const it of items) {
    const ink = inkGridOf.get(it.assetId);
    if (!ink) continue;
    const s = it.scale;
    const sy = it.scaleY ?? it.scale;
    const x0 = it.x - 50 * s;
    const y0 = it.y - 50 * sy;
    const uFrom = Math.max(0, Math.floor((zx0 - x0) / s));
    const uTo = Math.min(99, Math.ceil((zx1 - x0) / s) - 1);
    const vFrom = Math.max(0, Math.floor((zy0 - y0) / sy));
    const vTo = Math.min(99, Math.ceil((zy1 - y0) / sy) - 1);
    for (let v = vFrom; v <= vTo; v++) {
      for (let u = uFrom; u <= uTo; u++) {
        const a = ink[v * 100 + u];
        if (a <= 0) continue;
        const wx0 = Math.max(zx0, x0 + u * s);
        const wx1 = Math.min(zx1, x0 + (u + 1) * s);
        const wy0 = Math.max(zy0, y0 + v * sy);
        const wy1 = Math.min(zy1, y0 + (v + 1) * sy);
        const px0 = Math.floor(wx0 - zx0);
        const px1 = Math.min(w - 1, Math.ceil(wx1 - zx0) - 1);
        const py0 = Math.floor(wy0 - zy0);
        const py1 = Math.min(h - 1, Math.ceil(wy1 - zy0) - 1);
        for (let py = py0; py <= py1; py++) {
          const oy = Math.min(wy1, zy0 + py + 1) - Math.max(wy0, zy0 + py);
          if (oy <= 0) continue;
          for (let px = px0; px <= px1; px++) {
            const ox = Math.min(wx1, zx0 + px + 1) - Math.max(wx0, zx0 + px);
            if (ox <= 0) continue;
            T[py * w + px] *= 1 - a * (it.alpha / 100) * ox * oy;
          }
        }
      }
    }
  }
  let sum = 0;
  for (const t of T) sum += t;
  return 1 - sum / T.length;
};
const rgbOf = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** The ink rule, stated in the suite's own terms: the swatch whose squared
 * RGB distance to the marks' colours, summed over every mark, is greatest
 * (ties keep the earliest); the accent follows by ACCENT_OFFSET. */
const expectedInk = (palette, markItems) => {
  let best = -1;
  let bestScore = -1;
  palette.swatches.forEach((sw, si) => {
    const [r, g, b] = rgbOf(sw);
    let total = 0;
    for (const it of markItems) {
      const [mr, mg, mb] = rgbOf(it.color);
      total += (r - mr) * (r - mr) + (g - mg) * (g - mg) + (b - mb) * (b - mb);
    }
    if (total > bestScore) {
      bestScore = total;
      best = si;
    }
  });
  return { color: palette.swatches[best], accent: palette.swatches[(best + ACCENT_OFFSET) % palette.swatches.length] };
};
{
  const plain = denseBuild(denseParams);
  const plated = denseBuild({ ...denseParams, fieldForm: denseForm });
  const zone = zoneOf(denseForm);
  const nStamps = denseForm.stamps.length;
  assert.strictEqual(plated.items.length, plain.items.length + nStamps, 'dense: the plate build appends exactly the form’s stamps');
  const plateItems = plated.items.slice(-nStamps);
  const markItems = plated.items.slice(0, -nStamps);
  assert.ok(plateItems.every((it) => it.key.startsWith('field-')), 'dense: the plate’s items are the tail of the built list (lever 3, under the overlap sort)');
  assert.ok(!markItems.some((it) => it.key.startsWith('field-')), 'dense: no field item hides among the marks');
  assert.deepStrictEqual(
    plateItems.map((it) => it.assetId),
    denseForm.stamps.map((s) => s.assetId),
    'dense: the tail is the plate’s stamps, in order',
  );
  assert.ok(plateItems.every((it) => it.alpha === 100), 'dense: the plate’s stamps stand at full presence');
  // The footprint rule, per item, against the unsuppressed build by key.
  const plainByKey = new Map(plain.items.map((it) => [it.key, it]));
  let centrePop = 0;
  let leanPop = 0;
  let outPop = 0;
  for (const it of markItems) {
    const before = plainByKey.get(it.key);
    assert.ok(before, 'dense: every mark in the plate build exists in the plain build');
    if (inkEnters(before, zone)) {
      if (centreIn(before, zone)) centrePop++;
      else leanPop++;
      assert.ok(Math.abs(it.alpha - before.alpha * PLATE_ROOM_ALPHA) < 1e-9, 'dense: a mark whose ink enters the zone is suppressed');
    } else {
      outPop++;
      assert.strictEqual(it.alpha, before.alpha, 'dense: a mark whose ink stays clear is untouched');
    }
  }
  assert.ok(centrePop > 0, 'dense: the zone holds centre-in marks');
  assert.ok(leanPop > 0, 'dense: the zone is leaned into by centre-outside marks (the audit’s dominant leak)');
  assert.ok(outPop > 0, 'dense: marks outside the zone exist');
  // The measured room: effective opacity over the zone, room off vs on.
  const covOff = zoneCoverage(plain.items, zone);
  const covOn = zoneCoverage(markItems, zone);
  console.log(`  dense room: zone coverage ${covOff.toFixed(4)} (no plate) → ${covOn.toFixed(4)} (plate, footprint room)`);
  assert.ok(covOff > 0.5, 'dense: the unroomed zone is genuinely covered (the sparse seam fixture composited 0.004–0.026)');
  assert.ok(covOn < covOff / 2.5, 'dense: the footprint room cuts the zone’s coverage by more than 2.5×');
  assert.ok(covOn < 0.35, 'dense: the roomed zone’s effective opacity lands under 0.35');
  // The ink rule: every plate stamp wears the expected swatch + accent,
  // and the whole build replays identically.
  const want = expectedInk(densePalette, plain.items);
  assert.ok(
    plateItems.every((it) => it.color === want.color && it.accent === want.accent),
    `dense: the plate deals in the most distant swatch (${want.color}), accent by ACCENT_OFFSET (${want.accent})`,
  );
  const replay = denseBuild({ ...denseParams, fieldForm: denseForm });
  assert.strictEqual(JSON.stringify(replay.items), JSON.stringify(plated.items), 'dense: the plate build replays byte-identically (the ink rule spends no draws)');
  // The rule reads the dealt marks however few: at count 0 the geometry
  // stage still deals a single mark, and the plate's ink is the swatch
  // most distant from that one mark's colour.
  const emptyPlate = denseBuild({ ...denseParams, count: 0, fieldForm: denseForm });
  const emptyPlain = denseBuild({ ...denseParams, count: 0, fieldForm: plainForm });
  const loneMark = emptyPlain.items.filter((it) => !it.key.startsWith('field-'));
  assert.strictEqual(loneMark.length, 1, 'count 0 still deals its single mark');
  const wantLone = expectedInk(densePalette, loneMark);
  assert.ok(
    emptyPlate.items.filter((it) => it.key.startsWith('field-')).every((it) => it.color === wantLone.color && it.accent === wantLone.accent),
    'an almost-empty room: the plate contrasts against the one mark standing',
  );
  // The fallback: with no swatches to choose from, the plate's colours
  // are the per-stamp assignment's — the same white the plain form's
  // stamps get from the same empty palette.
  const noSwatch = { swatches: [] };
  const barePlate = buildPlacements({
    layoutParams: { ...denseParams, fieldForm: denseForm },
    seed: 0x1a4f,
    activeAssets: denseAssets,
    palette: noSwatch,
    caps: denseCaps,
    canvasW: SW,
    canvasH: SH,
  });
  const barePlain = buildPlacements({
    layoutParams: { ...denseParams, fieldForm: plainForm },
    seed: 0x1a4f,
    activeAssets: denseAssets,
    palette: noSwatch,
    caps: denseCaps,
    canvasW: SW,
    canvasH: SH,
  });
  const bareField = (b) => b.items.filter((it) => it.key.startsWith('field-')).map((it) => [it.color, it.accent]);
  assert.deepStrictEqual(bareField(barePlate), bareField(barePlain), 'no swatches: the plate falls back to the per-stamp colour assignment');
  assert.ok(bareField(barePlate).every(([c, a]) => c === '#ffffff' && a === '#ffffff'), 'the fallback colour is the assignment’s empty-palette white');
}
// The mirror room: reflections are quieted in the zone they land in, and
// the mirrored plate has a room of its own (the pre-#2018 room ran before
// mirroring, so both leaked at full alpha).
{
  const mirParams = { ...denseParams, count: 200, mirror: 'x' };
  const plainM = denseBuild(mirParams);
  const platedM = denseBuild({ ...mirParams, fieldForm: denseForm });
  const zone = zoneOf(denseForm);
  const reflZone = [SW - zone[2], zone[1], SW - zone[0], zone[3]];
  const nStamps = denseForm.stamps.length;
  assert.strictEqual(platedM.items.length, 2 * (plainM.items.length / 2 + nStamps), 'mirror: the plate build mirrors marks and stamps alike');
  const plainMByKey = new Map(plainM.items.map((it) => [it.key, it]));
  const fieldIdx = [];
  platedM.items.forEach((it, i) => {
    if (it.key.startsWith('field-')) fieldIdx.push(i);
  });
  assert.strictEqual(fieldIdx.length, 2 * nStamps, 'mirror: the plate and its reflection both stand');
  assert.strictEqual(Math.min(...fieldIdx), platedM.items.length - fieldIdx.length, 'mirror: every field item (originals and copies) draws after every mark');
  let reflOnly = 0;
  for (const it of platedM.items) {
    if (it.key.startsWith('field-')) continue;
    const before = plainMByKey.get(it.key);
    assert.ok(before, 'mirror: every mark in the plate build exists in the plain build');
    const inAny = inkEnters(before, zone) || inkEnters(before, reflZone);
    if (inAny) {
      assert.ok(Math.abs(it.alpha - before.alpha * PLATE_ROOM_ALPHA) < 1e-9, 'mirror: a mark whose ink enters either zone is suppressed exactly once');
      if (!inkEnters(before, zone) && inkEnters(before, reflZone)) reflOnly++;
    } else {
      assert.strictEqual(it.alpha, before.alpha, 'mirror: a mark clear of both zones is untouched');
    }
  }
  assert.ok(reflOnly > 0, 'mirror: marks are suppressed by the mirrored plate’s room alone — the room exists on both halves');
}

console.log('fieldPlate.selfcheck: all assertions passed');
