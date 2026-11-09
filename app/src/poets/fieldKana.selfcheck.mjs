// fieldKana.selfcheck.mjs — FIELD stamps slice 1 (#1982): the kana set, poem-only.
//
// Pins the slice's whole contract:
//  - the pack: 163 baked stamps (46 basic + 25 dakuten/handakuten + 10 small
//    per script, plus the long-vowel mark), path data only, every glyph
//    rasterizing with real ink under the bake's pinned font — with NO system
//    fonts (the #1970 CI condition), so the census confirms them honestly.
//  - the resolver: kana characters map to their stamps, Latin is untouched,
//    unmapped characters still have no stamp.
//  - the deal: a Teijo decision carrying the Director's kana script places
//    the piece's kanaLines into an all-kana form that round-trips the
//    document door; the same decision without the script deals Latin.
//  - the gate: kana stamps pass the stillborn gate only in the affirmed
//    kana context; a mismatched glyph/id pair is refused anywhere.
//  - poem-only: the catalogue carries the pack, the authored bake does not,
//    and the pool's descriptor records (the panel's data) contain none of
//    them — the pool's count is exactly what it was before the pack landed.
import assert from 'node:assert';
import { Resvg } from '@resvg/resvg-js';
import { ASSETS, ASSETS_AUTHORED } from '../data/assets/index.js';
import { ASSETS_KANA } from '../data/assets/assets-kana.js';
import { RESVG_FONT } from '../assets/resvgFont.mjs';
import {
  stampIdForChar,
  kanaStampIdForChar,
  nativeStampIdForChar,
  stampIdForGlyph,
  lineMapsToStamps,
  glyphWidthEm,
  KANA_STAMP_IDS,
  KANJI_STAMP_IDS,
  NATIVE_STAMP_IDS,
} from './placement.js';
import { fieldDealReport, sanitizeFieldForm, gateFieldForm, FIELD_POEM_MIN_STAMPS } from './fieldForm.js';
import { TEIJO } from './teijo.js';
import { choosePoet } from '../curator/fieldDirector.js';
import { step, INITIAL_STATE } from '../curator/fieldEval.js';
import { poolDescriptors, categoryCounts } from '../panels/assetPoolLogic.mjs';
import { CHAPTER_UNDEALT, chapterAssets } from '../data/chapters.js';
import { NEVER_DEALT, dealableRecords } from '../state/rollPool.mjs';
import { mkRng } from '../engine/prng.js';

// ── The pack ─────────────────────────────────────────────────────────────
assert.strictEqual(ASSETS_KANA.length, 163, 'the kana pack is 163 stamps');
const hira = ASSETS_KANA.filter((a) => a.tags.includes('hiragana'));
const kata = ASSETS_KANA.filter((a) => a.tags.includes('katakana'));
assert.strictEqual(hira.length, 81, 'hiragana: 46 basic + 25 dakuten/handakuten + 10 small');
assert.strictEqual(kata.length, 82, 'katakana: the same 81 + the long-vowel mark');
assert.strictEqual(new Set(ASSETS_KANA.map((a) => a.id)).size, 163, 'ids unique');
assert.strictEqual(new Set(ASSETS_KANA.map((a) => a.glyph)).size, 163, 'glyphs unique');
for (const a of ASSETS_KANA) {
  assert.ok(a.svg.startsWith('<path d="') && !a.svg.includes('<text'), `${a.id}: path data only, never <text>`);
  assert.strictEqual(kanaStampIdForChar(a.glyph), a.id, `${a.id}: glyph <-> id bijection`);
}
for (const id of ['typ_h_ga', 'typ_h_ji', 'typ_k_pa', 'typ_h_xtu', 'typ_k_xya', 'typ_k_long', 'typ_h_n', 'typ_k_wo']) {
  assert.ok(KANA_STAMP_IDS.has(id), `${id} exists (dakuten, handakuten, small kana, long mark are in)`);
}

