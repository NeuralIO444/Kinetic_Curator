// loisGrudge.selfcheck.mjs — #1858 (BOOK S5): LOIS's grudge — the tally.
// Cuts tallied by the killed look's genre (the chapter funnel's own
// vocabulary), the permaban derived from the tally, the overrule reset,
// and the decay machinery — built and proven, with its standing half-life
// null because D6 is UNRULED: the live tally applies no decay.
//
// Run: node src/curator/loisGrudge.selfcheck.mjs
import assert from 'node:assert/strict';
import { CHAPTERS, chapterLooks } from '../data/chapters.js';
import {
  GRUDGE_PERMABAN_MIN_CUTS,
  GRUDGE_PERMABAN_SHARE,
  GRUDGE_DECAY_HALF_LIFE_MS,
  genreOfLook,
  decayedWeight,
  createGrudgeTally,
  loisGrudge,
  grudgeSummary,
} from './loisGrudge.mjs';

// ── Find the test material in the real book (never invented ids): a look
// carrying an honest genre, a look at chapter grain, and a second tally
// key distinct from the first.
let genred = null; // { chapterId, lookId, genre }
let grained = null; // { chapterId, lookId } with genre null
for (const c of CHAPTERS) {
  for (const look of chapterLooks(c.id)) {
    const g = genreOfLook(c.id, look.id);
    if (g && !genred) genred = { chapterId: c.id, lookId: look.id, genre: g };
    if (!g && !grained) grained = { chapterId: c.id, lookId: look.id };
  }
}
assert.ok(genred, 'the book has at least one look carrying a narrowing genre (the S4 funnel)');
assert.ok(grained, 'the book has at least one look at chapter grain (no narrowing keyword)');
assert.equal(genreOfLook(grained.chapterId, grained.lookId), null, 'chapter grain reads as genre null');
assert.equal(genreOfLook('atlantis', genred.lookId), null, 'an unknown chapter has no genre');
assert.equal(genreOfLook(genred.chapterId, 'no-such-look'), null, 'a foreign look has no genre');
const other =
  genred.chapterId === grained.chapterId && genred.lookId === grained.lookId ? null : grained;
assert.ok(other, 'a second tally key exists in the book');

// ── The tally: bogus cuts record nothing; real cuts land by genre.
{
  let t = 1_000_000;
  const tally = createGrudgeTally({ now: () => t });
  assert.equal(tally.noteCut({ chapterId: 'atlantis', lookId: genred.lookId }), null);
  assert.equal(tally.noteCut({ chapterId: genred.chapterId, lookId: 'no-such-look' }), null);
  assert.equal(tally.noteCut({}), null);
  assert.equal(tally.snapshot().totalCuts, 0, 'nothing is tallied on air');

  assert.deepEqual(tally.noteCut(genred), { chapterId: genred.chapterId, genre: genred.genre });
  assert.deepEqual(tally.noteCut(grained), { chapterId: grained.chapterId, genre: null });
  const snap = tally.snapshot();
  assert.equal(snap.totalCuts, 2);
  assert.equal(snap.rows.find((r) => r.genre === genred.genre).cuts, 1, 'the cut lands under its genre');
  assert.equal(snap.rows.find((r) => r.genre === null).cuts, 1, 'the grain cut lands under its chapter');
  assert.equal(snap.permabans.length, 0, 'two cuts ban nothing');
}

// ── The permaban: both thresholds must hold — a floor of cuts AND a
// majority share of everything he has cut (effective, post-reset).
{
  let t = 2_000_000;
  const tally = createGrudgeTally({ now: () => t });
  for (let i = 0; i < GRUDGE_PERMABAN_MIN_CUTS - 1; i++) tally.noteCut(genred);
  assert.equal(tally.snapshot().permabans.length, 0, 'below the cut floor there is no ban');
  tally.noteCut(genred);
  tally.noteCut(other);
  const snap = tally.snapshot();
  assert.equal(snap.permabans.length, 1, 'floor + majority share = the permaban');
  assert.equal(snap.permabans[0].genre, genred.genre);
  assert.ok(GRUDGE_PERMABAN_SHARE > 0 && GRUDGE_PERMABAN_SHARE <= 1, 'the share threshold is a share');

  const diluted = createGrudgeTally({ now: () => t });
  for (let i = 0; i < GRUDGE_PERMABAN_MIN_CUTS; i++) diluted.noteCut(genred);
  for (let i = 0; i < GRUDGE_PERMABAN_MIN_CUTS + 1; i++) diluted.noteCut(other);
  const dilutedRow = diluted.snapshot().rows.find((r) => r.genre === genred.genre);
  assert.equal(
    dilutedRow.permaban,
    false,
    'at the floor but under the share, that genre is not banned — he cuts widely, not pointedly (the concentrated other key earns its own ban instead, which is the same law working)',
  );
}

