// storyState.selfcheck.mjs — #1560 S3: the story machine, proven pure.
// Relationship from real events only (04/01), grudges as records, belief ≠ truth, episodes in five phases with
// one peak, the 8 anti-repetition rules by construction, and the suspicion arc (02): anomalies only, rationed
// in sessions, capped by construction, never resolved — and never once surfaced by the live view (storyLive's
// suite proves that half).
import assert from 'node:assert/strict';
import { Events } from '../composition/eventBus.js';
import {
  createStoryBook, decodeStoryBook, encodeStoryBook, beginSession, createEpisode, applyStoryEvent,
  selectStoryBeat, storyEventFromRecord, siftLedgers, evidenceOf, suspicionStage,
  STORY_ALPHA, STORY_BEAT_BUDGET, SUSPICION_CAP, SUSPICION_MILESTONES,
} from './storyState.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const rig = (patterns = []) => { const book = createStoryBook(); beginSession(book); return { book, ep: createEpisode(book, patterns) }; };
const verdict = (topic, delta, bar = 0) => ({ kind: 'verdict', topic, delta, bar });
const bars = (book, ep, count, from = 1000) => { for (let i = 0; i < count; i++) applyStoryEvent(book, ep, { kind: 'bar', bar: from + i }); };
const mid = () => 0.5;

// ── distillation: only facts the bus carries become events ───────────────────────────────────────────────────
ok('bus records distill to story events; what the bus does not carry honestly does not exist', () => {
  assert.deepEqual(storyEventFromRecord(Events.MIND_DECISION, { persona: 'davis', bar: 4, reply: { propose: { assetId: 'fern' } } }), { kind: 'proposal', assetId: 'fern', bar: 4 });
  assert.deepEqual(storyEventFromRecord(Events.MIND_DECISION, { persona: 'lois', bar: 5, reply: { critique: { target: 'density', delta: -0.2 } } }),
    { kind: 'verdict', topic: 'density', delta: -0.2, bar: 5 });
  assert.deepEqual(storyEventFromRecord(Events.MIND_DECISION, { persona: 'lois', bar: 6, reply: { state: { id: 'BURN', intensity: 1, decay: 0 } } }),
    { kind: 'verdict', topic: 'show', delta: -0.25, burn: true, bar: 6 }, 'she burns a flat show: a verdict on the show');
  assert.equal(storyEventFromRecord(Events.MIND_DECISION, { persona: 'lois', bar: 6, reply: { state: { id: 'NOD', intensity: 1, decay: 0 } } }), null, 'a bare NOD is a reading, not a verdict');
  assert.equal(storyEventFromRecord(Events.MIND_DECISION, { persona: 'davis', bar: 6, reply: { propose: null, state: { id: 'FLOW', intensity: 1, decay: 0 } } }), null);
  const lean = storyEventFromRecord(Events.MIND_DECISION, { persona: 'queen', bar: 7, reply: { mood: 'drive', lean: { wetness: 0.4 } } });
  assert.deepEqual(lean, { kind: 'lean', keys: ['wetness'], mood: 'drive', bar: 7 }, 'the third’s recorded lean is story matter — as sway, never as a line');
  assert.equal(storyEventFromRecord(Events.MIND_DECISION, { persona: 'queen', bar: 7, reply: { mood: 'calm', lean: {} } }), null, 'no lean, no event');
  assert.deepEqual(storyEventFromRecord(Events.DICE_CAST, { assetIds: ['a', 'b'] }, 9), { kind: 'crown', n: 2, bar: 9 });
  assert.deepEqual(storyEventFromRecord(Events.BLOOM, { rolls: 12 }, 9), { kind: 'bloom', rolls: 12, bar: 9 });
  assert.deepEqual(storyEventFromRecord(Events.KEEP_ADD, { keep: { seed: 42, config: { palette: { id: 'noir' } } } }, 9), { kind: 'keep', seed: 42, paletteId: 'noir', bar: 9 });
  assert.equal(storyEventFromRecord(Events.KEEP_ADD, { keep: {} }, 9), null, 'a keep with no seed is not a keep');
  assert.deepEqual(storyEventFromRecord(Events.CLOCK_BAR, { bar: 31 }), { kind: 'bar', bar: 31 });
  assert.equal(storyEventFromRecord(Events.MIND_DECISION, null), null);
});

