// node src/curator/typeExclusivity.selfcheck.mjs
// #2150 — type is never a solo asset: glyphs leave the general pool, type
// routes only through the poem system (Matt's ruling, 2026-11-12).
//
// The property this suite pins, over every deal surface: NO dealt, pooled,
// chaptered, wardrobed, costume or WetLab-legal asset id is a glyph id —
// while the glyphs stay in the catalogue (history resolves them), FIELD
// keeps its full supply (it imports its packs directly), and the assets
// Matt's classification rulings KEPT stay dealable.
//
// The glyph set (47): the typ_* caps/digits pack (36, now poem-only via
// placement's union), the solo text stamps (3 — a bare letter/number with
// no drawn body), and the pixel letter-anatomy emblems (8, Q4).
// The kept set: bare symbols (Q1), badged letters/numbers (Q2), word
// labels (Q3) — graphics and symbol marks, not type.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSETS } from '../data/assets/index.js';
import { ASSETS_PART3 } from '../data/assets/assets-stamp-radial.js';
import {
  TEXT_STAMP_LETTER_IDS,
  TEXT_STAMP_NUMBER_IDS,
  TEXT_STAMP_SYMBOL_IDS,
  TEXT_STAMP_LABEL_IDS,
  SOLO_TEXT_STAMP_IDS,
} from '../data/assets/assets-stamp-radial.js';
import { ASSETS_PIXEL, PIXEL_LETTER_ANATOMY_IDS } from '../data/assets/assets-pixel-glyphs.js';
import { LETTER_STAMP_IDS, POEM_ONLY_STAMP_IDS, stampIdForChar } from '../poets/placement.js';
import { NEVER_DEALT, dealableRecords, dealMixedPool, dealPoolFor } from '../state/rollPool.mjs';
import { CHAPTERS, CHAPTER_UNDEALT, chapterAssets } from '../data/chapters.js';
import { dealCast } from './dice.js';
import { poolDescriptors } from '../panels/assetPoolLogic.mjs';
import { SHAPE_SETS } from '../data/voices.js';
import { VOICE_DECK } from '../data/voiceDeck.js';
import { mkRng } from '../engine/prng.js';

const GLYPH_IDS = new Set([...LETTER_STAMP_IDS, ...SOLO_TEXT_STAMP_IDS, ...PIXEL_LETTER_ANATOMY_IDS]);
const KEPT_IDS = [
  ...TEXT_STAMP_SYMBOL_IDS,
  'stamp_letter_01',
  'stamp_letter_03',
  'stamp_num_01',
  'stamp_num_02',
  'stamp_num_03',
  ...TEXT_STAMP_LABEL_IDS,
];
const byId = new Map(ASSETS.map((a) => [a.id, a]));
const noGlyphs = (ids, where) =>
  assert.ok(
    !ids.some((id) => GLYPH_IDS.has(id)),
    `${where}: no glyph id (found ${ids.find((id) => GLYPH_IDS.has(id))})`,
  );

// ── The sets themselves ───────────────────────────────────────────────────
assert.strictEqual(
  GLYPH_IDS.size,
  47,
  'the glyph set is 36 typ_* + 3 solo text stamps + 8 pixel letter-anatomy emblems',
);
for (const id of GLYPH_IDS)
  assert.ok(byId.has(id), `${id}: still a catalogue member (the atlas, census and history resolve it)`);
for (const id of KEPT_IDS) assert.ok(!GLYPH_IDS.has(id), `${id}: kept by ruling, not a glyph`);

// The text-stamp family: the four named sub-lists partition exactly the
// <text>-rendered stamps of PART3 — no more, no fewer.
const textRendered = ASSETS_PART3.filter((a) => a.svg.includes('<text')).map((a) => a.id);
const namedText = [
  ...TEXT_STAMP_LETTER_IDS,
  ...TEXT_STAMP_NUMBER_IDS,
  ...TEXT_STAMP_SYMBOL_IDS,
  ...TEXT_STAMP_LABEL_IDS,
];
assert.strictEqual(new Set(namedText).size, 17, 'the four text-stamp sub-lists are disjoint');
assert.deepStrictEqual(
  new Set(namedText),
  new Set(textRendered),
  'the sub-lists name exactly the 17 <text>-rendered stamps',
);
// A solo text stamp is mechanically a bare character: its svg IS a <text>
// element, with no drawn body before it. The badged stamps draw theirs first.
for (const id of SOLO_TEXT_STAMP_IDS) {
  assert.ok(byId.get(id).svg.startsWith('<text'), `${id}: a bare character, no drawn body — a glyph under the ruling`);
}
for (const id of ['stamp_letter_01', 'stamp_letter_03', 'stamp_num_01', 'stamp_num_02', 'stamp_num_03']) {
  assert.ok(!byId.get(id).svg.startsWith('<text'), `${id}: draws its badge before the character — a graphic (Q2)`);
}
// The pixel anatomy set is exactly the pack's letter-tagged records.
assert.deepStrictEqual(
  new Set(PIXEL_LETTER_ANATOMY_IDS),
  new Set(ASSETS_PIXEL.filter((a) => a.tags.includes('letter')).map((a) => a.id)),
  'the anatomy set is exactly the letter-tagged pixel emblems (Q4)',
);
assert.strictEqual(PIXEL_LETTER_ANATOMY_IDS.length, 8, 'eight letter-anatomy emblems leave; the other pxg_* stay');