// ── The overrule: a keep in the banned genre resets that genre entirely —
// effective cuts restart at zero, the record itself is never rewritten.
{
  let t = 3_000_000;
  const tally = createGrudgeTally({ now: () => t });
  for (let i = 0; i < GRUDGE_PERMABAN_MIN_CUTS; i++) tally.noteCut(genred);
  tally.noteCut(other);
  assert.equal(tally.snapshot().permabans.length, 1, 'the ban stands before the keep');
  assert.equal(tally.noteKeep(other), null, 'a keep outside the banned genre overrules nothing');
  assert.deepEqual(tally.noteKeep(genred), { chapterId: genred.chapterId, genre: genred.genre });
  const snap = tally.snapshot();
  const row = snap.rows.find((r) => r.genre === genred.genre);
  assert.equal(row.cuts, GRUDGE_PERMABAN_MIN_CUTS, 'the record keeps every cut — history is not rewritten');
  assert.equal(row.effective, 0, 'effective cuts restart at zero after the reset');
  assert.equal(row.resets, 1, 'the reset itself is on the record');
  assert.equal(snap.permabans.length, 0, 'the ban falls with the overrule');
  assert.equal(tally.noteKeep(genred), null, 'a second keep has nothing left to overrule');
  // And the grudge can be earned again from zero.
  t += 1;
  for (let i = 0; i < GRUDGE_PERMABAN_MIN_CUTS; i++) tally.noteCut(genred);
  assert.equal(tally.snapshot().permabans.length, 1, 'the ban can be re-earned after a reset');
}

// ── Decay: the machinery is real; the standing law applies none of it.
{
  assert.equal(GRUDGE_DECAY_HALF_LIFE_MS, null, 'D6 unruled: the standing half-life is null (no decay)');
  const HL = 86_400_000; // one day, a test value — NOT the ruling
  assert.equal(decayedWeight([0, 0, 0, 0], HL, HL), 2, 'one half-life halves the weight');
  assert.equal(decayedWeight([0, 0], HL * 10, null), 2, 'no half-life, no decay');

  let t = 4_000_000;
  const tally = createGrudgeTally({ now: () => t });
  const cutAt = t;
  for (let i = 0; i < GRUDGE_PERMABAN_MIN_CUTS; i++) tally.noteCut(genred);
  const fresh = tally.snapshot({ at: cutAt, halfLifeMs: HL });
  assert.equal(fresh.permabans.length, 1, 'fresh cuts at the floor ban');
  const aged = tally.snapshot({ at: cutAt + HL, halfLifeMs: HL });
  assert.ok(Math.abs(aged.rows[0].weight - GRUDGE_PERMABAN_MIN_CUTS / 2) < 1e-9, 'aged one half-life, the weight halves');
  assert.equal(aged.permabans.length, 0, 'aged past the floor, the ban softens away — when a half-life is ruled');
  const standing = tally.snapshot({ at: cutAt + HL * 365 });
  assert.equal(standing.rows[0].weight, GRUDGE_PERMABAN_MIN_CUTS, 'the standing snapshot never ages a cut (D6 unruled)');
  assert.equal(standing.permabans.length, 1, 'under the standing law the ban does not soften');
}

// ── The readout: character, or the honest absence of one.
{
  assert.match(grudgeSummary(loisGrudge.snapshot({ at: 0 })), /none/, 'an untouched tally reads as none');
  let t = 5_000_000;
  const tally = createGrudgeTally({ now: () => t });
  tally.noteCut(genred);
  assert.match(grudgeSummary(tally.snapshot()), /no permaban/, 'cuts without a ban say so');
  for (let i = 0; i < GRUDGE_PERMABAN_MIN_CUTS; i++) tally.noteCut(genred);
  const line = grudgeSummary(tally.snapshot());
  assert.match(line, /permaban/, 'the ban is named in the readout');
  assert.ok(line.includes(genred.genre), 'the readout names the banned genre');
}

console.log('loisGrudge.selfcheck: ok (#1858 — cuts tallied by genre, permaban derived, overrule resets, decay built but unruled-off)');