// ── the relationship model: two directed scalars, fast mood over slow standing ───────────────────────────────
ok('verdicts move the judge’s regard — mood at full weight, standing at α; the reverse scalar is unmoved', () => {
  const { book, ep } = rig();
  applyStoryEvent(book, ep, verdict('density', 0.25, 1));
  assert.equal(book.esteem.mood, 12, 'a max praise is +12 of mood (0.25 × 48)');
  assert.ok(Math.abs(book.esteem.standing - 12 * STORY_ALPHA) < 1e-9, 'standing learns at α = 0.1');
  assert.equal(book.trust.mood, 0); assert.equal(book.trust.standing, 0);
  applyStoryEvent(book, ep, { kind: 'keep', seed: 1, paletteId: 'x', bar: 2 });
  assert.equal(book.trust.mood, 6, 'a keep is worth more to his trust in her than to her regard (6 vs 3)');
  assert.equal(book.esteem.mood, 15);
});

ok('mood decays per bar and resets per session; standing does neither', () => {
  const { book, ep } = rig();
  applyStoryEvent(book, ep, verdict('density', 0.25, 1));
  bars(book, ep, 138, 10);
  assert.ok(book.esteem.mood < 6.2 && book.esteem.mood > 5.8, `mood halved in ~138 bars (got ${book.esteem.mood})`);
  assert.ok(Math.abs(book.esteem.standing - 1.2) < 1e-9, 'standing does not decay');
  beginSession(book);
  assert.equal(book.esteem.mood, 0, 'a new session resets mood');
  assert.ok(Math.abs(book.esteem.standing - 1.2) < 1e-9, 'and inherits standing');
  assert.equal(book.sessions, 2);
});

// ── grudges are records, not moods ───────────────────────────────────────────────────────────────────────────
ok('the same offence a third time promotes to a named grudge; praise on that topic is its forgiveness', () => {
  const { book, ep } = rig();
  applyStoryEvent(book, ep, verdict('density', -0.05, 1));
  assert.equal(book.grudges.length, 0, 'a nudge (−0.05) is not an offence');
  for (let i = 0; i < 3; i++) applyStoryEvent(book, ep, verdict('density', -0.2, 2 + i));
  assert.deepEqual(book.grudges, [{ topic: 'density', count: 3, promoted: true, lastFiredSession: null }]);
  assert.ok(ep.patterns.some((p) => p.kind === 'promotion' && p.topic === 'density' && p.fresh), 'the promotion is sifted as the peak candidate');
  applyStoryEvent(book, ep, verdict('density', 0.2, 6));
  assert.equal(book.grudges[0].count, 2); assert.equal(book.grudges[0].promoted, false, 'one praise demotes it');
  applyStoryEvent(book, ep, verdict('density', 0.2, 7));
  applyStoryEvent(book, ep, verdict('density', 0.2, 8));
  assert.equal(book.grudges.length, 0, 'praised back to zero, the record closes');
});

// ── belief ≠ truth ───────────────────────────────────────────────────────────────────────────────────────────
ok('a persona’s believed standing refreshes only when they act; the gap is caught at the moment of acting', () => {
  const { book, ep } = rig();
  for (let i = 0; i < 12; i++) applyStoryEvent(book, ep, verdict(`t${i}`, 0.25, i + 1));
  assert.ok(Math.abs(book.esteem.standing - 14.4) < 1e-9);
  assert.equal(book.believed.lois.esteem, book.esteem.standing, 'she takes stock as she speaks');
  assert.equal(book.believed.davis.esteem, 0, 'he has not acted: his read is the session’s start');
  applyStoryEvent(book, ep, { kind: 'proposal', assetId: 'fern', bar: 20 });
  assert.ok(ep.misread && ep.misread.persona === 'davis' && ep.misread.gap >= 12, 'he acted on a stale read: a misread is noted');
  assert.equal(book.believed.davis.esteem, book.esteem.standing, 'acting refreshed his read');
  const beat = selectStoryBeat(book, ep, { roll: mid });
  assert.ok(beat && beat.kind === 'misread' && beat.persona === 'davis', 'and the misread is a beat');
});

