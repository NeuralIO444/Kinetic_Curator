// node src/data/chapters.selfcheck.mjs
// #1853 (BOOK S1): the chapter registry derives every chapter's deck from the existing groups/styles/families,
// the spine round-trips Marks → Now, the union of chapters covers the dealable library with the creature
// citizen undealt, chapter cards point at real palettes and real members, and a thin chapter (Marks) reports
// itself instead of borrowing. The registry reads no palette `era` string and imports no palettes module.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ASSETS } from './assets/index.js';
import { PALETTES } from './palettes.js';
import { COMPOSITION_PRESETS } from './presets.js';
import { NEVER_DEALT } from '../state/rollPool.mjs';
import {
  CHAPTERS,
  CHAPTER_UNDEALT,
  CHAPTER_DECK_MINIMUM,
  chapterById,
  nextChapter,
  prevChapter,
  chapterForLookGroup,
  chapterForStyle,
  chapterLooks,
  chapterVoices,
  chapterAssets,
  chapterDeck,
  deckReport,
  dealableAssetRecords,
} from './chapters.js';

// 1. the spine is D1's order, positions contiguous, neighbours attached from the order
assert.deepEqual(
  CHAPTERS.map((c) => c.id),
  ['marks', 'engraving', 'bauhaus', 'swiss', 'op-art', 'japan', 'memphis', 'grunge', 'now'],
  'the spine is the ruled order (D1: the book opens at Marks)',
);
CHAPTERS.forEach((c, i) => {
  assert.equal(c.position, i, `${c.id}: position ${i}`);
  assert.equal(c.prev, i > 0 ? CHAPTERS[i - 1].id : null, `${c.id}: prev neighbour`);
  assert.equal(c.next, i < CHAPTERS.length - 1 ? CHAPTERS[i + 1].id : null, `${c.id}: next neighbour`);
});

// 2. neighbour order round-trips: walking next from Marks reaches Now through every chapter exactly once,
//    walking prev from Now returns to Marks; the ends are null, never a cycle
{
  const fwd = [];
  for (let c = chapterById('marks'); c; c = nextChapter(c.id)) fwd.push(c.id);
  assert.deepEqual(
    fwd,
    CHAPTERS.map((c) => c.id),
    'forward walk visits the whole spine in order',
  );
  const back = [];
  for (let c = chapterById('now'); c; c = prevChapter(c.id)) back.push(c.id);
  assert.deepEqual(back, [...CHAPTERS.map((c) => c.id)].reverse(), 'backward walk mirrors the spine');
  assert.equal(nextChapter('now'), null, 'nothing past Now');
  assert.equal(prevChapter('marks'), null, 'nothing before Marks');
  assert.equal(chapterById('nope'), null, 'unknown id reads null');
}

// 3. deck counts per chapter (pinned — the derivation over today's library)
const EXPECTED_COUNTS = {
  // #1854 landed the Marks pool: 5 authored looks + 18 authored assets; voices 0 by that issue's scope.
  marks: { looks: 5, voices: 0, assets: 18 },
  engraving: { looks: 4, voices: 11, assets: 20 },
  bauhaus: { looks: 4, voices: 8, assets: 16 },
  swiss: { looks: 5, voices: 11, assets: 61 },
  'op-art': { looks: 4, voices: 11, assets: 14 },
  japan: { looks: 5, voices: 11, assets: 25 },
  memphis: { looks: 4, voices: 14, assets: 25 },
  grunge: { looks: 5, voices: 8, assets: 39 },
  now: { looks: 69, voices: 64, assets: 312 }, // #1854: Now sums the grown library (64+5 looks, 294+18 assets)
};
for (const c of CHAPTERS) {
  const d = chapterDeck(c);
  assert.deepEqual(
    { looks: d.looks.length, voices: d.voices.length, assets: d.assets.length },
    EXPECTED_COUNTS[c.id],
    `${c.id}: deck counts`,
  );
  assert.equal(new Set(d.assets).size, d.assets.length, `${c.id}: no asset dealt twice inside a deck`);
}

// 4. coverage: the union of all chapters is exactly the dealable library (294) — the creature citizen is in
//    no chapter's deck, and Now alone is the full library of looks, voices and assets
{
  const union = new Set();
  for (const c of CHAPTERS) for (const id of chapterAssets(c)) union.add(id);
  const dealable = dealableAssetRecords();
  assert.equal(dealable.length, 312, 'the dealable library is 312 (313 in the library − the citizen; #1854 added 18)');
  assert.equal(union.size, 312, 'the chapters together cover the dealable library');
  for (const r of dealable) assert.ok(union.has(r.id), `${r.id}: covered by some chapter`);
  for (const id of NEVER_DEALT) assert.ok(!union.has(id), `${id}: never in a chapter deck`);
  assert.deepEqual(CHAPTER_UNDEALT, NEVER_DEALT, 'the registry exclusion is the roll pool exclusion');
  assert.equal(chapterLooks('now').length, COMPOSITION_PRESETS.length, 'Now holds every look');
  assert.equal(chapterVoices('now').length, 64, 'Now holds every voice');
}

