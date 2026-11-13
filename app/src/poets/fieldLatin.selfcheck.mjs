// fieldLatin.selfcheck.mjs — FIELD stamps slice 3 (#2002): the Latin growth, poem-only.
//
// Pins the slice's whole contract, on the fieldKana/fieldKanji pattern:
//  - the packs: Anton lowercase (26) + the declared punctuation set (17) on
//    the caps pack's own reference; the serif face (52, PT Serif Bold) for
//    Whittier; the ornaments (4: § ¶ † ‡ — the fleuron and asterism are
//    absent from both bake fonts, the long dash already ships as shared
//    punctuation) — path data only, every glyph rasterizing with real ink
//    under the pinned font, with NO system fonts (the #1970 CI condition).
//    Anton's lowercase is genuinely drawn: every a–z stamp's baked outline
//    differs from its cap's (the font-level probe — distinct glyph indices,
//    x-height metrics — is recorded in STAGING-REPORT-2002.md).
//  - the resolver: the base charset grows (lowercase, punctuation,
//    ornaments resolve); serif ids NEVER resolve in the base face.
//  - the deck: Greenleaf carries caseLines — the sentence face — parallel
//    to Teijo's nativeLines; the deals reach every new set (case deal,
//    serif deal, serif+case deal, plate-break deal), and every dishonoured
//    call degrades the way the script call taught (no marker, base face).
//  - the face law (gate + door): serif stamps pass only in a declared
//    serif form, base letters are refused inside one, digits + punctuation
//    are shared, a serif form is Whittier-only, the faces never compose.
//  - the break-only law (gate + door): an ornament passes only alone on
//    its baseline row in a Latin-face form, under its declared marker;
//    inside a line, in a native form, undeclared, or mismatched — refused.
//  - poem-only: the catalogue carries the packs (602 + 26 + 17 + 52 + 4,
//    and #2005's 52 plate stamps on top), the authored bake does not, the
//    panel's records stay 313, and every dealing surface excludes the
//    grown poem-only union by id. (#2150 RE-PIN: the panel's records are
//    266 from that slice on — the glyph set leaves the panel with the deal;
//    the union below grows by the 36 caps/digits.)
//  - the producer (fix loop, Matt's ruling 2026-11-06): the Director calls
//    face/case/plateBreak from the room, like the kana script — the last
//    section drives the LIVE path (choosePoet under the contexts step
//    derives; a real Director's dealPoet in rooms set up as production
//    sets them) and proves serif, case, and plate-break forms are dealt
//    there, and nowhere outside the affirming rooms.
import assert from 'node:assert';
import { Resvg } from '@resvg/resvg-js';
import { ASSETS, ASSETS_AUTHORED } from '../data/assets/index.js';
import { ASSETS_LATIN } from '../data/assets/assets-latin.js';
import { ASSETS_SERIF } from '../data/assets/assets-serif.js';
import { ASSETS_ORNAMENTS } from '../data/assets/assets-ornaments.js';
import { ASSETS_LETTERS } from '../data/assets/assets-letterforms.js';
import { RESVG_FONT } from '../assets/resvgFont.mjs';
import {
  stampIdForChar,
  latinStampIdForChar,
  lowerStampIdForChar,
  punctStampIdForChar,
  serifStampIdForChar,
  ornamentStampIdForChar,
  stampIdForGlyph,
  lineMapsToStamps,
  glyphWidthEm,
  serifGlyphWidthEm,
  stampWidthEm,
  LATIN_STAMP_IDS,
  LOWER_STAMP_IDS,
  PUNCT_STAMP_IDS,
  SERIF_STAMP_IDS,
  ORNAMENT_STAMP_IDS,
  ORNAMENT_GLYPH_BY_ID,
  NATIVE_STAMP_IDS,
  POEM_ONLY_STAMP_IDS,
} from './placement.js';
import { fieldDealReport, sanitizeFieldForm, gateFieldForm, FIELD_POEM_MIN_STAMPS } from './fieldForm.js';
import { GREENLEAF } from './greenleaf.js';
import { poolDescriptors, categoryCounts } from '../panels/assetPoolLogic.mjs';
import { CHAPTER_UNDEALT, chapterAssets } from '../data/chapters.js';
import { NEVER_DEALT, dealableRecords } from '../state/rollPool.mjs';
import { dealCast } from '../curator/dice.js';
import { VOICE_DECK } from '../data/voiceDeck.js';
import { mkRng } from '../engine/prng.js';
import { choosePoet } from '../curator/fieldDirector.js';
import { step, INITIAL_STATE } from '../curator/fieldEval.js';
import { createDirector } from '../curator/director.js';