// ── the suspicion arc ────────────────────────────────────────────────────────────────────────────────────────
const leanEv = (keys, mood = 'calm', bar = 0) => ({ kind: 'lean', keys, mood, bar });

ok('anomalies only: a lean that shifts under an unchanged mood; the same lean again is nothing', () => {
  const { book, ep } = rig();
  applyStoryEvent(book, ep, leanEv(['wetness'], 'calm', 1));
  assert.equal(book.suspicion.anomalies.length, 0, 'the first recorded lean is a fact, not an anomaly');
  applyStoryEvent(book, ep, leanEv(['wetness'], 'calm', 2));
  assert.equal(book.suspicion.anomalies.length, 0, 'the same lean again: nothing moved');
  applyStoryEvent(book, ep, leanEv(['evolve'], 'calm', 3));
  assert.equal(book.suspicion.anomalies.length, 1);
  assert.equal(book.suspicion.anomalies[0].kind, 'lean');
  assert.equal(book.suspicion.anomalies[0].witness, 'davis', 'no one had acted: the default witness holds it');
  assert.ok(Math.abs(book.suspicion.value - 6) < 1e-9, 'the first increment lands at full step');
  applyStoryEvent(book, ep, leanEv(['wetness'], 'calm', 4));
  assert.equal(book.suspicion.anomalies.length, 2, 'another shift is recorded…');
  assert.ok(Math.abs(book.suspicion.value - 6) < 1e-9, '…but increments are rationed in sessions, not bars');
});

ok('a verdict flip with no work between is an anomaly; with work between it is only a reversal', () => {
  const { book, ep } = rig();
  applyStoryEvent(book, ep, verdict('hue', 0.2, 1));
  applyStoryEvent(book, ep, verdict('hue', -0.2, 2));
  assert.equal(book.suspicion.anomalies.length, 1);
  assert.equal(book.suspicion.anomalies[0].kind, 'flip');
  assert.equal(book.suspicion.anomalies[0].witness, 'davis', 'he watches her change her mind');
  assert.ok(ep.patterns.some((p) => p.kind === 'reversal' && p.topic === 'hue'));
  const r2 = rig();
  applyStoryEvent(r2.book, r2.ep, verdict('hue', 0.2, 1));
  applyStoryEvent(r2.book, r2.ep, { kind: 'proposal', assetId: 'a', bar: 2 });
  applyStoryEvent(r2.book, r2.ep, verdict('hue', -0.2, 3));
  assert.equal(r2.book.suspicion.anomalies.length, 0, 'new work explains the flip: no anomaly');
  assert.ok(r2.ep.patterns.some((p) => p.kind === 'reversal'), 'the reversal is still story');
});

ok('the arc is capped by construction and rationed: many sessions of anomalies approach 85 and never reach it', () => {
  const { book, ep } = rig();
  let sig = ['wetness'];
  applyStoryEvent(book, ep, leanEv(sig, 'calm', 1));
  for (let s = 0; s < 60; s++) {
    beginSession(book); beginSession(book); beginSession(book); // ≥3 sessions between increments
    sig = sig[0] === 'wetness' ? ['evolve'] : ['wetness'];
    applyStoryEvent(book, ep, leanEv(sig, 'calm', 10 + s));
    assert.ok(book.suspicion.value < SUSPICION_CAP, `below the cap at round ${s}: ${book.suspicion.value}`);
  }
  assert.ok(book.suspicion.value > 75, `and it does deepen (got ${book.suspicion.value})`);
  assert.equal(suspicionStage(book), 'vigilance');
  assert.equal(suspicionStage(createStoryBook()), 'dismissal');
});

