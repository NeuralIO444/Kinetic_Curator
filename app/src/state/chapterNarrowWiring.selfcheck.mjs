// node src/state/chapterNarrowWiring.selfcheck.mjs
// #1857 (BOOK S4) — the funnel, wired live. The machine (chapterNarrow.selfcheck) is proven in
// isolation; this suite drives the REAL store actions and pins the wiring map's seams under D3
// (Matt 2026-10-31, Option A: CURATOR does both jobs, the board says which):
//  - a round's settle opens the narrowing beside it at notch 0, anchored on the settled look;
//  - a settled CURATOR press advances one notch and the landed composition is a member of
//    poolFor() ∩ the dealt scope's chapter deck — at genre, at hand, and at the floor, where
//    further presses keep rolling inside the hand pool instead of re-widening;
//  - the exits widen implicitly: flip / CHAOS / the opener clear the narrowing with the board;
//  - warm taps are absorbed — the narrowing record does not move (S3's law, unchanged);
//  - a keep captured while a narrowing stands carries the notch context through sanitizeFavorite
//    into the ledger row; a keep captured with none standing carries no field (absent stays absent);
//  - with no settled board, a CURATOR press is the whole-book roll and opens nothing.
import assert from 'node:assert/strict';
import { useStore } from './store.js';
import { chapterScopeDeck } from './chapterWalk.mjs';
import { openNarrowing, narrowDepth, poolFor, notchContextFor, notchLabel } from './chapterNarrow.mjs';
import { chapterLooks } from '../data/chapters.js';
import { captureFavorite, sanitizeFavorite } from './slices/davisSlice.js';
import { ledgerRow } from '../curator/tasteLedger.js';

const S = () => useStore.getState();

const reset = () =>
  useStore.setState({
    startupMode: 'koz',
    kineticChapterId: null,
    kineticChapterVisits: {},
    kineticLanding: null,
    kineticRound: null,
    kineticNotch: null,
    kineticVoiceId: null,
    armedMode: null,
    armedMotion: null,
    lockedParams: {},
    curatePress: 0,
  });

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

ok('no settled board: a CURATOR press is the whole-book roll and opens no narrowing', () => {
  reset();
  const before = S().curatePress;
  S().curateUnlocked();
  assert.equal(S().curatePress, before + 1, 'the press still rolled');
  assert.equal(S().kineticNotch, null, 'no board, no funnel — the unsettled job is unchanged');
});

// ── hunt a round whose anchor honestly narrows twice (chapter → genre → hand) ───────────────────
let board = null; // { round, notch }
{
  reset();
  let prevRound = null;
  for (let i = 0; i < 200 && !board; i++) {
    S().kineticLookPass();
    if (prevRound) {
      assert.equal(
        S().kineticNotch,
        null,
        'a fresh flip ends the settled board: its narrowing is gone in the same update',
      );
      assert.equal(S().kineticRound.phase, 'closed', 'and the round closed on the flip via');
    }
    S().kineticVoicePass();
    const round = S().kineticRound;
    assert.ok(round && round.phase === 'settled', 'the voice pass settled a round');
    const notch = S().kineticNotch;
    assert.ok(notch, 'the settle opened a narrowing beside the round');
    assert.equal(notch.chapterId, round.chapterId, 'the funnel stands in the round’s chapter');
    assert.equal(notch.anchorLookId, round.deal.lookId, 'the funnel anchors on the look that settled');
    assert.equal(notch.notch, 0, 'a fresh board opens at the chapter notch');
    prevRound = round;
    if (narrowDepth(openNarrowing(round.chapterId, round.deal.lookId)) === 2) board = { round, notch };
  }
}
ok('every settle opens its narrowing at notch 0; a depth-2 board was found to press', () => {
  assert.ok(board, 'a depth-2 anchor settled within the hunt budget');
});

ok('warm taps are absorbed: the narrowing record is the identical object after tap 3+ and a stray voice pass', () => {
  const { notch } = board;
  S().kineticCuratorPass();
  assert.equal(S().kineticNotch, notch, 'the curator pass plays on the board; the funnel does not move');
  S().kineticVoicePass();
  assert.equal(S().kineticNotch, notch, 'a voice pass on a standing round is absorbed — funnel untouched');
  assert.equal(S().kineticRound, board.round, 'and the round itself is untouched (S3)');
});

const deckIds = () => chapterScopeDeck(board.round.chapterId, board.round.deal.dealtScope).looks.map((l) => l.id);
const inCurrentPool = () => poolFor(S().kineticNotch, deckIds()).includes(S().layoutParams.composition);

ok('settled presses narrow: genre, then hand, then the floor holds — every landed composition inside the pool', () => {
  S().curateUnlocked();
  assert.equal(S().kineticNotch.notch, 1, 'press 1: the funnel stands at the genre notch');
  assert.ok(inCurrentPool(), `press 1 landed inside the genre pool (${S().layoutParams.composition})`);
  S().curateUnlocked();
  assert.equal(S().kineticNotch.notch, 2, 'press 2: the funnel stands at the hand notch');
  assert.ok(inCurrentPool(), `press 2 landed inside the hand pool (${S().layoutParams.composition})`);
  const anchorName = chapterLooks(board.round.chapterId).find((l) => l.id === board.round.deal.lookId)?.name;
  assert.equal(
    notchLabel(S().kineticNotch).text,
    anchorName,
    'at the hand notch the label is the anchor artist’s own name',
  );
  const floorState = S().kineticNotch;
  S().curateUnlocked();
  assert.equal(S().kineticNotch, floorState, 'press 3 at the floor: the machine refuses — the identical state stands');
  assert.ok(inCurrentPool(), 'and the press still rolled, inside the hand pool');
});

ok('a keep made while the narrowing stands carries the notch context into the ledger row', () => {
  const rec = captureFavorite(S(), S().paletteId);
  const ctx = notchContextFor(S().kineticNotch);
  assert.deepEqual(rec.notch, ctx, 'the capture stamps the standing funnel');
  assert.equal(rec.notch.level, 2, 'at the hand notch');
  assert.equal(rec.notch.anchor, board.round.deal.lookId, 'around the settled anchor');
  const clean = sanitizeFavorite(rec);
  assert.deepEqual(clean.notch, ctx, 'the sanitizer carries a real notch context through');
  const row = ledgerRow(clean, 'suite');
  assert.deepEqual(row.notch, ctx, 'and the ledger row writes it — S5 reads exactly this');
});

ok('a held look is never re-based: composition locked, the press leaves the standing composition alone', () => {
  const standing = S().layoutParams.composition;
  useStore.setState({ lockedParams: { composition: true } });
  S().curateUnlocked();
  assert.equal(S().layoutParams.composition, standing, 'a lock is a lock, settled board or not');
  useStore.setState({ lockedParams: {} });
});

ok('CHAOS ends the board and its narrowing; a keep afterwards carries no notch field', () => {
  S().kineticRoll();
  assert.equal(S().kineticNotch, null, 'the escape widened by leaving — no funnel stands');
  const rec = captureFavorite(S(), S().paletteId);
  assert.ok(!('notch' in rec), 'absent stays absent at capture');
  const clean = sanitizeFavorite(rec);
  assert.ok(!('notch' in clean), 'absent stays absent through the sanitizer');
  const row = ledgerRow(clean, 'suite');
  assert.ok(row && !('notch' in row), 'and the ledger row writes no field');
});

console.log(`chapterNarrowWiring.selfcheck: ${n} checks passed`);