// ── The declared sets (mirror the generators — the two must agree) ───────
const DECLARED_PUNCT = [
  ['.', 'period'],
  [',', 'comma'],
  [';', 'semicolon'],
  [':', 'colon'],
  ['!', 'bang'],
  ['?', 'quest'],
  ['‘', 'lsquo'],
  ['’', 'rsquo'],
  ['“', 'ldquo'],
  ['”', 'rdquo'],
  ['-', 'hyphen'],
  ['–', 'endash'],
  ['—', 'emdash'],
  ['&', 'amp'],
  ['…', 'ellipsis'],
  ['(', 'lparen'],
  [')', 'rparen'],
];
const DECLARED_ORNAMENTS = [
  ['§', 'sect'],
  ['¶', 'pilcrow'],
  ['†', 'dagger'],
  ['‡', 'ddagger'],
];

// ── The packs ────────────────────────────────────────────────────────────
assert.strictEqual(ASSETS_LATIN.length, 43, 'the latin pack is 26 lowercase + 17 punctuation');
assert.strictEqual(ASSETS_LATIN.filter((a) => a.tags.includes('lowercase')).length, 26, '26 lowercase stamps');
assert.strictEqual(ASSETS_LATIN.filter((a) => a.tags.includes('punct')).length, 17, '17 punctuation stamps');
assert.strictEqual(new Set(ASSETS_LATIN.map((a) => a.id)).size, 43, 'latin ids unique');
assert.strictEqual(new Set(ASSETS_LATIN.map((a) => a.glyph)).size, 43, 'latin glyphs unique');
for (const a of ASSETS_LATIN) {
  assert.ok(a.svg.startsWith('<path d="') && !a.svg.includes('<text'), `${a.id}: path data only, never <text>`);
  assert.strictEqual(latinStampIdForChar(a.glyph), a.id, `${a.id}: glyph <-> id bijection`);
}
for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
  assert.strictEqual(lowerStampIdForChar(ch), `typ_l_${ch}`, `${ch}: a lowercase stamp exists`);
  assert.ok(!PUNCT_STAMP_IDS.has(`typ_l_${ch}`), `${ch}: lowercase and punct classes are disjoint`);
}
for (const [ch, slug] of DECLARED_PUNCT) {
  assert.strictEqual(punctStampIdForChar(ch), `typ_p_${slug}`, `${ch}: the declared punctuation set is complete`);
  assert.strictEqual(lowerStampIdForChar(ch), null, `${ch}: punctuation is not lowercase`);
}
// Anton's lowercase is drawn, not remapped: each lowercase stamp's baked
// outline differs from its cap's, and sits smaller (x-height, not cap height).
const capsByGlyph = new Map(ASSETS_LETTERS.map((a) => [a.id.slice(4), a]));
for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
  const lower = ASSETS_LATIN.find((a) => a.glyph === ch);
  const cap = capsByGlyph.get(ch.toUpperCase());
  assert.notStrictEqual(lower.svg, cap.svg, `${ch}: the lowercase outline is its own drawing, not the cap's`);
}
const inkH = (svg) => {
  const nums = (svg.match(/d="([^"]+)"/g) || []).join(' ').match(/-?\d+(?:\.\d+)?/g) || [];
  const ys = nums.filter((_, i) => i % 2 === 1).map(Number);
  return Math.max(...ys) - Math.min(...ys);
};
assert.ok(inkH(ASSETS_LATIN.find((a) => a.glyph === 'a').svg) < inkH(capsByGlyph.get('A').svg), 'a sits at x-height below A');

assert.strictEqual(ASSETS_SERIF.length, 52, 'the serif pack is A–Z + a–z');
assert.strictEqual(new Set(ASSETS_SERIF.map((a) => a.id)).size, 52, 'serif ids unique');
assert.strictEqual(new Set(ASSETS_SERIF.map((a) => a.glyph)).size, 52, 'serif glyphs unique');
for (const a of ASSETS_SERIF) {
  assert.ok(a.svg.startsWith('<path d="') && !a.svg.includes('<text'), `${a.id}: path data only, never <text>`);
  assert.strictEqual(serifStampIdForChar(a.glyph), a.id, `${a.id}: glyph <-> id bijection`);
  assert.ok(a.tags.includes('serif'), `${a.id}: tagged serif`);
}
for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz') {
  assert.strictEqual(serifStampIdForChar(ch), `typ_s_${ch}`, `${ch}: a serif stamp exists`);
}

assert.strictEqual(ASSETS_ORNAMENTS.length, 4, 'the ornament pack is the covered furniture: § ¶ † ‡');
assert.strictEqual(new Set(ASSETS_ORNAMENTS.map((a) => a.id)).size, 4, 'ornament ids unique');
for (const [ch, slug] of DECLARED_ORNAMENTS) {
  const a = ASSETS_ORNAMENTS.find((x) => x.id === `typ_o_${slug}`);
  assert.ok(a, `typ_o_${slug} exists`);
  assert.strictEqual(a.glyph, ch, `typ_o_${slug} is ${ch}`);
  assert.ok(a.svg.startsWith('<path d="') && !a.svg.includes('<text'), `${a.id}: path data only, never <text>`);
  assert.strictEqual(ornamentStampIdForChar(ch), a.id, `${a.id}: glyph <-> id bijection`);
  assert.strictEqual(ORNAMENT_GLYPH_BY_ID.get(a.id), ch, `${a.id}: the deal names breaks by id, back to this glyph`);
}
assert.strictEqual(ornamentStampIdForChar('❦'), null, 'the fleuron is absent from both bake fonts — no stamp, honestly');
assert.strictEqual(ornamentStampIdForChar('—'), null, 'the long dash is not duplicated: it is the shared punctuation stamp');

