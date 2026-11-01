// node src/state/chapterNarrow.selfcheck.mjs
// #1857 (BOOK S4) — the notch machine, proven at machine level (D3 is unruled, so nothing is
// wired: this suite proves the pools, the transitions, and the ledger schema the wiring pass
// will consume). Over EVERY chapter and EVERY look in it: a narrowing opens on the settled
// anchor, pools strictly shrink, no pool ever contains a foreign chapter's look (a single
// cross-chapter candidate fails the suite), widening restores the wider pool EXACTLY (the same
// frozen array), and a press at the floor is refused with the identical object. Depth is honest:
// anchors whose keywords all cover their chapter (specimen-drawer, weaving-workshop) do not
// narrow, and the suite pins that rather than letting the machine borrow depth.
import assert from 'node:assert/strict';
import {
  NOTCH_CHAPTER,
  NOTCH_GENRE,
  NOTCH_HAND,
  lookKeywords,
  genreTable,
  openNarrowing,
  narrowDepth,
  narrow,
  widen,
  poolFor,
  inPool,
  notchLabel,
  notchContextFor,
  isNotchContext,
  sanitizeNotchContext,
} from './chapterNarrow.mjs';
import { chapterScopeDeck, effectiveChapterScope } from './chapterWalk.mjs';
import { CHAPTERS, chapterLooks } from '../data/chapters.js';
import { ledgerRow, isLedgerRow, serializeRow, parseLedger } from '../curator/tasteLedger.js';

let checks = 0;
const ok = (cond, msg) => {
  checks++;
  assert.ok(cond, msg);
};
const eq = (a, b, msg) => {
  checks++;
  assert.deepStrictEqual(a, b, msg);
};

// ── 1. derivation pins — small chapters, read off the authored records ──────
{
  const s = openNarrowing('marks', 'tally-keeper');
  eq(s.genre, { keyword: 'linework', members: ['tally-keeper', 'dot-song', 'rain-marks'] }, 'tally-keeper narrows to linework');
  eq(s.hand, { keyword: 'stamps', members: ['tally-keeper'] }, 'the tally-keeper hand is the artist alone');
  eq(narrowDepth(s), 2, 'tally-keeper narrows twice');

  const fw = openNarrowing('marks', 'first-wall');
  eq(fw.genre, { keyword: 'stamps', members: ['first-wall', 'tally-keeper', 'hand-cave'] }, 'first-wall narrows to stamps');
  eq(fw.hand, { keyword: 'radial', members: ['first-wall', 'hand-cave'] }, 'the first-wall hand is the radial pair');
  eq(narrowDepth(fw), 2, 'first-wall narrows twice');

  const ds = openNarrowing('marks', 'dot-song');
  eq(ds.genre?.keyword, 'dots', 'dot-song narrows to dots');
  eq(ds.hand, null, 'dot-song has no hand — its remaining keywords all cover the genre');
  eq(narrowDepth(ds), 1, 'dot-song narrows once');

  const sd = openNarrowing('engraving', 'specimen-drawer');
  eq(sd.genre, null, 'specimen-drawer does not narrow — radial covers its whole chapter');
  eq(narrowDepth(sd), 0, 'specimen-drawer depth is honestly zero');
  ok(narrow(sd) === sd, 'a press at the floor returns the identical object');

  const kf = openNarrowing('engraving', 'kunstformen');
  eq(kf.genre, { keyword: 'linework', members: ['kunstformen', 'etched-colony', 'copperplate'] }, 'kunstformen narrows to linework');

  const ww = openNarrowing('bauhaus', 'weaving-workshop');
  eq(ww.genre, null, 'weaving-workshop does not narrow — the bridge look’s keywords are whole-chapter or singleton');
  const de = openNarrowing('bauhaus', 'dessau');
  eq(de.genre, { keyword: 'radial', members: ['dessau', 'point-line-plane'] }, 'dessau narrows to radial');

  const vg = openNarrowing('op-art', 'vega');
  eq(vg.genre, { keyword: 'dots', members: ['current', 'vega', 'checker-shift'] }, 'vega narrows to dots');
  eq(vg.hand, { keyword: 'radial', members: ['vega'] }, 'the vega hand is the artist alone');

  const km = openNarrowing('japan', 'kamon');
  eq(km.genre, { keyword: 'radial', members: ['kamon', 'seigaiha'] }, 'kamon narrows to radial');
  eq(km.hand, { keyword: 'floral', members: ['kamon'] }, 'the kamon hand is the artist alone');

  const ps = openNarrowing('now', 'praystation');
  eq(ps.genre?.keyword, 'organic', 'praystation narrows to its first keyword, organic');
  ok(ps.genre.members.length >= 2 && ps.genre.members.length < 69, 'the Now genre is a real subset');
  ok(ps.genre.members.includes('praystation'), 'the anchor is a member of its own genre');
  eq(narrowDepth(ps), 2, 'praystation narrows twice in the full library');

  const table = genreTable('marks');
  eq(
    table.map((t) => t.keyword),
    ['stamps', 'radial', 'linework', 'dots'],
    'the Marks genre table lists only honest narrowings, in first-appearance order',
  );
  ok(!genreTable('bauhaus').some((t) => t.keyword === 'geometric'), 'a whole-chapter keyword is never a genre');
}

