// fieldKanji.selfcheck.mjs — FIELD stamps slice 2 (#1998): the curated kanji set, poem-only.
//
// Pins the slice's whole contract, on the fieldKana pattern:
//  - the pack: 126 baked stamps — the CURATED list below (125 kanji) plus
//    the iteration mark 々 the deck's writing needs, no more, no fewer
//    (kanji is curated-only, never full jōyō) — path data only, every glyph
//    rasterizing with real ink under the bake's pinned font, with NO system
//    fonts (the #1970 CI condition).
//  - the curation: every kanji Teijo's nativeLines use is in the pack, and
//    every stamp in the pack is in the curated list — the gate runs both
//    directions, so the pack can neither miss a deck character nor grow an
//    uncurated one without a red suite.
//  - the face: the native script is ONE face (kana ∪ kanji). A native deal
//    serves the piece's nativeLines — real orthography, mixed — into a form
//    that round-trips the document door; the gate and the door refuse a
//    Latin stamp inside a native form, a native stamp outside one, and a
//    native form under another poet.
//  - poem-only: the catalogue carries the pack, the authored bake does not,
//    the panel's records stay 313, chapter decks and KINETIC rolls carry
//    the pack in their never-dealt registries, and the dice chokepoint's
//    seeded stream is untouched by the pack's presence.
import assert from 'node:assert';
import { Resvg } from '@resvg/resvg-js';
import { ASSETS, ASSETS_AUTHORED } from '../data/assets/index.js';
import { ASSETS_KANJI } from '../data/assets/assets-kanji.js';
import { RESVG_FONT } from '../assets/resvgFont.mjs';
import {
  stampIdForChar,
  kanjiStampIdForChar,
  nativeStampIdForChar,
  stampIdForGlyph,
  lineMapsToStamps,
  glyphWidthEm,
  KANJI_STAMP_IDS,
  NATIVE_STAMP_IDS,
} from './placement.js';
import { fieldDealReport, sanitizeFieldForm, gateFieldForm, FIELD_POEM_MIN_STAMPS } from './fieldForm.js';
import { TEIJO } from './teijo.js';
import { poolDescriptors, categoryCounts } from '../panels/assetPoolLogic.mjs';
import { CHAPTER_UNDEALT, chapterAssets } from '../data/chapters.js';
import { NEVER_DEALT, dealableRecords } from '../state/rollPool.mjs';
import { dealCast } from '../curator/dice.js';
import { mkRng } from '../engine/prng.js';

// ── The curated list (mirrors scripts/gen-kanji.mjs — the two must agree) ──
// Deck kanji first (Teijo's nativeLines), then the decks' season / nature /
// quiet vocabulary. 125 characters.
const CURATED =
  '夏蝶待続手放清泉水紅唇忘牡丹花終日眺長秋光小道上止' +
  '空天雲月星虹雨雪霜氷露霧霞風嵐晴雷朝夜夕昼' +
  '川山海森林石岩砂土田野原丘島波浜里橋' +
  '草木竹梅桜松柳藤菊蓮苔種実枝根葉' +
  '鳥魚虫鶴蛍' +
  '心声歌詩字書墨筆紙夢影闇涙恋愛思知見聞' +
  '時年昔今明' +
  '静寂眠休窓門舟灯香色音命春冬火金';
const CURATED_SET = new Set([...CURATED]);

// ── The pack ─────────────────────────────────────────────────────────────
assert.strictEqual([...CURATED].length, 125, 'the curated list is 125 characters');
assert.strictEqual(CURATED_SET.size, 125, 'the curated list has no duplicates');
assert.strictEqual(ASSETS_KANJI.length, 126, 'the kanji pack is 125 curated kanji + the iteration mark');
assert.strictEqual(new Set(ASSETS_KANJI.map((a) => a.id)).size, 126, 'ids unique');
assert.strictEqual(new Set(ASSETS_KANJI.map((a) => a.glyph)).size, 126, 'glyphs unique');
for (const a of ASSETS_KANJI) {
  assert.ok(a.svg.startsWith('<path d="') && !a.svg.includes('<text'), `${a.id}: path data only, never <text>`);
  assert.strictEqual(kanjiStampIdForChar(a.glyph), a.id, `${a.id}: glyph <-> id bijection`);
  assert.ok(CURATED_SET.has(a.glyph) || a.glyph === '々', `${a.id}: the stamp's glyph is curated (or the mark)`);
  assert.ok(a.tags.includes('kanji'), `${a.id}: tagged kanji`);
}
for (const ch of CURATED_SET) {
  assert.ok(kanjiStampIdForChar(ch), `${ch}: every curated character has a stamp`);
}
assert.strictEqual(kanjiStampIdForChar('々'), 'typ_j_noma', 'the iteration mark is in, on the ー precedent');
for (const id of ['typ_j_natsu', 'typ_j_beni', 'typ_j_sakura', 'typ_j_hotaru', 'typ_j_shi', 'typ_j_yuki']) {
  assert.ok(KANJI_STAMP_IDS.has(id), `${id} exists`);
}