// ── FIELD is not starved ──────────────────────────────────────────────────
// The caps/digits joined the poem-only union; the poem's resolver is intact.
for (const id of LETTER_STAMP_IDS) assert.ok(POEM_ONLY_STAMP_IDS.has(id), `${id}: poem-only now`);
assert.strictEqual(POEM_ONLY_STAMP_IDS.size, 648 + 36, 'the union grew by exactly the letter pack');
assert.strictEqual(stampIdForChar('A'), 'typ_A', 'FIELD still resolves its base face');
assert.strictEqual(stampIdForChar('7'), 'typ_7', 'FIELD still resolves its digits');

// ── The dealing lists carry the set ───────────────────────────────────────
for (const id of GLYPH_IDS) {
  assert.ok(NEVER_DEALT.includes(id), `${id}: never dealt by a roll`);
  assert.ok(CHAPTER_UNDEALT.includes(id), `${id}: never dealt into a chapter deck`);
}

// ── Containment on every surface ──────────────────────────────────────────
const dealable = dealableRecords(ASSETS);
noGlyphs(
  dealable.map((r) => r.id),
  'the KINETIC dealable pool',
);
for (const id of KEPT_IDS)
  assert.ok(
    dealable.some((r) => r.id === id),
    `${id}: still dealable (kept by ruling)`,
  );
assert.ok(
  dealable.some((r) => r.id === 'pxg_cross'),
  'a non-letter pixel emblem is still dealable',
);

for (const c of CHAPTERS) noGlyphs(chapterAssets(c.id), `the ${c.id} chapter deck`);
// Q6 — the Swiss chapter CARD keeps its letters: a menu visual, not a deck.
assert.deepStrictEqual(
  CHAPTERS.find((c) => c.id === 'swiss').card.marks,
  ['typ_A', 'typ_B', 'typ_C'],
  'the Swiss card is a menu and keeps its letters (Q6)',
);

noGlyphs(
  poolDescriptors(ASSETS).map((r) => r.id),
  'the pool panel records',
);

for (const set of SHAPE_SETS) noGlyphs(set.ids, `the ${set.id} shape set (Look/Voice costume)`);
const abacus = SHAPE_SETS.find((s) => s.id === 'abacus');
assert.ok(abacus.ids.includes('stamp_glyph_01'), 'abacus keeps its symbol mark (Q1)');
assert.ok(abacus.ids.includes('stamp_num_01'), 'abacus keeps its badged number (Q2)');

for (const v of VOICE_DECK) {
  const worn = Object.keys(v.def.assets).filter((id) => v.def.assets[id]);
  noGlyphs(worn, `${v.id}: the family wardrobe`);
}

// WetLab legal bodies: the filter lives inline in the panel (a JSX prop), so
// pin its shape — it must exclude the glyph set it builds from the three
// sources. (The assembler stays a faithful executor for banked creatures.)
{
  const wet = readFileSync(new URL('../panels/WetLab.jsx', import.meta.url), 'utf8');
  assert.ok(wet.includes('!GLYPH_BODY_IDS.has(a.id)'), 'WetLab legalBodies excludes the glyph set');
  for (const src of ['ASSETS_LETTERS', 'SOLO_TEXT_STAMP_IDS', 'PIXEL_LETTER_ANATOMY_IDS']) {
    assert.ok(wet.includes(src), `WetLab's glyph exclusion is built from ${src}`);
  }
}

// ── Multi-seed deals: no glyph in any dealt cast or pool ──────────────────
for (let seed = 1; seed <= 25; seed++) {
  const rng = mkRng(seed * 2150);
  for (let i = 0; i < 200; i++) {
    noGlyphs(
      dealCast(ASSETS, 5, rng, 0.5, []).map((a) => a.id),
      `dice cast (seed ${seed})`,
    );
  }
  const rng2 = mkRng(seed * 47);
  for (let i = 0; i < 200; i++) {
    noGlyphs(dealMixedPool(dealable, rng2).ids, `KINETIC mixed pool (seed ${seed})`);
    noGlyphs(dealPoolFor(dealable, rng2, {}).ids, `KINETIC look pool (seed ${seed})`);
  }
}

console.log('typeExclusivity.selfcheck: ok');