// ── 2. the exhaustive battery — every chapter, every anchor ─────────────────
for (const c of CHAPTERS) {
  const looks = chapterLooks(c.id);
  const lookIds = new Set(looks.map((l) => l.id));
  for (const look of looks) {
    const s = openNarrowing(c.id, look.id);
    ok(s !== null, `${c.id}/${look.id}: a narrowing opens on a chapter member`);
    ok(Object.isFrozen(s) && Object.isFrozen(s.pools), `${c.id}/${look.id}: the state is frozen`);
    // pools strictly shrink, the anchor is in every pool, no foreign member anywhere
    for (let n = 0; n < s.pools.length; n++) {
      ok(s.pools[n].includes(look.id), `${c.id}/${look.id}: the anchor is in pool ${n}`);
      for (const id of s.pools[n]) ok(lookIds.has(id), `${c.id}/${look.id}: pool ${n} member ${id} belongs to the chapter`);
      if (n > 0) {
        ok(s.pools[n].length < s.pools[n - 1].length, `${c.id}/${look.id}: pool ${n} strictly narrows pool ${n - 1}`);
        for (const id of s.pools[n]) ok(s.pools[n - 1].includes(id), `${c.id}/${look.id}: pool ${n} is a subset of pool ${n - 1}`);
      }
    }
    // walk to the floor: presses past depth are refused identically
    let cur = s;
    const seen = [poolFor(cur)];
    while (narrow(cur) !== cur) {
      cur = narrow(cur);
      seen.push(poolFor(cur));
    }
    eq(cur.notch, narrowDepth(s), `${c.id}/${look.id}: the walk ends exactly at the honest depth`);
    ok(narrow(cur) === cur, `${c.id}/${look.id}: a press at the floor is refused (identical object)`);
    // widen back: every step restores the wider pool EXACTLY — the same frozen array
    while (cur.notch > NOTCH_CHAPTER) {
      cur = widen(cur);
      ok(poolFor(cur) === seen[cur.notch], `${c.id}/${look.id}: widening to notch ${cur.notch} restores the exact pool`);
    }
    ok(widen(cur) === cur, `${c.id}/${look.id}: widening at the chapter notch is refused (identical object)`);
    // a foreign look is in no pool, at any notch
    const foreign = CHAPTERS.find((o) => o.id !== c.id && o.id !== 'now');
    const foreignLook = chapterLooks(foreign.id).find((l) => !lookIds.has(l.id));
    if (foreignLook) {
      let probe = s;
      for (let n = 0; n <= narrowDepth(s); n++) {
        ok(!inPool(probe, foreignLook.id), `${c.id}/${look.id}: ${foreignLook.id} is in no pool (notch ${n})`);
        probe = narrow(probe);
      }
    }
  }
}

// ── 3. refusals — no funnel without a settled chapter board ─────────────────
eq(openNarrowing('no-such-chapter', 'tally-keeper'), null, 'an unknown chapter opens nothing');
eq(openNarrowing('marks', 'dessau'), null, 'a foreign look never anchors a funnel');
eq(openNarrowing('marks', 'no-such-look'), null, 'an unknown look opens nothing');
eq(poolFor(null), [], 'no state, no pool');
eq(notchLabel(null), null, 'no state, no label');
ok(narrow(null) === null && widen(null) === null, 'transitions on no state are no-ops');