ok('milestones arm in the book, fire only at tier, talk down to the previous floor, and lose to a genuine peak', () => {
  const { book, ep } = rig();
  let sig = ['wetness'];
  applyStoryEvent(book, ep, leanEv(sig, 'calm', 1));
  for (let s = 0; s < 12 && !book.suspicion.pending; s++) {
    beginSession(book); beginSession(book); beginSession(book);
    sig = sig[0] === 'wetness' ? ['evolve'] : ['wetness'];
    applyStoryEvent(book, ep, leanEv(sig, 'calm', 20 + s));
  }
  assert.ok(book.suspicion.pending && book.suspicion.pending.at === 20, 'crossing 20 arms the first milestone');
  const witness = book.suspicion.pending.witness;
  for (let i = 0; i < 3; i++) applyStoryEvent(book, ep, verdict(`w${i}`, 0.2, 40 + i)); // intensity → build
  assert.equal(ep.phase, 'build');
  const low = selectStoryBeat(book, ep, { tiers: { [witness]: 2 }, roll: mid });
  assert.ok(!low || low.kind !== 'milestone', 'below tier 3 the noticing has no voice');
  assert.ok(book.suspicion.pending, 'still armed');
  const before = book.suspicion.value;
  const beat = selectStoryBeat(book, ep, { tiers: { [witness]: 3 }, roll: mid });
  assert.ok(beat && beat.kind === 'milestone' && beat.form === 'joke' && beat.mundaneExit === true && beat.persona === witness);
  assert.ok(Math.abs(book.suspicion.value - (before - 5)) < 1e-9, 'the mundane exit talks them back down 5');
  assert.equal(book.suspicion.pending, null, 'consumed');
  assert.deepEqual(evidenceOf(book, witness).length >= 1, true, 'the witness holds evidence; the split is real');
});

ok('a genuine peak outranks a milestone, and the milestone survives the session’s spent peak in the book', () => {
  const { book, ep } = rig();
  book.suspicion.value = 21; book.suspicion.pending = { at: 20, witness: 'lois' };
  for (let i = 0; i < 3; i++) applyStoryEvent(book, ep, verdict('mud', -0.2, i + 1)); // promotes at the third
  assert.equal(ep.phase, 'build');
  const beat = selectStoryBeat(book, ep, { tiers: { lois: 4, davis: 4 }, roll: mid });
  assert.ok(beat && beat.kind === 'promotion', 'the promotion takes the peak');
  assert.ok(book.suspicion.pending, 'the milestone is still armed for a later session');
});

// ── episodes: five phases, one peak, sifted not timed ────────────────────────────────────────────────────────
ok('the episode walks callback → working → build → peak → release → working, and the peak quota is one', () => {
  const pats = siftLedgers(
    [{ seed: 7, recipe: { paletteId: 'noir' }, timestamp: '2026-01-02T00:00:00Z' }],
    [{ seed: 7, timestamp: '2026-01-01T00:00:00Z' }]);
  const { book, ep } = rig(pats);
  assert.equal(ep.phase, 'callback');
  const cb = selectStoryBeat(book, ep, { roll: mid });
  assert.ok(cb && cb.kind === 'callback' && cb.referent.seed === 7, 'the callback names the debt’s seed (rule 5: ledger referents)');
  applyStoryEvent(book, ep, { kind: 'proposal', assetId: 'a', bar: 1 });
  assert.equal(ep.phase, 'working');
  for (let i = 0; i < 3; i++) applyStoryEvent(book, ep, verdict('mud', -0.2, 2 + i));
  assert.equal(ep.phase, 'build', 'intensity plus a sifted promotion: the build');
  const peak = selectStoryBeat(book, ep, { roll: mid });
  assert.ok(peak && peak.kind === 'promotion' && peak.cls === 'peak');
  assert.equal(ep.phase, 'peak');
  assert.equal(selectStoryBeat(book, ep, { roll: mid }), null, 'nothing talks over the peak');
  bars(book, ep, 200, 100);
  assert.equal(ep.phase, 'working', 'release decays back to working');
  for (let i = 0; i < 3; i++) applyStoryEvent(book, ep, verdict('ash', -0.2, 400 + i));
  assert.ok(ep.patterns.some((p) => p.kind === 'promotion' && p.fresh), 'a second promotion is sifted…');
  const again = selectStoryBeat(book, ep, { roll: mid });
  assert.ok(!again || again.kind !== 'promotion', '…but the session’s one peak is spent');
});

