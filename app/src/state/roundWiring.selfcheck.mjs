// node src/state/roundWiring.selfcheck.mjs
// #1856 (BOOK S3) — the round, wired live. The machine (roundTable.selfcheck) and the judge
// (loisCut.selfcheck) are proven in isolation; this suite drives the REAL store actions and pins
// the seams the wiring map named: the round completes at the voice-pass commit and settles in the
// same update (D4 automatic, Matt 2026-10-31); LOIS's one spend is the kill — the stage's standing
// composition IS the redealt look, dealt from the chapter deck minus the killed one (D2, Matt
// 2026-10-31); a fresh flip / CHAOS / the opener close the round on their vias; warm taps are
// absorbed; and the feed's CUT flag stands after a spend. The live cut rate is printed as feel
// data (the judge battery measured 25/105 ≈ 24% and was deliberately not tuned) — never pinned.
import assert from 'node:assert/strict';
import { useStore } from './store.js';
import { chapterScopeDeck } from './chapterWalk.mjs';
import { loisActivity } from '../curator/loisActivity.js';

const S = () => useStore.getState();
const PAN_LINES = new Set([
  'No hit at a glance. Out.',
  'Too close to the pile. Habit.',
  'Cautious or creative, kid. Pick one.',
]);

const reset = () =>
  useStore.setState({
    startupMode: 'koz',
    kineticChapterId: null,
    kineticChapterVisits: {},
    kineticLanding: null,
    kineticRound: null,
    kineticVoiceId: null,
    armedMode: null,
    armedMotion: null,
    lockedParams: {},
  });

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

ok('no chapter, no table: a voice pass with no landing standing opens no round', () => {
  reset();
  S().kineticVoicePass();
  assert.equal(S().kineticRound, null, 'the round is a Book mechanic — no chapter, no round');
  assert.equal(loisActivity.snapshot().cut, false, 'and no spend was noted');
});

