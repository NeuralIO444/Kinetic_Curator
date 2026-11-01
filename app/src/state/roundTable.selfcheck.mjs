// roundTable.selfcheck.mjs — #1856 (BOOK S3): the round machine — turns, the one-cut law, the frozen
// deal, the honest settle, the lock. The cut's SHAPE (bounce-and-redeal vs trim, ruling D2) and the
// settle's TRIGGER (automatic vs the performer's gesture, ruling D4) are the caller's, so the suite
// drives the machine with fixture executors for BOTH cut shapes and settles under BOTH trigger
// readings: the laws below are proven of the machine itself, whichever way the rulings land.
import assert from 'node:assert';
import {
  ROUND_PHASES,
  openRound,
  openJudgement,
  passCut,
  spendCut,
  settle,
  absorbWarmTap,
  closeRound,
} from './roundTable.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const dealA = () => ({
  chapterId: 'marks',
  lookId: 'first-wall',
  voiceId: 'marks-voice-1',
  dealtScope: 'koz',
  redealt: false,
  pool: ['first-wall', 'tally-keeper', 'hand-cave'],
});
const verdict = () => ({ reason: 'No hit at a glance. Out.', gate: 'glance', value: 0.11, limit: 0.28 });

/** Fixture executor — the KILL shape (D2 option a): the hand is bounced; a new hand is dealt from a smaller pool. */
const killExecutor = () => ({
  chapterId: 'marks',
  lookId: 'tally-keeper',
  voiceId: 'marks-voice-1',
  dealtScope: 'koz',
  redealt: true,
  pool: ['tally-keeper', 'hand-cave'],
});
/** Fixture executor — the TRIM shape (D2 option b): the hand stands, minus one element. */
const trimExecutor = (deal) => ({ ...deal, voiceId: null, dropped: 'voice' });

const dealtRound = () => openRound({ seq: 7, chapterId: 'marks', deal: dealA() });
const judgingRound = () => openJudgement(dealtRound());
const standingRound = () => passCut(judgingRound());

ok('a round opens on a completed deal: phases in table order, the record is exactly the public record', () => {
  assert.deepEqual(ROUND_PHASES, ['dealt', 'judging', 'standing', 'settled', 'closed']);
  const r = dealtRound();
  assert.equal(r.phase, 'dealt');
  assert.equal(r.seq, 7);
  assert.equal(r.chapterId, 'marks');
  assert.equal(r.cut, null);
  assert.equal(r.settled, false);
  assert.deepEqual(Object.keys(r).sort(), ['chapterId', 'cut', 'deal', 'log', 'phase', 'seq', 'settled']);
  assert.deepEqual(
    r.log.map((e) => e.type),
    ['deal'],
  );
  assert.equal(r.log[0].lookId, 'first-wall');
  assert.throws(() => openRound({ chapterId: 'marks' }), TypeError, 'no deal, no round');
  assert.throws(() => openRound({ deal: dealA() }), TypeError, 'no chapter, no round');
});

ok('the deal is a fixed object: frozen on entry, deep, and a mutation attempt throws without landing', () => {
  const r = dealtRound();
  assert.ok(Object.isFrozen(r.deal) && Object.isFrozen(r.deal.pool) && Object.isFrozen(r));
  assert.throws(() => {
    r.deal.lookId = 'hand-cave';
  }, TypeError);
  assert.throws(() => {
    r.deal.pool.push('dot-song');
  }, TypeError);
  assert.equal(r.deal.lookId, 'first-wall', 'the hand Davis dealt is the hand on the table');
});

ok('the slot must open before anything else can happen, and it opens exactly once', () => {
  const r = dealtRound();
  assert.equal(spendCut(r, { verdict: verdict(), deal: killExecutor() }), r, 'no cut before the slot');
  assert.equal(passCut(r), r, 'no pass before the slot');
  assert.equal(settle(r), r, 'no settle before the slot');
  const j = openJudgement(r);
  assert.equal(j.phase, 'judging');
  assert.equal(j.deal, r.deal, 'opening the slot does not touch the deal');
  assert.equal(openJudgement(j), j, 'the slot does not open twice');
});

ok('Davis cannot re-deal mid-judgement: while the slot is open the deal is the same frozen object', () => {
  const r = dealtRound();
  const j = openJudgement(r);
  assert.equal(j.deal, r.deal, 'the deal under judgement is the deal that was dealt, by identity');
  assert.throws(() => {
    j.deal.voiceId = 'other';
  }, TypeError);
  assert.equal(j.deal.voiceId, 'marks-voice-1');
});

ok('a pass closes the slot with the deal untouched, and the pass is on the record', () => {
  const s = standingRound();
  assert.equal(s.phase, 'standing');
  assert.equal(s.cut, null);
  assert.equal(s.deal.lookId, 'first-wall');
  assert.deepEqual(
    s.log.map((e) => e.type),
    ['deal', 'judging', 'pass'],
  );
});

ok('a cut lands (kill shape): the redealt hand stands, the cut record keeps the reason and both hands', () => {
  const s = spendCut(judgingRound(), { verdict: verdict(), deal: killExecutor() });
  assert.equal(s.phase, 'standing');
  assert.equal(s.deal.lookId, 'tally-keeper', 'the standing deal is the redeal');
  assert.deepEqual(s.deal.pool, ['tally-keeper', 'hand-cave'], 'dealt from the smaller pool');
  assert.equal(s.cut.reason, 'No hit at a glance. Out.', 'the one legible reason rides the record');
  assert.equal(s.cut.gate, 'glance');
  assert.equal(s.cut.before.lookId, 'first-wall');
  assert.equal(s.cut.after.lookId, 'tally-keeper');
  const entry = s.log.find((e) => e.type === 'cut');
  assert.equal(entry.reason, s.cut.reason);
  assert.deepEqual([entry.before.lookId, entry.after.lookId], ['first-wall', 'tally-keeper']);
  assert.ok(Object.isFrozen(s.deal) && Object.isFrozen(s.cut), 'the post-cut hand is frozen too');
});