// ── anti-repetition, by construction ─────────────────────────────────────────────────────────────────────────
ok('rule 1 + 6: bed notes draw forms from a bag without repeat, and the floor is never gated away', () => {
  const { book, ep } = rig();
  const forms = [];
  for (let i = 0; i < 3; i++) {
    applyStoryEvent(book, ep, verdict(`n${i}`, 0.2, 10 + i * 20));
    bars(book, ep, 8, 100 + i * 20);
    const beat = selectStoryBeat(book, ep, { roll: () => 0.05 }); // under the clever gate, so the bag itself is what is measured
    assert.ok(beat && beat.kind === 'note', `note ${i} fires`);
    forms.push(beat.form);
  }
  assert.equal(new Set(forms).size, 3, 'three notes, three different forms: consumed, not recycled');
});

ok('rule 3: the clever form stays holstered at a high roll and fires at a low one', () => {
  const dry = (roll) => {
    const { book, ep } = rig();
    const seen = [];
    for (let i = 0; i < 6; i++) {
      applyStoryEvent(book, ep, verdict(`c${i}`, 0.2, 10 + i * 20));
      bars(book, ep, 8, 100 + i * 20);
      const beat = selectStoryBeat(book, ep, { roll });
      if (beat && beat.kind === 'note') seen.push(beat.form);
    }
    return seen;
  };
  assert.ok(!dry(() => 0.99).includes('dry'), 'roll 0.99: the dry form never fires');
  assert.ok(dry(() => 0.0).includes('dry'), 'roll 0.0: the dry form fires within a bag cycle');
});

ok('rule 4: topic and move cooldowns hold within their scope and release outside it', () => {
  const { book, ep } = rig();
  for (let i = 0; i < 3; i++) applyStoryEvent(book, ep, verdict('hue', 0.2, i + 1));
  const first = selectStoryBeat(book, ep, { roll: mid });
  assert.ok(first && first.kind === 'streak' && first.topic === 'hue');
  for (let i = 0; i < 3; i++) applyStoryEvent(book, ep, verdict('ink', 0.2, 10 + i));
  const second = selectStoryBeat(book, ep, { roll: mid });
  assert.ok(!second || second.kind !== 'streak', 'move cooldown: no second streak in the same phase');
  bars(book, ep, 200, 200); // intensity decays, phase falls back to working (phase moves reset)…
  for (let i = 0; i < 3; i++) applyStoryEvent(book, ep, verdict('ink', 0.2, 500 + i));
  const third = selectStoryBeat(book, ep, { roll: mid });
  assert.ok(!third || third.kind !== 'streak' || third.topic !== 'hue', '…but the topic gate is bars, not phases');
  for (let i = 0; i < 3; i++) applyStoryEvent(book, ep, verdict('hue', 0.2, 600 + i));
  bars(book, ep, 300, 700); // past the 96-bar topic cooldown AND down through the valley, so the move gate resets too
  const fourth = selectStoryBeat(book, ep, { roll: mid });
  assert.ok(fourth && fourth.kind === 'streak' && fourth.topic === 'hue', 'after the cooldown the topic may speak again');
});