// ── 4. the scope composes — pools intersect the dealt-scope deck ────────────
{
  const s = openNarrowing('marks', 'tally-keeper');
  const eff = effectiveChapterScope('marks', 'off');
  const deckIds = chapterScopeDeck('marks', eff.scope).looks.map((l) => l.id);
  eq(poolFor(s, deckIds), poolFor(s), 'at the scope Marks deals at, the chapter pool is the deck’s looks');
  const hand = narrow(narrow(s));
  ok(poolFor(hand, deckIds).every((id) => deckIds.includes(id)), 'the hand pool never leaves the dealt deck');

  const now = openNarrowing('now', 'praystation');
  const offDeck = chapterScopeDeck('now', 'off').looks.map((l) => l.id);
  ok(offDeck.includes('praystation'), 'praystation is reachable at OFF');
  ok(
    poolFor(now, offDeck).includes('praystation') && poolFor(now, offDeck).every((id) => offDeck.includes(id)),
    'the Now pool at OFF is exactly the deck intersection (anchor in, nothing outside the deck)',
  );
  ok(poolFor(now, offDeck).length < poolFor(now).length, 'the OFF intersection honestly shrinks the Now pool');
}

// ── 5. the readout label — chapters and artists, never plumbing ─────────────
{
  const s = openNarrowing('marks', 'tally-keeper');
  eq(notchLabel(s), { chapter: 'Marks', keyword: null, artist: null, text: 'Marks' }, 'notch 0 names the chapter');
  const g = narrow(s);
  eq(
    notchLabel(g),
    { chapter: 'Marks', keyword: 'linework', artist: null, text: 'Marks · linework' },
    'notch 1 names the chapter and its keyword',
  );
  const h = narrow(g);
  eq(
    notchLabel(h),
    { chapter: 'Marks', keyword: 'linework', artist: 'TALLY KEEPER', text: 'TALLY KEEPER' },
    'notch 2 names the artist',
  );
}

// ── 6. the keeps-ledger notch context — schema-additive, provenance pattern ──
{
  const base = {
    seed: 42,
    timestamp: '2026-10-31T00:00:00.000Z',
    config: { layout: { composition: 'tally-keeper' }, palette: { id: 'ochre-wall' } },
  };
  const plain = ledgerRow(base, '');
  eq(
    Object.keys(plain).sort(),
    ['keepContext', 'projectRef', 'recipe', 'seed', 'timestamp'],
    'a keep with no narrowing standing writes exactly yesterday’s row',
  );

  const s = narrow(narrow(openNarrowing('marks', 'tally-keeper')));
  const ctx = notchContextFor(s);
  eq(ctx, { chapter: 'marks', level: 2, keyword: 'linework', anchor: 'tally-keeper' }, 'the context names chapter, level, keyword, anchor');
  ok(isNotchContext(ctx), 'the machine’s own context validates');

  const row = ledgerRow({ ...base, notch: ctx }, '');
  eq(row.notch, ctx, 'the row carries the notch context');
  ok(isLedgerRow(row), 'a row with a notch context is a ledger row');
  const parsed = parseLedger(serializeRow(row), () => {});
  eq(parsed.skipped, 0, 'the row round-trips the app’s own reader');
  eq(parsed.rows[0].notch, ctx, 'the parsed row keeps its notch context');

  const garbled = ledgerRow({ ...base, notch: { chapter: 'nope', level: 2, keyword: 'x', anchor: 'y' } }, '');
  ok(!('notch' in garbled), 'a garbled notch context is dropped, never written');
  const badLine = JSON.stringify({ ...plain, notch: { chapter: 'marks', level: 7, keyword: null, anchor: 'tally-keeper' } });
  ok(!isLedgerRow(JSON.parse(badLine)), 'a claimed-but-impossible notch context fails the schema check');
  const skipped = parseLedger(badLine, () => {});
  eq(skipped.skipped, 1, 'the reader skips the bad line with a warning, never silently');

  eq(sanitizeNotchContext({ chapter: 'marks', level: 0, keyword: null, anchor: 'first-wall' })?.level, 0, 'a chapter-level context is real');
  eq(sanitizeNotchContext({ chapter: 'marks', level: 1, keyword: '', anchor: 'first-wall' }), null, 'an empty keyword is not a context');
  eq(notchContextFor(null), null, 'no state, no context');
}

assert.ok(checks > 0);
console.log(`chapterNarrow.selfcheck: ok (${checks} checks — the notch machine: derivation pins, the exhaustive chapter × anchor battery, scope composition, labels, the ledger notch schema)`);