ok('a cut lands (trim shape): the same hand stands, minus the dropped element', () => {
  const j = judgingRound();
  const s = spendCut(j, { verdict: verdict(), deal: trimExecutor(j.deal) });
  assert.equal(s.phase, 'standing');
  assert.equal(s.deal.lookId, 'first-wall', 'trim keeps the hand');
  assert.equal(s.deal.voiceId, null);
  assert.equal(s.deal.dropped, 'voice');
  assert.equal(s.cut.before.voiceId, 'marks-voice-1');
});

ok('LOIS may not cut silently: a spend without a legible reason is refused, untouched', () => {
  const j = judgingRound();
  assert.equal(spendCut(j, { verdict: { reason: '' }, deal: killExecutor() }), j);
  assert.equal(spendCut(j, { verdict: { reason: '   ' }, deal: killExecutor() }), j);
  assert.equal(spendCut(j, { deal: killExecutor() }), j);
  assert.equal(spendCut(j, { verdict: verdict() }), j, 'a verdict with no resulting hand is no spend');
});

ok('one-cut law is structural: after the spend, no transition re-opens the slot or spends again', () => {
  const s = spendCut(judgingRound(), { verdict: verdict(), deal: killExecutor() });
  assert.equal(openJudgement(s), s);
  assert.equal(spendCut(s, { verdict: verdict(), deal: killExecutor() }), s, 'no second cut');
  assert.equal(passCut(s), s, 'no pass after the spend either — the slot is closed');
  const p = standingRound();
  assert.equal(spendCut(p, { verdict: verdict(), deal: killExecutor() }), p, 'nor after a pass');
});

ok('the settle fires only on a completed round — never on a partial one (honest signal)', () => {
  assert.equal(settle(dealtRound()).settled, false);
  assert.equal(settle(judgingRound()).settled, false);
  const interrupted = closeRound(judgingRound(), 'chaos');
  assert.equal(interrupted.settled, false);
  assert.ok(!interrupted.log.some((e) => e.type === 'settle'), 'an interrupted round shows no settle');
  // both D4 readings drive the same machine call; what the machine guarantees is the phase gate
  const auto = settle(standingRound());
  assert.equal(auto.phase, 'settled');
  assert.equal(auto.settled, true);
  assert.deepEqual(
    auto.log.map((e) => e.type),
    ['deal', 'judging', 'pass', 'settle'],
  );
  assert.equal(settle(auto), auto, 'the lock does not land twice');
});

ok('a trimmed-and-standing deal settles exactly like an uncut one', () => {
  const j = judgingRound();
  const s = settle(spendCut(j, { verdict: verdict(), deal: trimExecutor(j.deal) }));
  assert.equal(s.settled, true);
  assert.equal(s.deal.lookId, 'first-wall');
});

ok('the lock persists across warm taps; unlocking costs a fresh flip and nothing else opens it', () => {
  let r = settle(standingRound());
  for (let i = 0; i < 5; i++) r = absorbWarmTap(r);
  assert.equal(r.phase, 'settled');
  assert.equal(r.deal.lookId, 'first-wall', 'the standing piece is still the standing piece');
  assert.equal(openJudgement(r), r);
  assert.equal(spendCut(r, { verdict: verdict(), deal: killExecutor() }), r);
  const closed = closeRound(r, 'flip');
  assert.equal(closed.phase, 'closed');
  assert.equal(closed.log.at(-1).outcome, 'settled', 'a settled round closes as settled');
  assert.equal(closeRound(closed, 'flip'), closed, 'closed is terminal');
});

ok('a fresh flip or CHAOS closes an unsettled round as unsettled, from any phase', () => {
  for (const r of [dealtRound(), judgingRound(), standingRound()]) {
    const c = closeRound(r, 'flip');
    assert.equal(c.phase, 'closed');
    assert.equal(c.log.at(-1).outcome, 'unsettled');
  }
  assert.equal(closeRound(dealtRound(), 'chaos').log.at(-1).via, 'chaos', 'the escape is on the record');
  const r0 = dealtRound();
  assert.equal(closeRound(r0, 'nonsense'), r0, 'an unknown exit is refused, the round untouched');
});

ok('full round transcripts: Marks (cut → redeal → settle → flip) and Swiss (pass → settle → flip)', () => {
  let m = openRound({ seq: 1, chapterId: 'marks', deal: dealA() });
  m = openJudgement(m);
  m = spendCut(m, { verdict: verdict(), deal: killExecutor() });
  m = settle(m);
  m = absorbWarmTap(m);
  m = closeRound(m, 'flip');
  assert.deepEqual(
    m.log.map((e) => e.type),
    ['deal', 'judging', 'cut', 'settle', 'close'],
  );
  let s = openRound({
    seq: 2,
    chapterId: 'swiss',
    deal: {
      chapterId: 'swiss',
      lookId: 'diagonal-grid',
      voiceId: 'swiss-voice-1',
      dealtScope: 'koz',
      redealt: false,
      pool: ['diagonal-grid'],
    },
  });
  s = settle(passCut(openJudgement(s)));
  s = closeRound(s, 'flip');
  assert.deepEqual(
    s.log.map((e) => e.type),
    ['deal', 'judging', 'pass', 'settle', 'close'],
  );
  assert.equal(s.log.at(-1).outcome, 'settled');
});

console.log(`roundTable.selfcheck: ${n} checks passed`);
