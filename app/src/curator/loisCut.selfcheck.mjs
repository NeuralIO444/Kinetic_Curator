// loisCut.selfcheck.mjs — #1856 (BOOK S3): LOIS judges the round's deal. The cut is his existing
// verdict machinery (loisRank) pointed at the dealt hand: the gates below are loisVerdict's own
// thresholds, and the reason is loisVerdict's own line — this suite cross-pins the two so the cut
// can never drift from the verdict it extends.
import assert from 'node:assert';
import { judgeDeal, LOIS_CUT_GATES } from './loisCut.mjs';
import { loisVerdict } from './loisRank.js';
import { CHAPTERS, chapterLooks } from '../data/chapters.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const PAN_LINES = new Set([
  'No hit at a glance. Out.',
  'Too close to the pile. Habit.',
  'Cautious or creative, kid. Pick one.',
]);

ok("the gates are loisVerdict's own thresholds, in its own order", () => {
  assert.deepEqual(LOIS_CUT_GATES, { glance: 0.28, originality: 0.22, boldness: 0.3 });
  // boundary parts, read against loisVerdict itself: just under a gate draws that gate's pan line,
  // just over it does not — so the constants above are the verdict's, not a copy that can drift
  const line = (parts) => loisVerdict({ score: 0, ...parts });
  assert.equal(line({ glance: 0.279, originality: 1, boldness: 1 }), 'No hit at a glance. Out.');
  assert.ok(!PAN_LINES.has(line({ glance: 0.28, originality: 1, boldness: 1 })));
  assert.equal(line({ glance: 1, originality: 0.219, boldness: 1 }), 'Too close to the pile. Habit.');
  assert.ok(!PAN_LINES.has(line({ glance: 1, originality: 0.22, boldness: 1 })));
  assert.equal(line({ glance: 1, originality: 1, boldness: 0.299 }), 'Cautious or creative, kid. Pick one.');
  assert.ok(!PAN_LINES.has(line({ glance: 1, originality: 1, boldness: 0.3 })));
});

ok('every chapter deck judges consistently: cut ⇒ the reason is the verdict line for the first failing gate', () => {
  let judged = 0;
  let cuts = 0;
  for (const c of CHAPTERS) {
    const deck = chapterLooks(c.id).map((l) => l.params);
    if (deck.length === 0) continue;
    for (const look of chapterLooks(c.id)) {
      const v = judgeDeal(look.params, deck);
      judged++;
      assert.ok(v.parts, `${c.id}/${look.id}: a verdict with parts`);
      if (v.cut) {
        cuts++;
        assert.equal(v.reason, loisVerdict(v.parts), 'the reason is his line, verbatim in spirit and letter');
        assert.ok(PAN_LINES.has(v.reason), 'a cut always carries a pan line, never praise');
        const firstFailing = ['glance', 'originality', 'boldness'].find((k) => v.parts[k] < LOIS_CUT_GATES[k]);
        assert.equal(v.gate.key, firstFailing, 'the named gate is the first that failed, in verdict order');
        assert.equal(v.gate.value, v.parts[v.gate.key]);
        assert.ok(v.gate.value < v.gate.limit, 'the measured value sits under its limit — re-derivable');
      } else {
        assert.equal(v.gate, null);
        assert.equal(v.reason, '');
        for (const k of ['glance', 'originality', 'boldness'])
          assert.ok(v.parts[k] >= LOIS_CUT_GATES[k], `${c.id}/${look.id}: no cut means every gate held`);
      }
    }
  }
  assert.ok(judged > 100, `the battery judged real deals (${judged})`);
  assert.ok(cuts > 0, `the battery produced real cuts (${cuts}) — the judge does spend`);
});

ok('a hand that IS the pile cuts on originality: against copies of itself its distance is zero', () => {
  // find, on the real library, a look whose glance and boldness clear their gates against its own
  // mean — for that look the self-pile verdict is forced: originality 0, the pile line, by name
  let proven = 0;
  for (const c of CHAPTERS) {
    for (const look of chapterLooks(c.id)) {
      const v = judgeDeal(look.params, [look.params, look.params, look.params]);
      assert.ok(v.parts.originality < 1e-9, 'distance from your own mean is zero (to float dust)');
      if (v.gate?.key === 'originality') {
        proven++;
        assert.equal(v.cut, true);
        assert.equal(v.reason, 'Too close to the pile. Habit.');
      }
    }
  }
  assert.ok(proven > 0, `the originality path fired on real looks (${proven})`);
});

ok('the judge is deterministic and does not mutate the hand or the pile', () => {
  const deck = chapterLooks('marks').map((l) => l.params);
  const hand = chapterLooks('marks')[0].params;
  const frozenHand = Object.freeze(structuredClone(hand));
  const frozenDeck = Object.freeze(deck.map((p) => Object.freeze(structuredClone(p))));
  const a = judgeDeal(frozenHand, frozenDeck);
  const b = judgeDeal(frozenHand, frozenDeck);
  assert.deepEqual(a, b, 'same hand + same pile in, same verdict out');
});

ok('no pile, no verdict: an empty deck cannot be judged against, and an empty hand draws no cut', () => {
  const hand = chapterLooks('marks')[0].params;
  assert.deepEqual(judgeDeal(hand, []), { cut: false, parts: null, gate: null, reason: '' });
  assert.deepEqual(judgeDeal(null, [hand]), { cut: false, parts: null, gate: null, reason: '' });
});

console.log(`loisCut.selfcheck: ${n} checks passed`);