// ── Ink under the pinned font, no system fonts (the #1970 condition) ────
for (const a of [...ASSETS_LATIN, ...ASSETS_SERIF, ...ASSETS_ORNAMENTS]) {
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

// ── The resolver ─────────────────────────────────────────────────────────
assert.strictEqual(stampIdForGlyph('a'), 'typ_l_a', 'the base resolver grows: lowercase');
assert.strictEqual(stampIdForGlyph('.'), 'typ_p_period', 'the base resolver grows: punctuation');
assert.strictEqual(stampIdForGlyph('’'), 'typ_p_rsquo', 'the typographic apostrophe resolves');
assert.strictEqual(stampIdForGlyph('§'), 'typ_o_sect', 'the base resolver reaches ornaments (the gate judges their law)');
assert.strictEqual(stampIdForGlyph('A'), 'typ_A', 'caps resolution untouched');
assert.strictEqual(stampIdForChar('a'), null, 'the letterform resolver itself is unchanged (caps + digits only)');
assert.ok(![...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'].some((ch) => stampIdForGlyph(ch)?.startsWith('typ_s_')), 'a serif id never resolves in the base face');
assert.ok(lineMapsToStamps('The snow lies quiet'), 'a mixed-case line maps to stamps');
assert.ok(lineMapsToStamps('Wait — really?'), 'a punctuated line maps to stamps');
assert.ok(!lineMapsToStamps('snow€ falls'), 'a glyph no pack carries still refuses the line');
assert.ok(glyphWidthEm('a') > 0 && glyphWidthEm('.') > 0, 'lowercase and punctuation widths measured');
assert.ok(serifGlyphWidthEm('W') > 0 && serifGlyphWidthEm('W') !== glyphWidthEm('W'), 'serif widths are their own ruler');
assert.strictEqual(stampWidthEm('typ_s_A', 'A'), serifGlyphWidthEm('A'), 'a serif stamp measures serif');
assert.strictEqual(stampWidthEm('typ_A', 'A'), glyphWidthEm('A'), 'a base stamp measures base');
assert.strictEqual(NATIVE_STAMP_IDS.size, 289, 'the native face did NOT grow: slice 3 is Latin-side');
// #2010 RE-PIN (cause: RAY GUN P1 · TORN & XEROXED): the worn letters (208) join the union on the same road.
// #2150 RE-PIN (cause: type exclusivity): the caps/digits pack (36) joins the union — FIELD deals the base face alone now.
assert.strictEqual(
  POEM_ONLY_STAMP_IDS.size,
  289 + 43 + 52 + 4 + 52 + 208 + 36,
  'the poem-only union grew by exactly the slice-3 packs, by #2005’s plate pack (52), by #2010’s worn letters (208), and by #2150’s caps/digits (36)',
);
for (const id of [...LATIN_STAMP_IDS, ...SERIF_STAMP_IDS, ...ORNAMENT_STAMP_IDS]) {
  assert.ok(POEM_ONLY_STAMP_IDS.has(id), `${id}: in the poem-only union`);
  assert.ok(!NATIVE_STAMP_IDS.has(id), `${id}: not in the native face`);
}

// ── The deck: Greenleaf's sentence face ──────────────────────────────────
for (const piece of GREENLEAF) {
  assert.ok(
    Array.isArray(piece.caseLines) && piece.caseLines.length === piece.lines.length,
    `${piece.id}: sentence face for every line`,
  );
  for (const line of piece.caseLines) assert.ok(lineMapsToStamps(line), `${piece.id}: "${line}" maps to stamps`);
  const glyphs = piece.caseLines.join('').replace(/ /g, '').length;
  assert.ok(glyphs >= FIELD_POEM_MIN_STAMPS, `${piece.id}: the sentence face clears the poem threshold (${glyphs} glyphs)`);
  assert.ok(/[a-z]/.test(piece.caseLines.join('')), `${piece.id}: the sentence face is genuinely lowercase`);
  assert.ok(piece.caseLines.join('').includes('.'), `${piece.id}: the sentence face carries punctuation`);
}

// ── The deals: every new set is reached by a real deal ───────────────────
const caseDeal = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1', case: true }, mkRng(42));
assert.ok(caseDeal.form, 'a case deal spawns a form');
assert.strictEqual(caseDeal.gate, null, 'a case deal is not a gate refusal');
assert.ok(!('face' in caseDeal.form) && !('script' in caseDeal.form), 'a case form carries no face/script marker (the base charset grew)');
assert.ok(caseDeal.form.stamps.some((s) => LOWER_STAMP_IDS.has(s.assetId)), 'the case form deals lowercase stamps');
assert.ok(caseDeal.form.stamps.some((s) => PUNCT_STAMP_IDS.has(s.assetId)), 'the case form deals punctuation stamps');
assert.ok(
  caseDeal.form.stamps.every(
    (s) =>
      (LOWER_STAMP_IDS.has(s.assetId) && lowerStampIdForChar(s.ch) === s.assetId) ||
      (PUNCT_STAMP_IDS.has(s.assetId) && punctStampIdForChar(s.ch) === s.assetId) ||
      stampIdForChar(s.ch) === s.assetId,
  ),
  'every stamp of the case form is glyph-matched in its class',
);
assert.deepStrictEqual(sanitizeFieldForm(caseDeal.form), caseDeal.form, 'a case form round-trips the document door');

const capsDeal = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(42));
assert.ok(
  capsDeal.form.stamps.every((s) => stampIdForChar(s.ch) === s.assetId),
  'without the case call the same piece deals its caps face, as always',
);
const gibsonCase = fieldDealReport({ poetId: 'gibson', pieceId: 'w2', case: true }, mkRng(42));
assert.ok(
  gibsonCase.form.stamps.every((s) => stampIdForChar(s.ch) === s.assetId),
  'a case call on a deck with no sentence face deals caps — the call degrades, the deck is the authority',
);

const serifDeal = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1', face: 'serif' }, mkRng(42));
assert.ok(serifDeal.form, 'a serif deal spawns a form');
assert.strictEqual(serifDeal.form.face, 'serif', 'the form declares its face');
assert.ok(
  serifDeal.form.stamps.every((s) => SERIF_STAMP_IDS.has(s.assetId) && serifStampIdForChar(s.ch) === s.assetId),
  'every stamp of the serif form is a serif stamp for its glyph',
);
assert.deepStrictEqual(sanitizeFieldForm(serifDeal.form), serifDeal.form, 'a serif form round-trips the document door');

const serifCase = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1', face: 'serif', case: true }, mkRng(42));
assert.ok(serifCase.form && serifCase.form.face === 'serif', 'the serif + case deal declares the face');
assert.ok(
  serifCase.form.stamps.some((s) => SERIF_STAMP_IDS.has(s.assetId) && s.ch >= 'a' && s.ch <= 'z'),
  'the serif lowercase stamps are dealt — the serif face has no dead half',
);
assert.ok(
  serifCase.form.stamps.some((s) => PUNCT_STAMP_IDS.has(s.assetId)),
  'punctuation in a serif form is the shared base stamp (face-shared, not duplicated)',
);
assert.deepStrictEqual(sanitizeFieldForm(serifCase.form), serifCase.form, 'a serif sentence form round-trips the door');

const teijoSerif = fieldDealReport({ poetId: 'teijo', pieceId: 't1', face: 'serif' }, mkRng(42));
assert.ok(teijoSerif.form && !('face' in teijoSerif.form), 'a serif call under another poet is not honoured');
assert.ok(
  teijoSerif.form.stamps.every((s) => !SERIF_STAMP_IDS.has(s.assetId)),
  'no serif stamp is dealt outside Whittier',
);

// ── The plate-break deals ────────────────────────────────────────────────
const breakDeal = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g2', plateBreak: 'typ_o_sect' }, mkRng(42));
assert.ok(breakDeal.form, 'a plate-break deal spawns a form');
assert.strictEqual(breakDeal.form.break, 'typ_o_sect', 'the form carries the break marker, naming the ornament by id');
const breakStamps = breakDeal.form.stamps.filter((s) => ORNAMENT_STAMP_IDS.has(s.assetId));
assert.strictEqual(breakStamps.length, 1, 'exactly one break stamp is dealt');
const rows = [...new Set(breakDeal.form.stamps.map((s) => s.y))].sort((a, b) => a - b);
assert.strictEqual(rows.length, 3, 'the break deal has three rows: line, break, line');
assert.strictEqual(breakStamps[0].y, rows[1], "the break stamp stands on the middle row — between the poem's lines");
assert.ok(
  breakDeal.form.stamps.every((s) => s === breakStamps[0] || Math.abs(s.y - breakStamps[0].y) > 1e-6),
  'the break stamp is alone on its row',
);
assert.deepStrictEqual(sanitizeFieldForm(breakDeal.form), breakDeal.form, 'a break form round-trips the document door');

const serifBreak = fieldDealReport(
  { poetId: 'greenleaf', pieceId: 'g2', face: 'serif', plateBreak: 'typ_o_dagger' },
  mkRng(42),
);
assert.ok(serifBreak.form && serifBreak.form.break === 'typ_o_dagger', 'a break is admissible in a serif form too');
assert.deepStrictEqual(sanitizeFieldForm(serifBreak.form), serifBreak.form, 'a serif break form round-trips the door');

const singleBreak = fieldDealReport({ poetId: 'gibson', pieceId: 'w1', plateBreak: 'typ_o_sect' }, mkRng(42));
assert.ok(singleBreak.form && !('break' in singleBreak.form), "a 'single' piece joins its lines — the break call is not honoured there");
assert.ok(
  !singleBreak.form.stamps.some((s) => ORNAMENT_STAMP_IDS.has(s.assetId)),
  'no ornament stamp rides a single-baseline form',
);
const nativeBreak = fieldDealReport(
  { poetId: 'teijo', pieceId: 't1', script: 'kana', plateBreak: 'typ_o_sect' },
  mkRng(42),
);
assert.ok(nativeBreak.form && !('break' in nativeBreak.form), 'a break call on a native deal is not honoured (charset purity)');
assert.ok(!nativeBreak.form.stamps.some((s) => ORNAMENT_STAMP_IDS.has(s.assetId)), 'no ornament stamp in a native form');
const fakeBreak = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g2', plateBreak: 'typ_A' }, mkRng(42));
assert.ok(fakeBreak.form && !('break' in fakeBreak.form), 'a break call naming a non-ornament deals no break');

// ── The gate's face law ──────────────────────────────────────────────────
assert.strictEqual(
  gateFieldForm(serifDeal.form.stamps, { aspect: serifDeal.form.aspect }).ok,
  false,
  'serif stamps are refused without the affirmed serif context',
);
assert.strictEqual(
  gateFieldForm(serifDeal.form.stamps, { aspect: serifDeal.form.aspect }).reason,
  'charset',
  'the refusal is the charset law',
);
assert.ok(
  gateFieldForm(serifDeal.form.stamps, { aspect: serifDeal.form.aspect, face: 'serif' }).ok,
  'serif stamps pass in the affirmed serif context',
);
const at = (assetId, ch, x, y = 0.5) => ({ assetId, ch, x, y, rotation: 0, em: 0.06 });
assert.ok(
  gateFieldForm([at('typ_s_A', 'A', 0.3), at('typ_7', '7', 0.7)], { aspect: 10 / 7, face: 'serif' }).ok,
  'a digit stamp is face-shared: honest inside a serif form',
);
assert.strictEqual(
  gateFieldForm([at('typ_s_A', 'A', 0.3), at('typ_B', 'B', 0.7)], { aspect: 10 / 7, face: 'serif' }).ok,
  false,
  'a base letter stamp inside a serif context is refused',
);
assert.strictEqual(
  gateFieldForm([at('typ_s_a', 'a', 0.3), at('typ_l_b', 'b', 0.7)], { aspect: 10 / 7, face: 'serif' }).ok,
  false,
  'an Anton lowercase stamp inside a serif context is refused (one letter face per form)',
);
assert.strictEqual(
  gateFieldForm([at('typ_l_a', 'a', 0.3), at('typ_p_period', '.', 0.7)], { aspect: 10 / 7 }).reason,
  'ok',
  'lowercase + punctuation pass in the base context — one face, freely mixed',
);
assert.strictEqual(
  gateFieldForm([at('typ_l_a', 'b', 0.5)], { aspect: 10 / 7 }).ok,
  false,
  'a lowercase stamp whose glyph disagrees with its id is refused',
);

// ── The gate's break-only law ────────────────────────────────────────────
assert.ok(
  gateFieldForm([at('typ_A', 'A', 0.5, 0.25), at('typ_o_sect', '§', 0.5, 0.55), at('typ_B', 'B', 0.5, 0.85)], {
    aspect: 10 / 7,
  }).ok,
  'an ornament alone on its row, between lines, passes',
);
assert.strictEqual(
  gateFieldForm([at('typ_A', 'A', 0.3, 0.5), at('typ_o_sect', '§', 0.7, 0.5)], { aspect: 10 / 7 }).ok,
  false,
  'an ornament sharing a row with a letter — glyph-adjacent inside a line — is refused',
);
assert.strictEqual(
  gateFieldForm([at('typ_o_sect', '§', 0.3, 0.5), at('typ_o_dagger', '†', 0.7, 0.5)], { aspect: 10 / 7 }).ok,
  false,
  'two ornaments on one row are glyph-adjacent to each other — refused',
);
assert.strictEqual(
  gateFieldForm([at('typ_o_sect', '§', 0.5, 0.5)], { aspect: 10 / 7, allowKana: true }).ok,
  false,
  'an ornament in the native context is refused (charset purity)',
);
assert.strictEqual(
  gateFieldForm([at('typ_o_sect', '¶', 0.5, 0.5)], { aspect: 10 / 7 }).ok,
  false,
  'an ornament stamp whose glyph disagrees with its id is refused',
);

// ── The document door's face + break law ─────────────────────────────────
assert.strictEqual(
  sanitizeFieldForm({ ...serifDeal.form, poetId: 'teijo' }),
  null,
  'a serif form under another poet is refused',
);
assert.strictEqual(
  sanitizeFieldForm({ ...serifDeal.form, face: undefined }),
  null,
  'serif stamps without the declared face are refused',
);
assert.strictEqual(
  sanitizeFieldForm({
    ...serifDeal.form,
    stamps: serifDeal.form.stamps.map((s, j) => (j === 0 ? { ...s, assetId: `typ_${s.ch}` } : s)),
  }),
  null,
  'a base letter stamp inside a declared serif form is refused',
);
assert.strictEqual(sanitizeFieldForm({ ...serifDeal.form, face: 'gothic' }), null, 'a dishonest face value refuses the form whole');
assert.strictEqual(
  sanitizeFieldForm({ ...serifDeal.form, script: 'kana' }),
  null,
  'face + script together is refused — the faces never compose',
);
assert.deepStrictEqual(
  sanitizeFieldForm({ ...serifDeal.form, register: 'whisper' }),
  { ...serifDeal.form, register: 'whisper' },
  'a whispered serif form round-trips — face and register together (#1906 composes with #2002)',
);
assert.strictEqual(
  sanitizeFieldForm({ ...breakDeal.form, break: undefined }),
  null,
  'an ornament stamp riding without its declared marker is refused',
);
assert.strictEqual(
  sanitizeFieldForm({ ...breakDeal.form, break: 'typ_o_dagger' }),
  null,
  'a break marker naming a different ornament than the stamps is refused',
);
assert.strictEqual(
  sanitizeFieldForm({ ...caseDeal.form, break: 'typ_o_sect' }),
  null,
  'a break marker standing without its stamps is refused',
);
assert.strictEqual(sanitizeFieldForm({ ...breakDeal.form, break: 'typ_A' }), null, 'a break marker naming a non-ornament is refused');
const crowdedBreak = {
  ...breakDeal.form,
  stamps: breakDeal.form.stamps.map((s) =>
    ORNAMENT_STAMP_IDS.has(s.assetId) ? { ...s, y: breakDeal.form.stamps[0].y } : s,
  ),
};
assert.strictEqual(sanitizeFieldForm(crowdedBreak), null, 'a break stamp moved onto a line’s row is refused at the door');
const nativeForm = fieldDealReport({ poetId: 'teijo', pieceId: 't1', script: 'kana' }, mkRng(42)).form;
assert.strictEqual(
  sanitizeFieldForm({ ...nativeForm, break: 'typ_o_sect' }),
  null,
  'a break marker on a native form is refused (charset purity)',
);
assert.deepStrictEqual(
  sanitizeFieldForm({ ...breakDeal.form, register: 'whisper' }),
  { ...breakDeal.form, register: 'whisper' },
  'a whispered break form round-trips — break and register together',
);

// ── Poem-only: catalogue yes, authored bake no, panel no ─────────────────
assert.strictEqual(ASSETS_AUTHORED.length, 312, 'the authored bake is untouched');
assert.ok(
  ![...ASSETS_LATIN, ...ASSETS_SERIF, ...ASSETS_ORNAMENTS].some((a) => ASSETS_AUTHORED.includes(a)),
  'no slice-3 stamp is authored content',
);
assert.strictEqual(
  ASSETS.length,
  602 + (26 + 17 + 52 + 4) + 52 + 24 + 208,
  'the catalogue arithmetic: 602 + (26 lowercase + 17 punct + 52 serif + 4 ornaments) + 52 plate stamps (#2005) + 24 riso icons (#2008) + 208 worn letters (#2010)',
);
for (const a of [...ASSETS_LATIN, ...ASSETS_SERIF, ...ASSETS_ORNAMENTS]) {
  assert.ok(ASSETS.some((x) => x.id === a.id), `${a.id}: resolves in the catalogue`);
  assert.ok(CHAPTER_UNDEALT.includes(a.id), `${a.id}: chapter-undealt`);
  assert.ok(NEVER_DEALT.includes(a.id), `${a.id}: roll-undealt`);
}
const recs = poolDescriptors(ASSETS);
// #2150 RE-PIN (cause: type exclusivity): 313 − 47 glyphs (36 typ_* + 3 solo text stamps + 8 letter-anatomy emblems).
assert.strictEqual(recs.length, 266, "the pool's records are the pre-pack records minus the #2150 glyph set");
assert.ok(!recs.some((r) => POEM_ONLY_STAMP_IDS.has(r.id)), 'no poem-only record reaches the panel');
assert.strictEqual(categoryCounts(recs).all, 266, "the pool's headline count drops by exactly the glyph set");
assert.ok(!chapterAssets('swiss').some((id) => POEM_ONLY_STAMP_IDS.has(id)), 'the swiss chapter deck holds no poem-only stamps');
assert.ok(!chapterAssets('now').some((id) => POEM_ONLY_STAMP_IDS.has(id)), 'the Now chapter deck holds no poem-only stamps');
assert.ok(!dealableRecords(ASSETS).some((r) => POEM_ONLY_STAMP_IDS.has(r.id)), 'a KINETIC roll never deals a poem-only stamp');
for (const v of VOICE_DECK) {
  const worn = Object.keys(v.def.assets).filter((id) => v.def.assets[id]);
  assert.ok(!worn.some((id) => POEM_ONLY_STAMP_IDS.has(id)), `${v.id}: the wardrobe wears no poem-only stamp`);
}

// ── The dice chokepoint: the packs' presence moves nothing ───────────────
// dealCast filters the poem-only packs at the cast chokepoint, before any
// draw, so a seeded census over the full catalogue must reproduce the
// census over the catalogue-without-poem-only pick for pick.
const census = (pool, seed) => {
  const rng = mkRng(seed);
  const out = [];
  for (let i = 0; i < 600; i++) out.push(dealCast(pool, 5, rng, 0.5, []).map((a) => a.id).join(','));
  return out;
};
const visiblePool = ASSETS.filter((a) => !POEM_ONLY_STAMP_IDS.has(a.id));
const withPacks = census(ASSETS, 2002);
const withoutPacks = census(visiblePool, 2002);
assert.deepStrictEqual(withPacks, withoutPacks, 'the 600-cast seeded census is identical with and without the packs present');
assert.ok(
  !withPacks.some((cast) => cast.split(',').some((id) => POEM_ONLY_STAMP_IDS.has(id))),
  'no cast deals a poem-only stamp',
);

// ── The producer (fix loop — Matt's ruling, 2026-11-06) ──────────────────
// The deals above are hand-built decisions. QA's should-fix: no production
// code ever SET face/case/plateBreak, so the sets were dark on a live
// stage. The ruling: the Director calls it from the room, like the kana
// script. The pins below run the LIVE path — choosePoet with the contexts
// fieldEval's step derives from the room, and a real Director's dealPoet,
// the exact entry layoutSlice's landPoem calls — with the room set up the
// way production sets it (ticks naming the look's family; LOIS away for
// the solo room). No context ever draws from the deal stream: every rng
// below is scripted to the pick draws alone (pool, then piece).
const seqRng = (vals) => {
  let i = 0;
  return () => (i < vals.length ? vals[i++] : 0.5);
};

// choosePoet: the affirmations ride the decision, conditionally — a room
// that affirms nothing deals the plain decision, key for key as before.
const plainPick = choosePoet({ intensity: 0.2, rng: () => 0, typeEligible: true });
assert.ok(plainPick && plainPick.poetId === 'greenleaf' && plainPick.pieceId === 'g1', 'the plain pick is greenleaf g1');
assert.ok(
  !('face' in plainPick) && !('case' in plainPick) && !('plateBreak' in plainPick),
  'no context affirmed: the decision carries no slice-3 call',
);
const soloPick = choosePoet({ intensity: 0.3, rng: () => 0, typeEligible: true, soloContext: true });
assert.strictEqual(soloPick.face, 'serif', 'the solo room affirms the serif face for Whittier');
assert.ok(!('plate' in soloPick), '#2005: above the stillness line the solo deal is a serif reading, not a plate');
assert.ok(!('plateBreak' in soloPick), 'g1 is two lines — not long-form, no break call');
// #2005 RE-PIN (cause: the clean plate): this fixture stood at intensity
// 0.2, where the solo room's Whittier deal is now a PLATE — the plate call
// supersedes the serif call at the stillest band (intensity ≤
// PLATE_CALL_MAX_INTENSITY), by the plate's design. The serif affirmation
// is pinned here at 0.3 (same cool pool, same draw), above the line; the
// plate suite owns the still-band pins.
const bauhausPick = choosePoet({ intensity: 0.2, rng: () => 0, typeEligible: true, bauhausContext: true });
assert.strictEqual(bauhausPick.case, true, 'a Bauhaus room affirms the sentence face');
assert.ok(!('face' in bauhausPick), 'the sentence face is not the serif face');
const soloTeijo = choosePoet({ intensity: 0.2, rng: seqRng([0.9, 0.0]), typeEligible: true, soloContext: true });
assert.ok(soloTeijo && soloTeijo.poetId === 'teijo' && soloTeijo.pieceId === 't1', 'the scripted draw picks teijo t1');
assert.strictEqual(soloTeijo.plateBreak, 'typ_o_sect', 'the solo room calls a plate break on a long-form piece');
assert.ok(!('face' in soloTeijo), 'the serif face is Whittier-only at the pick, as at the door');

// step: the contexts are the room's — the verdict as the step resolves it
// and the dealt look's family, derived exactly as japaneseContext is.
const soloStep = step({ ...INITIAL_STATE }, { intensity: 0.3, verdict: 'DAVIS ALONE', lookFamily: 'swiss' }, () => 0);
assert.strictEqual(soloStep.decision.face, 'serif', 'step: a DAVIS ALONE room affirms serif through the real step');
assert.ok(!('plate' in soloStep.decision), '#2005: at 0.3 the step deals the serif reading, not a plate');
const soloStanding = step(
  { ...INITIAL_STATE, room: 'DAVIS ALONE' },
  { intensity: 0.3, lookFamily: 'swiss' },
  () => 0,
);
assert.strictEqual(soloStanding.decision.face, 'serif', "step: the room the session stands in speaks when the input names none");
const roomStep = step({ ...INITIAL_STATE }, { intensity: 0.2, verdict: 'THE ROOM', lookFamily: 'swiss' }, () => 0);
assert.ok(
  !('face' in roomStep.decision) && !('case' in roomStep.decision) && !('plateBreak' in roomStep.decision),
  'step: an ordinary swiss room affirms nothing',
);
const bauhausStep = step({ ...INITIAL_STATE }, { intensity: 0.2, verdict: 'AGREEMENT', lookFamily: 'bauhaus' }, seqRng([0.9, 0.0]));
assert.ok(bauhausStep.decision.poetId === 'teijo' && bauhausStep.decision.case === true, 'step: the case call is affirmed for any poet — the deck decides');
const bauhausTeijoForm = fieldDealReport(bauhausStep.decision, mkRng(7), { aspect: 10 / 7 }).form;
assert.ok(bauhausTeijoForm, 'the bauhaus teijo deal spawns');
assert.ok(
  !bauhausTeijoForm.stamps.some((s) => LOWER_STAMP_IDS.has(s.assetId)),
  "teijo's deck carries no sentence face — the affirmed call degrades to her caps lines",
);

// The Director itself: dealPoet is the store's poem-deal entry (landPoem).
// The room is set the production way — ticks that name the look's family
// and, for the solo room, the honest feed as it stands when the room IS
// DAVIS ALONE: LOIS away and the generator rolling unattended (the AWAY
// rows of the matrix need a Davis state too — rollsLastMinute is the
// feed's own field for his fires).
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
  // #2005 RE-PIN (cause: the clean plate): this room stands at the
  // Director's stillest intensity, inside the plate's band — the live solo
  // deal is a PLATE deal now, and the serif call is superseded on it (the
  // plate suite owns the plate's live-path pins; the serif call's live
  // affirmation above the line is pinned at choosePoet/step level above).
  const decision = d.dealPoet({ fieldRng: () => 0, lookFamily: 'swiss' });
  assert.ok(
    decision && decision.poetId === 'greenleaf' && decision.plate === true && !('face' in decision),
    'live path: the still solo room deals Whittier with the plate call, superseding serif',
  );
  const { form, gate } = fieldDealReport(decision, mkRng(7), { aspect: 10 / 7 });
  assert.ok(form && !gate, 'live path: the plate deal spawns through the real deal');
  assert.strictEqual(form.plate, true, 'live path: the form on the dish is a plate form');
  assert.deepStrictEqual(sanitizeFieldForm(form), form, 'live path: the plate form round-trips the door');

  const breakDecision = d.dealPoet({ fieldRng: seqRng([0.9, 0.0]), lookFamily: 'swiss' });
  assert.ok(
    breakDecision && breakDecision.poetId === 'teijo' && breakDecision.plateBreak === 'typ_o_sect',
    'live path: the solo room deals a long-form piece with the break call',
  );
  const breakForm = fieldDealReport(breakDecision, mkRng(7), { aspect: 10 / 7 }).form;
  assert.ok(breakForm && breakForm.break === 'typ_o_sect', 'live path: the break form carries its marker');
  const ornaments = breakForm.stamps.filter((s) => ORNAMENT_STAMP_IDS.has(s.assetId));
  assert.strictEqual(ornaments.length, 1, 'live path: exactly one break stamp stands');
  assert.ok(
    breakForm.stamps.every((s) => s === ornaments[0] || Math.abs(s.y - ornaments[0].y) > 1e-6),
    'live path: the break stamp is alone on its row',
  );
  assert.deepStrictEqual(sanitizeFieldForm(breakForm), breakForm, 'live path: the break form round-trips the door');
}
{
  const { d } = directorInRoom({ feed: {}, lookFamily: 'bauhaus' });
  const decision = d.dealPoet({ fieldRng: () => 0, lookFamily: 'bauhaus' });
  assert.ok(decision && decision.poetId === 'greenleaf' && decision.case === true, 'live path: a Bauhaus room deals Whittier with the case call');
  assert.ok(!('face' in decision), 'live path: the Bauhaus deal carries no face call');
  const { form } = fieldDealReport(decision, mkRng(7), { aspect: 10 / 7 });
  assert.ok(form && !('face' in form), 'live path: the case form is a base-face form');
  assert.ok(form.stamps.some((s) => LOWER_STAMP_IDS.has(s.assetId)), 'live path: the case form deals lowercase stamps');
  assert.deepStrictEqual(sanitizeFieldForm(form), form, 'live path: the case form round-trips the door');
}
{
  const { d, verdict } = directorInRoom({ feed: {}, lookFamily: 'swiss' });
  assert.notStrictEqual(verdict, 'DAVIS ALONE', 'setup: LOIS present — not the solo room');
  const decision = d.dealPoet({ fieldRng: () => 0, lookFamily: 'swiss' });
  assert.ok(decision && decision.poetId === 'greenleaf', 'live path: the plain room still deals Whittier');
  assert.ok(
    !('face' in decision) && !('case' in decision) && !('plateBreak' in decision),
    'live path: outside the affirming rooms the deal is the plain deal, exactly as before',
  );
}

console.log('fieldLatin.selfcheck: all assertions passed');