// ── Ink under the pinned font, no system fonts (the #1970 condition) ────
for (const a of ASSETS_KANA) {
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
assert.strictEqual(stampIdForGlyph('あ'), 'typ_h_a');
assert.strictEqual(stampIdForGlyph('ガ'), 'typ_k_ga');
assert.strictEqual(stampIdForGlyph('ー'), 'typ_k_long');
assert.strictEqual(stampIdForGlyph('A'), 'typ_A', 'Latin resolution untouched');
// #2002 RE-PIN (cause: slice 3) — '!' gained a stamp (the punctuation pack),
// so the unmapped-character case moves to a glyph no pack carries ('€'),
// and the '!' mapping itself is pinned where the slice-3 suite owns it.
assert.strictEqual(stampIdForGlyph('!'), 'typ_p_bang', '#2002: the punctuation pack gives ! a stamp');
assert.strictEqual(stampIdForGlyph('€'), null, 'an unmapped character still has no stamp');
assert.strictEqual(stampIdForChar('あ'), null, 'the Latin resolver still refuses kana');
assert.ok(lineMapsToStamps('なつのちょう'), 'a kana line maps to stamps');
assert.ok(lineMapsToStamps('HELLO!'), '#2002: the punctuation growth maps the line');
assert.ok(!lineMapsToStamps('HELLO€'), 'an unmapped Latin character still refuses the line');
assert.ok(glyphWidthEm('あ') > 0.5 && glyphWidthEm('あ') < 1.3, 'kana width measured, full-width class');
assert.ok(glyphWidthEm('A') > 0, 'Latin metrics intact');

// ── The deck ─────────────────────────────────────────────────────────────
for (const piece of TEIJO) {
  assert.ok(Array.isArray(piece.kanaLines) && piece.kanaLines.length === piece.lines.length, `${piece.id}: kana face for every line`);
  for (const line of piece.kanaLines) assert.ok(lineMapsToStamps(line), `${piece.id}: "${line}" maps to kana stamps`);
  const glyphs = piece.kanaLines.join('').length;
  assert.ok(glyphs >= FIELD_POEM_MIN_STAMPS, `${piece.id}: the kana face clears the poem threshold (${glyphs} glyphs)`);
}

// ── The deal ─────────────────────────────────────────────────────────────
const kanaDeal = fieldDealReport({ poetId: 'teijo', pieceId: 't1', script: 'kana' }, mkRng(42));
assert.ok(kanaDeal.form, 'a kana Teijo deal spawns a form');
assert.strictEqual(kanaDeal.gate, null, 'a kana deal is not a gate refusal');
assert.strictEqual(kanaDeal.form.script, 'kana', 'the form declares its script');
assert.ok(kanaDeal.form.stamps.length >= FIELD_POEM_MIN_STAMPS, 'the kana form clears the poem threshold');
// #1998 RE-PIN (cause: slice 2): the native deal now serves the piece's
// nativeLines — real orthography, kanji + kana mixed — so the form's stamps
// are the NATIVE set, not kana alone. The slice-1 assertion below it keeps
// the kana subset honest: every kana stamp in the form is glyph-matched,
// and the mixed form provably carries both scripts. The pure-kana face is
// still the fallback for a piece with kanaLines and no nativeLines
// (fieldForm.js) — no shipped piece exercises it after this slice.
assert.ok(
  kanaDeal.form.stamps.every((s) => NATIVE_STAMP_IDS.has(s.assetId) && nativeStampIdForChar(s.ch) === s.assetId),
  'every stamp of a native form is a native-script stamp for its glyph (#1998: kanji admitted to the face)',
);
assert.ok(
  kanaDeal.form.stamps.some((s) => KANJI_STAMP_IDS.has(s.assetId)) &&
    kanaDeal.form.stamps.some((s) => KANA_STAMP_IDS.has(s.assetId)),
  'the t1 native form is genuinely mixed: kanji and kana stamps together (#1998)',
);
assert.ok(
  kanaDeal.form.stamps
    .filter((s) => KANA_STAMP_IDS.has(s.assetId))
    .every((s) => kanaStampIdForChar(s.ch) === s.assetId),
  'every kana stamp of the form is a kana stamp for its glyph',
);
assert.deepStrictEqual(sanitizeFieldForm(kanaDeal.form), kanaDeal.form, 'a kana form round-trips the document door');

const latinDeal = fieldDealReport({ poetId: 'teijo', pieceId: 't1' }, mkRng(42));
assert.ok(latinDeal.form && !('script' in latinDeal.form), 'the same piece without the script call deals Latin, unmarked');
assert.ok(
  latinDeal.form.stamps.every((s) => s.assetId.startsWith('typ_') && !KANA_STAMP_IDS.has(s.assetId)),
  'a Latin deal carries no kana stamps',
);
const wrongPoet = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1', script: 'kana' }, mkRng(42));
assert.ok(
  !wrongPoet.form || wrongPoet.form.stamps.every((s) => !KANA_STAMP_IDS.has(s.assetId)),
  'a kana call on a deck with no kana face deals no kana stamps',
);

// ── The gate's context law ───────────────────────────────────────────────
assert.strictEqual(
  gateFieldForm(kanaDeal.form.stamps, { aspect: kanaDeal.form.aspect }).ok,
  false,
  'kana stamps are refused without the affirmed kana context',
);
assert.strictEqual(
  gateFieldForm(kanaDeal.form.stamps, { aspect: kanaDeal.form.aspect }).reason,
  'charset',
  'the refusal is the charset law',
);
assert.ok(
  gateFieldForm(kanaDeal.form.stamps, { aspect: kanaDeal.form.aspect, allowKana: true }).ok,
  'kana stamps pass in the affirmed kana context',
);
const swapped = kanaDeal.form.stamps.map((s, j) => (j === 0 ? { ...s, ch: 'い' } : s));
assert.strictEqual(
  gateFieldForm(swapped, { aspect: kanaDeal.form.aspect, allowKana: true }).ok,
  false,
  'a kana stamp whose glyph disagrees with its id is refused even in context',
);

// ── The document door's script law ───────────────────────────────────────
assert.strictEqual(
  sanitizeFieldForm({ ...kanaDeal.form, poetId: 'greenleaf' }),
  null,
  'a kana form under another poet is refused',
);
assert.strictEqual(
  sanitizeFieldForm({ ...kanaDeal.form, script: undefined }),
  null,
  'kana stamps without the declared script are refused',
);
assert.strictEqual(
  sanitizeFieldForm({
    ...kanaDeal.form,
    stamps: kanaDeal.form.stamps.map((s, j) => (j === 0 ? latinDeal.form.stamps[0] : s)),
  }),
  null,
  'a Latin stamp inside a declared kana form is refused',
);
// #1906 (FIELD S5) — the register composes with the script: independent
// markers, each under its own law, both carried when honest.
assert.deepStrictEqual(
  sanitizeFieldForm({ ...kanaDeal.form, register: 'whisper' }),
  { ...kanaDeal.form, register: 'whisper' },
  'a whispered kana form round-trips — script and register together',
);
assert.strictEqual(
  sanitizeFieldForm({ ...kanaDeal.form, register: 'loud' }),
  null,
  'a dishonest register refuses a kana form whole too',
);

// ── The pick: script is the Director's call, Japanese rooms only ─────────
const teijoDraw = () => 0.9; // cool pool ['greenleaf','teijo'] -> index 1; piece draw -> a late piece
const jp = choosePoet({ intensity: 0.2, rng: teijoDraw, typeEligible: true, japaneseContext: true });
assert.strictEqual(jp.poetId, 'teijo', 'the crafted draw picks Teijo');
assert.strictEqual(jp.script, 'kana', 'a Japanese-context Teijo pick carries the kana call');
const ch = choosePoet({ intensity: 0.2, rng: teijoDraw, typeEligible: true, japaneseContext: false });
assert.strictEqual(ch.poetId, 'teijo');
assert.ok(!('script' in ch), 'a type-native but non-Japanese room deals Teijo her Latin face');
const jpStep = step({ ...INITIAL_STATE }, { intensity: 0.2, verdict: 'AGREEMENT', lookFamily: 'japanese' }, teijoDraw);
assert.strictEqual(jpStep.decision?.script, 'kana', 'the step wires the Japanese family to the kana call');
const swissStep = step({ ...INITIAL_STATE }, { intensity: 0.2, verdict: 'AGREEMENT', lookFamily: 'swiss' }, teijoDraw);
assert.ok(!('script' in (swissStep.decision || {})), 'a Swiss room never carries the kana call');

// ── Poem-only: catalogue yes, authored bake no, panel no ─────────────────
assert.strictEqual(ASSETS_AUTHORED.length, 312, 'the authored bake is untouched');
assert.ok(!ASSETS_AUTHORED.some((a) => KANA_STAMP_IDS.has(a.id)), 'no kana in the authored set');
// #1998 RE-PIN (cause: slice 2): the curated kanji pack (126: 125 curated
// kanji + the iteration mark) joins the catalogue on the kana pack's road —
// the sum grows by exactly the pack.
// #2002 RE-PIN (cause: slice 3): the Latin growth (43: 26 lowercase + 17
// punctuation), the serif face (52) and the ornaments (4) join the
// catalogue on the same road — the sum grows by exactly the packs.
// #2005 RE-PIN (cause: the clean plate): the plate pack (52, Fraunces)
// joins the catalogue on the same road — the sum grows by exactly the pack.
// #2008 RE-PIN (cause: the riso glyph expansion): the composed riso icon
// set (24) joins the catalogue on the same road — the sum grows by exactly
// the set.
assert.strictEqual(
  ASSETS.length,
  312 + 1 + 163 + 126 + 43 + 52 + 4 + 52 + 24,
  'the catalogue is authored + citizen + kana + kanji + latin + serif + ornaments + plate + riso',
);
assert.ok(ASSETS_KANA.every((a) => ASSETS.some((x) => x.id === a.id)), 'every kana stamp resolves in the catalogue');
const recs = poolDescriptors(ASSETS);
assert.strictEqual(recs.length, 313, "the pool's records are exactly what they were before the pack");
assert.ok(!recs.some((r) => KANA_STAMP_IDS.has(r.id)), 'no kana record reaches the panel');
// …and no other dealing surface treats them as marks: chapter decks and the
// KINETIC roll carry the pack in their never-dealt registries.
for (const a of ASSETS_KANA) {
  assert.ok(CHAPTER_UNDEALT.includes(a.id), `${a.id}: chapter-undealt`);
  assert.ok(NEVER_DEALT.includes(a.id), `${a.id}: roll-undealt`);
}
assert.ok(!chapterAssets('swiss').some((id) => KANA_STAMP_IDS.has(id)), 'the swiss chapter deck holds no kana');
assert.ok(!chapterAssets('now').some((id) => KANA_STAMP_IDS.has(id)), 'the Now chapter deck holds no kana');
assert.ok(!dealableRecords(ASSETS).some((r) => KANA_STAMP_IDS.has(r.id)), 'a KINETIC roll never deals kana');
assert.ok(recs.some((r) => r.id === 'typ_A'), 'the Latin letter stamps keep their existing panel treatment');
assert.strictEqual(categoryCounts(recs).all, 313, "the pool's headline count is unchanged");

console.log('fieldKana.selfcheck: all assertions passed');