ok('rule 4 (storylet level): a fired grudge waits a session before it can fire again', () => {
  const book = createStoryBook(); beginSession(book);
  const ep = createEpisode(book);
  for (let i = 0; i < 4; i++) applyStoryEvent(book, ep, verdict('mud', -0.2, i + 1)); // promote + recur
  const first = selectStoryBeat(book, ep, { tiers: {}, roll: mid });
  assert.ok(first && (first.kind === 'promotion' || first.kind === 'grudge'), 'the peak or the grudge speaks first');
  applyStoryEvent(book, ep, verdict('mud', -0.2, 9));
  const sameSession = selectStoryBeat(book, ep, { tiers: {}, roll: mid });
  assert.ok(!sameSession || sameSession.kind !== 'grudge', 'not twice in a session');
  beginSession(book);
  const ep2 = createEpisode(book);
  applyStoryEvent(book, ep2, verdict('mud', -0.2, 1));
  const next = selectStoryBeat(book, ep2, { tiers: {}, roll: mid });
  assert.ok(next && next.kind === 'grudge' && next.topic === 'mud', 'next session, a recurrence raises it again');
});

ok('rule 2 + 7 + budget: salience orders the queue, and the session’s story budget ends the story (not the bed)', () => {
  const { book, ep } = rig();
  for (let i = 0; i < 3; i++) applyStoryEvent(book, ep, verdict('a', 0.2, i + 1)); // streak on a
  applyStoryEvent(book, ep, verdict('b', 0.2, 5));
  applyStoryEvent(book, ep, verdict('b', -0.2, 6)); // reversal on b
  const first = selectStoryBeat(book, ep, { roll: mid });
  assert.ok(first && first.kind === 'streak', 'the streak (named, counted) outranks the reversal');
  const second = selectStoryBeat(book, ep, { roll: mid });
  assert.ok(second && second.kind === 'reversal', 'then the reversal');
  // spend the budget with streaks on fresh topics, valleys between
  let guard = 0;
  while (ep.storyBeats < STORY_BEAT_BUDGET && guard++ < 40) {
    bars(book, ep, 200, 1000 + guard * 300);
    const t = `b${guard}`;
    for (let i = 0; i < 3; i++) applyStoryEvent(book, ep, verdict(t, 0.2, 2000 + guard * 10 + i));
    selectStoryBeat(book, ep, { roll: mid });
  }
  assert.equal(ep.storyBeats, STORY_BEAT_BUDGET);
  bars(book, ep, 200, 9000);
  for (let i = 0; i < 3; i++) applyStoryEvent(book, ep, verdict('over', 0.2, 9500 + i));
  const late = selectStoryBeat(book, ep, { roll: mid });
  assert.ok(!late || late.cls === 'bed', 'past the budget: story is over; only the floor may speak');
});

ok('rule 8: a quiet room is a valid scene — no events, no patterns, no beat', () => {
  const { book, ep } = rig();
  assert.equal(selectStoryBeat(book, ep, { roll: mid }), null);
  applyStoryEvent(book, ep, { kind: 'room', verdict: 'THE CLASH', bar: 1 });
  assert.equal(selectStoryBeat(book, ep, { roll: mid }), null, 'a room change alone is not a beat');
});

// ── determinism + persistence ────────────────────────────────────────────────────────────────────────────────
ok('the same stream and the same rolls fold to the same book and the same beats, twice', () => {
  const stream = [
    verdict('density', 0.25, 1), { kind: 'proposal', assetId: 'fern', bar: 2 }, verdict('density', -0.2, 3),
    { kind: 'crown', n: 2, bar: 4 }, verdict('density', -0.2, 5), { kind: 'keep', seed: 9, paletteId: 'noir', bar: 6 },
    verdict('density', -0.2, 7), leanEv(['wetness'], 'drive', 8), leanEv(['evolve'], 'drive', 9),
    { kind: 'bloom', rolls: 30, bar: 10 },
  ];
  const run = () => {
    const { book, ep } = rig();
    let s = 12345;
    const roll = () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x80000000; };
    const beats = [];
    for (const ev of stream) {
      applyStoryEvent(book, ep, ev);
      applyStoryEvent(book, ep, { kind: 'bar', bar: 100 + beats.length });
      const b = selectStoryBeat(book, ep, { tiers: { davis: 4, lois: 4 }, roll });
      if (b) beats.push(b);
    }
    return { enc: encodeStoryBook(book), beats };
  };
  assert.deepEqual(run(), run());
});