// ── Ink under the pinned font, no system fonts (the #1970 condition) ────
for (const a of ASSETS_KANJI) {
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
assert.strictEqual(stampIdForGlyph('夏'), 'typ_j_natsu');
assert.strictEqual(stampIdForGlyph('桜'), 'typ_j_sakura');
assert.strictEqual(nativeStampIdForChar('夏'), 'typ_j_natsu', 'the native resolver reaches kanji');
assert.strictEqual(nativeStampIdForChar('あ'), 'typ_h_a', 'the native resolver still reaches kana');
assert.strictEqual(stampIdForChar('夏'), null, 'the Latin resolver still refuses kanji');
assert.strictEqual(stampIdForGlyph('鬱'), null, 'an uncurated kanji has no stamp — curated-only, never jōyō');
assert.ok(!lineMapsToStamps('東京'), 'a line in uncurated kanji does not map');
assert.ok(lineMapsToStamps('夏の蝶'), 'a native line maps to stamps');
assert.ok(glyphWidthEm('夏') > 0.5 && glyphWidthEm('夏') < 1.3, 'kanji width measured, full-width class');
assert.ok(glyphWidthEm('A') > 0 && glyphWidthEm('あ') > 0, 'Latin and kana metrics intact');

// ── The deck: native lines in real orthography ───────────────────────────
const deckKanji = new Set();
for (const piece of TEIJO) {
  assert.ok(
    Array.isArray(piece.nativeLines) && piece.nativeLines.length === piece.lines.length,
    `${piece.id}: native face for every line`,
  );
  for (const line of piece.nativeLines) {
    assert.ok(lineMapsToStamps(line), `${piece.id}: "${line}" maps to native stamps`);
    for (const ch of line) if (kanjiStampIdForChar(ch)) deckKanji.add(ch);
  }
  const glyphs = piece.nativeLines.join('').length;
  assert.ok(glyphs >= FIELD_POEM_MIN_STAMPS, `${piece.id}: the native face clears the poem threshold (${glyphs} glyphs)`);
  assert.ok([...piece.nativeLines.join('')].some((ch) => kanjiStampIdForChar(ch)), `${piece.id}: the native face uses kanji`);
}
deckKanji.delete('々'); // the iteration mark rides along (長き日々) — it is not one of the curated kanji
assert.strictEqual(deckKanji.size, 25, "the deck's native lines use exactly the 25 deck kanji the pack was curated from");
for (const ch of [...CURATED].slice(0, 25)) {
  assert.ok(deckKanji.has(ch), `${ch}: every deck-group kanji in the curated list is used by the native lines`);
}

// ── The deal: the native face lands mixed ────────────────────────────────
for (const piece of TEIJO) {
  const deal = fieldDealReport({ poetId: 'teijo', pieceId: piece.id, script: 'kana' }, mkRng(7));
  assert.ok(deal.form, `${piece.id}: a native Teijo deal spawns a form`);
  assert.strictEqual(deal.gate, null, `${piece.id}: a native deal is not a gate refusal`);
  assert.strictEqual(deal.form.script, 'kana', `${piece.id}: the form declares the native face`);
  assert.ok(
    deal.form.stamps.every((s) => NATIVE_STAMP_IDS.has(s.assetId) && nativeStampIdForChar(s.ch) === s.assetId),
    `${piece.id}: every stamp of the native form is a native stamp for its glyph`,
  );
  assert.ok(
    deal.form.stamps.some((s) => KANJI_STAMP_IDS.has(s.assetId)),
    `${piece.id}: the native form carries kanji stamps`,
  );
  assert.deepStrictEqual(sanitizeFieldForm(deal.form), deal.form, `${piece.id}: the native form round-trips the door`);
  const latin = fieldDealReport({ poetId: 'teijo', pieceId: piece.id }, mkRng(7));
  assert.ok(latin.form && !('script' in latin.form), `${piece.id}: without the script call the same piece deals Latin`);
  assert.ok(
    latin.form.stamps.every((s) => !NATIVE_STAMP_IDS.has(s.assetId)),
    `${piece.id}: a Latin deal carries no native stamps`,
  );
}

// ── The gate's context law, kanji included ───────────────────────────────
const t1 = fieldDealReport({ poetId: 'teijo', pieceId: 't1', script: 'kana' }, mkRng(42)).form;
assert.strictEqual(
  gateFieldForm(t1.stamps, { aspect: t1.aspect }).ok,
  false,
  'native stamps (kanji included) are refused without the affirmed native context',
);
assert.strictEqual(gateFieldForm(t1.stamps, { aspect: t1.aspect }).reason, 'charset', 'the refusal is the charset law');
assert.ok(gateFieldForm(t1.stamps, { aspect: t1.aspect, allowKana: true }).ok, 'the mixed form passes in context');
const kanjiIdx = t1.stamps.findIndex((s) => KANJI_STAMP_IDS.has(s.assetId));
const swapped = t1.stamps.map((s, j) => (j === kanjiIdx ? { ...s, ch: '冬' } : s));
assert.strictEqual(
  gateFieldForm(swapped, { aspect: t1.aspect, allowKana: true }).ok,
  false,
  'a kanji stamp whose glyph disagrees with its id is refused even in context',
);

// ── The document door's script law, kanji included ───────────────────────
assert.strictEqual(sanitizeFieldForm({ ...t1, poetId: 'greenleaf' }), null, 'a native form under another poet is refused');
assert.strictEqual(sanitizeFieldForm({ ...t1, script: undefined }), null, 'kanji stamps without the declared script are refused');
const latinStamp = fieldDealReport({ poetId: 'teijo', pieceId: 't1' }, mkRng(42)).form.stamps[0];
assert.strictEqual(
  sanitizeFieldForm({ ...t1, stamps: t1.stamps.map((s, j) => (j === 0 ? latinStamp : s)) }),
  null,
  'a Latin stamp inside a declared native form is refused',
);
assert.deepStrictEqual(
  sanitizeFieldForm({ ...t1, register: 'whisper' }),
  { ...t1, register: 'whisper' },
  'a whispered native form round-trips — script and register together (#1906 composes with #1998)',
);

// ── Poem-only: catalogue yes, authored bake no, panel no ─────────────────
assert.strictEqual(ASSETS_AUTHORED.length, 312, 'the authored bake is untouched');
assert.ok(!ASSETS_AUTHORED.some((a) => KANJI_STAMP_IDS.has(a.id)), 'no kanji in the authored set');
// #2002 RE-PIN (cause: slice 3): the Latin growth (43), the serif face (52)
// and the ornaments (4) join the catalogue on the same road — the sum grows
// by exactly the packs; the slice-3 suite owns their containment pins.
assert.strictEqual(
  ASSETS.length,
  312 + 1 + 163 + 126 + 43 + 52 + 4,
  'the catalogue is authored + citizen + kana + kanji + latin + serif + ornaments',
);
assert.ok(ASSETS_KANJI.every((a) => ASSETS.some((x) => x.id === a.id)), 'every kanji stamp resolves in the catalogue');
const recs = poolDescriptors(ASSETS);
assert.strictEqual(recs.length, 313, "the pool's records are exactly what they were before the pack");
assert.ok(!recs.some((r) => KANJI_STAMP_IDS.has(r.id)), 'no kanji record reaches the panel');
assert.strictEqual(categoryCounts(recs).all, 313, "the pool's headline count is unchanged");
for (const a of ASSETS_KANJI) {
  assert.ok(CHAPTER_UNDEALT.includes(a.id), `${a.id}: chapter-undealt`);
  assert.ok(NEVER_DEALT.includes(a.id), `${a.id}: roll-undealt`);
}
assert.ok(!chapterAssets('swiss').some((id) => KANJI_STAMP_IDS.has(id)), 'the swiss chapter deck holds no kanji');
assert.ok(!chapterAssets('now').some((id) => KANJI_STAMP_IDS.has(id)), 'the Now chapter deck holds no kanji');
assert.ok(!dealableRecords(ASSETS).some((r) => KANJI_STAMP_IDS.has(r.id)), 'a KINETIC roll never deals kanji');

// ── The dice chokepoint: the pack's presence moves nothing ───────────────
// dealCast filters the native packs at the cast chokepoint, before any draw,
// so a seeded census over the full catalogue must reproduce the census over
// the catalogue-without-native-packs pick for pick — and deal no native id.
const census = (pool, seed) => {
  const rng = mkRng(seed);
  const out = [];
  for (let i = 0; i < 600; i++) out.push(dealCast(pool, 5, rng, 0.5, []).map((a) => a.id).join(','));
  return out;
};
const visiblePool = ASSETS.filter((a) => !NATIVE_STAMP_IDS.has(a.id));
const withPack = census(ASSETS, 1998);
const withoutPack = census(visiblePool, 1998);
assert.deepStrictEqual(withPack, withoutPack, 'the 600-cast seeded census is identical with and without the pack present');
assert.ok(!withPack.some((cast) => cast.split(',').some((id) => NATIVE_STAMP_IDS.has(id))), 'no cast deals a native stamp');

console.log('fieldKanji.selfcheck: all assertions passed');