// 5. the taxonomy in code is the taxonomy: DIAGONAL GRID is a swiss look, not a bauhaus one
assert.ok(
  chapterLooks('swiss').some((l) => l.id === 'diagonal-grid'),
  'DIAGONAL GRID reads in Swiss',
);
assert.ok(!chapterLooks('bauhaus').some((l) => l.id === 'diagonal-grid'), 'DIAGONAL GRID is not in Bauhaus');
assert.equal(chapterForLookGroup('swiss')?.id, 'swiss', 'the swiss group maps to the Swiss chapter');
assert.equal(chapterForLookGroup('engraved')?.id, 'engraving', 'the engraved group maps to Engraving');
assert.equal(chapterForStyle('engraved')?.id, 'engraving', 'the engraved style maps to Engraving');
assert.equal(chapterForStyle('op')?.id, 'op-art', 'the op style maps to Op Art');
assert.equal(chapterForStyle('techno'), null, 'techno has no movement chapter — it is Now material');

// 6. deck discipline: the minimums are the library's own floor (each axis is met by every movement chapter,
//    and some movement chapter sits exactly on each axis minimum — the constants are observed, not padded);
//    Marks meets looks + assets after #1854 and still reports short on voices (that issue's scope cap);
//    every other chapter reports ok
assert.deepEqual(CHAPTER_DECK_MINIMUM, { looks: 4, voices: 8, assets: 14 }, 'the deck floor');
{
  const report = deckReport();
  const movements = report.filter((r) => r.id !== 'marks' && r.id !== 'now');
  for (const axis of ['looks', 'voices', 'assets']) {
    assert.ok(
      movements.some((r) => r.counts[axis] === CHAPTER_DECK_MINIMUM[axis]),
      `${axis}: a movement chapter sits exactly on the floor (the minimum is derived, not invented)`,
    );
  }
  for (const r of report) {
    if (r.id === 'marks') {
      // #1854: looks + assets landed and meet the floor. Voices stay short BY THAT ISSUE'S SCOPE — it caps
      // voice work at a minimal pairing and defers the dedicated Marks voice deck to a later call — so the
      // report keeps naming the gap instead of the chapter borrowing a neighbour's voices to clear it.
      assert.equal(r.ok, false, 'Marks still reports itself — voices unbuilt by scope (#1854)');
      assert.deepEqual(r.shortfalls, ['voices'], 'Marks is short on voices only, by name');
    } else {
      assert.equal(r.ok, true, `${r.id}: deck meets the floor on every axis`);
      assert.deepEqual(r.shortfalls, [], `${r.id}: no shortfalls`);
    }
  }
}

// 7. chapter cards: a real palette, paired by one of the chapter's own looks, and representative marks that
//    are members of the chapter's own deck. Marks' card is filled by #1854 and passes the same checks.
{
  const paletteIds = new Set(PALETTES.map((p) => p.id));
  for (const c of CHAPTERS) {
    assert.ok(paletteIds.has(c.card.paletteId), `${c.id}: card palette ${c.card.paletteId} exists`);
    if (c.id !== 'now') {
      assert.ok(
        chapterLooks(c).some((l) => l.paletteId === c.card.paletteId),
        `${c.id}: card palette is paired by one of the chapter's own looks`,
      );
    }
    assert.ok(c.card.marks.length >= 3, `${c.id}: the card names at least three marks`);
    const pool = new Set(chapterAssets(c));
    for (const id of c.card.marks) assert.ok(pool.has(id), `${c.id}: card mark ${id} is a member of the chapter`);
  }
}

// 8. derivation is pure: same library in, same deck out (no RNG, no state) — the replay law's precondition
assert.deepEqual(chapterDeck('swiss'), chapterDeck('swiss'), 'decks are a pure function of the library');
assert.deepEqual(
  chapterDeck('japan', { looks: [], deck: undefined, records: [] }).looks,
  [],
  'injected data is honoured',
);

// 9. hygiene: the registry never reads the palette `era` flavour and never imports the palettes module;
//    it also stands clear of the one-writer live files
{
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'chapters.js'), 'utf8');
  assert.ok(!/\.era\b/.test(src), 'the registry never reads a palette era string');
  assert.ok(!/from '\.\/palettes\.js'/.test(src), 'the registry does not import palettes.js');
  assert.ok(!/liveLoop|liveResolve|particles/.test(src), 'the registry stands clear of the one-writer files');
  assert.equal(
    ASSETS.length,
    313,
    'the library is 313: the 295 S1 found + #1854’s 18 authored marks (no existing record edited)',
  );
}

console.log('chapters.selfcheck: OK');