ok('the book round-trips through its encoding, and junk decodes fail-closed, section by section', () => {
  const { book, ep } = rig();
  for (let i = 0; i < 3; i++) applyStoryEvent(book, ep, verdict('mud', -0.2, i + 1));
  applyStoryEvent(book, ep, leanEv(['wetness'], 'calm', 5));
  applyStoryEvent(book, ep, leanEv(['evolve'], 'calm', 6));
  selectStoryBeat(book, ep, { roll: mid }); // draw a bag down
  const enc = encodeStoryBook(book);
  assert.equal(encodeStoryBook(decodeStoryBook(enc)), enc, 'encode ∘ decode ∘ encode is stable');
  const back = decodeStoryBook(enc);
  assert.equal(back.grudges[0].topic, 'mud'); assert.equal(back.suspicion.anomalies.length, 1);
  assert.equal(decodeStoryBook('not json').sessions, 0);
  assert.equal(decodeStoryBook('{"v":2}').sessions, 0, 'a future version starts fresh rather than guessing');
  const partial = decodeStoryBook('{"v":1,"e":[999,0],"sus":{"v":500}}');
  assert.equal(partial.esteem.mood, 0, 'an out-of-range mood is refused, not clamped into the book');
  assert.equal(partial.suspicion.value, 0, 'an over-cap value is refused');
});

// ── the ledger sift ──────────────────────────────────────────────────────────────────────────────────────────
ok('siftLedgers finds the debt, the palette streak and the last ending — from rows, not vibes', () => {
  const pats = siftLedgers(
    [{ seed: 5, recipe: { paletteId: 'a' }, timestamp: '2026-01-03' },
     { seed: 6, recipe: { paletteId: 'noir' }, timestamp: '2026-01-04' },
     { seed: 7, recipe: { paletteId: 'noir' }, timestamp: '2026-01-05' },
     { seed: 8, recipe: { paletteId: 'noir' }, timestamp: '2026-01-06' }],
    [{ seed: 5, timestamp: '2026-01-01' }, { seed: 99, timestamp: '2026-01-02' }]);
  assert.deepEqual(pats.map((p) => p.kind), ['debt', 'streak', 'last-ending']);
  assert.equal(pats[0].seed, 5, 'seed 5 was passed, then kept: a debt');
  assert.equal(pats[1].count, 3);
  assert.equal(pats[2].seed, 8);
  assert.deepEqual(siftLedgers([], []), []);
  assert.deepEqual(siftLedgers([{ seed: 5, recipe: { paletteId: 'a' }, timestamp: '2026-01-01' }], [{ seed: 5, timestamp: '2026-01-02' }]),
    [{ kind: 'last-ending', seed: 5, paletteId: 'a' }], 'kept BEFORE the pass is no debt');
});

// ── the lore cold open (S4): a callback whose referent is a bank entry ─────────────────────────────────────────
ok('the cold open: a seeded on-this-day pattern fires as the callback, carrying its lore id and nothing else', () => {
  const { book, ep } = rig([{ kind: 'onthisday', loreId: 'otd-rauschenberg-born-1022' }]);
  const beat = selectStoryBeat(book, ep, { roll: mid });
  assert.ok(beat && beat.kind === 'callback' && beat.form === 'onthisday', 'the day opens the episode');
  assert.equal(beat.cls, 'story', 'it spends from the same story budget as any callback');
  assert.equal(beat.persona, 'davis', 'the generator hosts the opening');
  assert.deepEqual(beat.referent, { loreId: 'otd-rauschenberg-born-1022' }, 'the referent is the entry id — text lives in the bank, never in the machine');
  const quiet = rig();
  assert.equal(selectStoryBeat(quiet.book, quiet.ep, { roll: mid }), null, 'no pattern seeded, no cold open — silence is a valid opening');
});

console.log(`storyState.selfcheck: ${n} checks passed`);