// ── full rounds through the store, until both of LOIS's answers have been seen ────────────────────
let rounds = 0;
let cuts = 0;
let passes = 0;
let cutFlagAtSpend = null;
{
  reset();
  let prevRound = null;
  while ((cuts < 3 || passes < 3) && rounds < 80) {
    S().kineticLookPass();
    if (prevRound) {
      // the fresh flip closed the previous round in the same update that landed the new chapter
      const closed = S().kineticRound;
      assert.notEqual(closed, prevRound, 'the close produced the closed record, not a mutation of the settled one');
      assert.equal(closed.deal, prevRound.deal, 'the hand that stood is the hand the closed record keeps');
      assert.equal(closed.phase, 'closed', 'a fresh flip closes the standing round');
      assert.equal(closed.log.at(-1).type, 'close');
      assert.equal(closed.log.at(-1).via, 'flip', "the exit is named: 'flip'");
      assert.equal(closed.log.at(-1).outcome, 'settled', 'a settled round closes as settled');
    }
    const landing = S().kineticLanding;
    const dealtComposition = S().layoutParams.composition;
    S().kineticVoicePass();
    const round = S().kineticRound;
    rounds++;
    assert.ok(round, 'the voice pass sat the table');
    assert.equal(round.phase, 'settled', 'D4: the round settles in the same update it completes');
    assert.equal(round.settled, true);
    assert.equal(round.seq, landing.seq, 'the round carries its landing’s sequence');
    assert.equal(round.chapterId, landing.chapterId, 'the round names its chapter');
    assert.equal(round.deal.voiceId, S().kineticVoiceId, 'the deal’s voice is the voice the pass dealt');
    assert.equal(
      S().layoutParams.composition,
      round.deal.lookId,
      'the stage’s standing look IS the round’s standing deal',
    );
    assert.deepEqual(
      round.log.slice(0, 2).map((e) => e.type),
      ['deal', 'judging'],
      'the table sat in order',
    );
    assert.equal(round.log.at(-1).type, 'settle', 'the settle is on the record');
    const deckIds = chapterScopeDeck(round.chapterId, round.deal.dealtScope).looks.map((l) => l.id);
    if (round.cut) {
      cuts++;
      assert.deepEqual(
        round.log.map((e) => e.type),
        ['deal', 'judging', 'cut', 'settle'],
      );
      assert.ok(PAN_LINES.has(round.cut.reason), 'the cut carries LOIS’s own line, never a paraphrase');
      assert.equal(round.cut.before.lookId, dealtComposition, 'the killed look is the look the flip dealt');
      assert.notEqual(round.deal.lookId, dealtComposition, 'D2: the killed look does not stand');
      assert.ok(!round.deal.pool.includes(dealtComposition), 'the redeal pool is the deck minus the killed look');
      assert.ok(round.deal.pool.includes(round.deal.lookId), 'the standing look was dealt from that pool');
      assert.deepEqual(
        [...round.deal.pool].sort(),
        deckIds.filter((id) => id !== dealtComposition).sort(),
        'the pool is exactly the chapter deck at the dealt scope, minus the killed look',
      );
      assert.equal(round.deal.redealt, true, 'the post-cut deal confesses the redeal');
      if (cutFlagAtSpend === null) cutFlagAtSpend = loisActivity.snapshot().cut;
    } else {
      passes++;
      assert.deepEqual(
        round.log.map((e) => e.type),
        ['deal', 'judging', 'pass', 'settle'],
      );
      assert.equal(round.deal.lookId, dealtComposition, 'a pass leaves the dealt hand standing');
      assert.deepEqual([...round.deal.pool].sort(), [...deckIds].sort(), 'the deal names the full deck it came from');
    }
    prevRound = round;
  }
}
ok('rounds settle through the store: pass and kill both seen, every record honest', () => {
  assert.ok(rounds >= 6, `rounds ran (${rounds})`);
  assert.ok(cuts >= 3, `LOIS spent her cut live (${cuts}/${rounds})`);
  assert.ok(passes >= 3, `LOIS passed live (${passes}/${rounds})`);
});
console.log(
  `  · live cut rate over ${rounds} wired rounds: ${cuts} cuts (${((100 * cuts) / rounds).toFixed(0)}%) — feel data, not a pin`,
);

ok('the feed’s CUT flag stands after a spend (the pill paints CUT in her red)', () => {
  assert.equal(cutFlagAtSpend, true, 'noteCut landed post-commit; the redeal did not clear its own flag');
});

ok('warm taps are absorbed: a curator pass and a stray voice pass leave the settled record identical', () => {
  const round = S().kineticRound;
  assert.equal(round.phase, 'settled');
  S().kineticCuratorPass();
  assert.equal(S().kineticRound, round, 'the curator pass plays on the board; the record does not move');
  S().kineticVoicePass();
  assert.equal(S().kineticRound, round, 'a voice pass on a standing round is absorbed — the round belongs to its deal');
  assert.equal(S().kineticRound.phase, 'settled', 'and it never unlocked');
});

ok('CHAOS closes the round via chaos, and the opener closes it via opener', () => {
  S().kineticRoll();
  let round = S().kineticRound;
  assert.equal(round.phase, 'closed');
  assert.equal(round.log.at(-1).via, 'chaos');
  assert.equal(round.log.at(-1).outcome, 'settled', 'it had settled before the escape');
  assert.equal(S().kineticChapterId, null, 'CHAOS still leaves the book (S2)');

  // rebuild a settled round, then leave through the launch opener
  S().kineticLookPass();
  S().kineticVoicePass();
  assert.equal(S().kineticRound.phase, 'settled');
  S().kineticOpenPass();
  round = S().kineticRound;
  assert.equal(round.phase, 'closed');
  assert.equal(round.log.at(-1).via, 'opener');
  assert.equal(round.log.at(-1).outcome, 'settled');
  assert.equal(S().kineticChapterId, null, 'the opener still leaves the book (S2)');
});

console.log(`roundWiring.selfcheck: ${n} checks passed`);
