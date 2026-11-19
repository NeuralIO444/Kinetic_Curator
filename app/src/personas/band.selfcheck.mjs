// node src/personas/band.selfcheck.mjs
// #2387 (P7) — the band: solos, trades (agree / disagree / lay out), the bandleader's cut, the artist's hand, the
// QUEEN never soloing, the take's `band` section (fail-closed), replay determinism, the null (unruled) tuning law, the
// opt-in live adapter, and a pin on the tuning table's band shape.
//
// The shipped table's band numbers are NULL (Matt has not ruled them). Every behaviour below that needs numbers runs on
// FIXTURE — a table made up in this file, clearly marked, never exported, never reachable from shipped code.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Events, emit, on } from '../composition/eventBus.js';
import { TUNING_DEFAULTS, TUNING_SEATS, validateTuning } from './tuning.mjs';
import { personaIds } from './registry.mjs';
import {
  BAND_SEATS,
  BAND_SOLOISTS,
  BAND_ANSWERERS,
  BAND_HORNS,
  bandReadiness,
  bandRequirements,
  createBandState,
  stepBand,
  shiftedOdds,
  foldTurns,
  ownerAt,
} from './band.mjs';
import {
  createBandRecorder,
  checkBandRecord,
  bandConversation,
  bandOwnerAt,
  replayBandFrame,
  endBandReplay,
  setBandTap,
  rowOf,
  BAND_RECORD_VERSION,
} from './bandRecord.mjs';
import { startBand } from './bandLive.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// ── FIXTURE: a made-up, fully ruled table. Test-only. Nothing in the shipped code can reach it. ───────────
function fixture({ odds = {}, rate = 1, cut = 0.8, maxHorns = 3, first = {}, len = 3, heat = {}, rel = {}, cap = 0.1 } = {}) {
  const t = clone(TUNING_DEFAULTS);
  t.band = { tradeRate: rate, maxHornsPerCall: maxHorns, bandleaderCut: cut };
  for (const id of BAND_SOLOISTS) {
    t.personas[id].soloLengthPhrases = typeof len === 'object' ? len[id] : len;
    t.personas[id].stepCap = cap;
    t.personas[id].heat = id in heat ? heat[id] : 0.5;
  }
  for (const id of BAND_ANSWERERS) {
    const o = odds[id] ?? [0.4, 0.3, 0.3];
    t.personas[id].odds = { agree: o[0], disagree: o[1], layOut: o[2] };
    t.personas[id].answersFirst = first[id] ?? 'davis';
  }
  for (const k of Object.keys(t.relations)) t.relations[k] = 0;
  for (const [k, v] of Object.entries(rel)) t.relations[k] = v;
  assert.deepEqual(validateTuning(t), [], 'the fixture is a valid table');
  return t;
}
const LEAD = { davis: 1, carson: 0, greiman: 0, ashworth: 0 }; // heat: DAVIS always takes the solo

/** Play phrases 0..n-1, feeding each its ctx. Returns every turn and the final state. */
function play(tuning, { seed = 7, n: phrases = 12, ctx = () => ({}) } = {}) {
  let state = createBandState();
  const turns = [];
  for (let phrase = 0; phrase < phrases; phrase++) {
    const r = stepBand(state, { phrase, ...ctx(phrase) }, { seed, tuning });
    state = r.state;
    turns.push(...r.turns);
  }
  return { turns, state };
}
const tradeAt = (turns) => turns.find((t) => t.kind === 'trade');

// ── the tuning table's band shape (pin) ─────────────────────────────────────────────────────────────────────
ok('tuning pin: the shipped band section has exactly the spec keys, all null (unruled)', () => {
  assert.deepEqual(Object.keys(TUNING_DEFAULTS.band).sort(), ['bandleaderCut', 'maxHornsPerCall', 'tradeRate']);
  for (const v of Object.values(TUNING_DEFAULTS.band)) assert.equal(v, null);
  for (const id of TUNING_SEATS) {
    const p = TUNING_DEFAULTS.personas[id];
    for (const f of ['soloLengthPhrases', 'stepCap', 'heat', 'answersFirst']) assert.equal(p[f], null, `${id}.${f}`);
    assert.deepEqual(Object.keys(p.odds).sort(), ['agree', 'disagree', 'layOut']);
    for (const v of Object.values(p.odds)) assert.equal(v, null, `${id}.odds`);
  }
  for (const [k, v] of Object.entries(TUNING_DEFAULTS.relations)) assert.equal(v, null, k);
  assert.equal(Object.keys(TUNING_DEFAULTS.relations).length, 42);
});
ok('tuning pin: every path the band reads exists in the table, and the seats agree with the registry', () => {
  for (const p of bandRequirements()) {
    const v = p.split('.').reduce((o, k) => o?.[k], TUNING_DEFAULTS);
    assert.notEqual(v, undefined, p);
  }
  assert.equal(new Set(bandRequirements()).size, bandRequirements().length, 'no duplicate requirement');
  assert.deepEqual(Object.keys(BAND_SEATS).sort(), [...TUNING_SEATS].sort(), 'the band seats are the tuning seats');
  for (const id of Object.keys(BAND_SEATS)) assert.ok(personaIds().includes(id), `${id} is a registry persona`);
  assert.deepEqual(BAND_HORNS, ['carson', 'greiman', 'ashworth']);
  assert.deepEqual(BAND_SOLOISTS, ['davis', 'carson', 'greiman', 'ashworth']);
  assert.deepEqual(BAND_ANSWERERS, ['davis', 'lois', 'carson', 'greiman', 'ashworth']);
});

// ── null is unruled ─────────────────────────────────────────────────────────────────────────────────────────
ok('null tuning: on the shipped table the band does nothing — same state object, no turn, says what is missing', () => {
  const s0 = createBandState();
  const r = stepBand(s0, { phrase: 0 }, { seed: 1 });
  assert.equal(r.state, s0);
  assert.deepEqual(r.turns, []);
  assert.ok(Array.isArray(r.unruled) && r.unruled.length === bandRequirements().length, 'every required path is missing');
  const { turns, state } = play(TUNING_DEFAULTS, { n: 200 });
  assert.deepEqual(turns, []);
  assert.deepEqual(state, createBandState());
  assert.equal(bandReadiness().ready, false);
});
ok('null tuning: ONE null the band reads stops the whole band (no neutral fallback anywhere)', () => {
  for (const path of ['band.tradeRate', 'personas.carson.heat', 'personas.lois.odds.agree', 'relations.lois->davis', 'personas.ashworth.answersFirst']) {
    const t = fixture();
    const keys = path.split('.');
    let o = t;
    for (const k of keys.slice(0, -1)) o = o[k];
    o[keys[keys.length - 1]] = null;
    assert.equal(bandReadiness(t).ready, false, path);
    assert.deepEqual(play(t, { n: 20 }).turns, [], path);
  }
  assert.equal(bandReadiness(fixture()).ready, true);
  // a null the band does NOT read (LOIS has no solo) is not required
  const t = fixture();
  assert.equal(t.personas.lois.soloLengthPhrases, null);
  assert.equal(bandReadiness(t).ready, true);
  // a table that fails its schema is not ready either
  const bad = fixture();
  bad.band.tradeRate = 2;
  assert.deepEqual(bandReadiness(bad).missing, ['table']);
});

// ── the head, solos, the count-in and the ending ─────────────────────────────────────────────────────────────
ok('the bandleader counts in (the head plays first), then a soloist takes the next phrase', () => {
  const { turns } = play(fixture({ heat: LEAD }), { n: 3 });
  assert.deepEqual(turns[0], { kind: 'in', phrase: 0, by: 'governor' });
  assert.deepEqual(turns[1], { kind: 'solo', phrase: 1, by: 'davis', len: 3, cap: 0.1 });
});
ok('a solo is one persona, one small capped step, for the tuned run of phrases; then the next takes it', () => {
  const t = fixture({ heat: LEAD, rate: 0, len: 2 });
  const { turns } = play(t, { n: 8 });
  const solos = turns.filter((x) => x.kind === 'solo');
  assert.deepEqual(solos.map((x) => x.phrase), [1, 3, 5, 7], 'a solo every len phrases when no trade intervenes');
  assert.ok(solos.every((x) => x.len === 2 && x.cap === 0.1));
  assert.equal(ownerAt(turns, 2), 'davis');
  assert.equal(ownerAt(turns, 0), null, 'nobody owns the head');
});
ok('heat weighs who solos: a seat with zero heat never does; all-zero heat plays no solo', () => {
  const t = fixture({ heat: { davis: 0, carson: 1, greiman: 0, ashworth: 0 }, rate: 0, len: 1 });
  const who = new Set(play(t, { n: 30 }).turns.filter((x) => x.kind === 'solo').map((x) => x.by));
  assert.deepEqual([...who], ['carson']);
  assert.deepEqual(play(fixture({ heat: { davis: 0, carson: 0, greiman: 0, ashworth: 0 } }), { n: 10 }).turns.filter((x) => x.kind === 'solo'), []);
});
ok('the bandleader calls the ending; the next phrase counts in again', () => {
  const { turns } = play(fixture({ heat: LEAD }), { n: 7, ctx: (p) => ({ ending: p === 4 }) });
  assert.deepEqual(turns.filter((x) => x.kind === 'out'), [{ kind: 'out', phrase: 4, by: 'governor' }]);
  assert.equal(turns.find((x) => x.phrase === 5)?.kind, 'in', 'counted in again');
  assert.equal(ownerAt(turns, 4), null);
  assert.equal(foldTurns(turns.filter((x) => x.phrase <= 4)).started, false);
});
ok('a phrase already played is never played twice', () => {
  const t = fixture({ heat: LEAD });
  const a = stepBand(createBandState(), { phrase: 3 }, { seed: 1, tuning: t });
  const b = stepBand(a.state, { phrase: 3 }, { seed: 1, tuning: t });
  assert.equal(b.state, a.state);
  assert.deepEqual(b.turns, []);
  assert.deepEqual(stepBand(a.state, { phrase: 1 }, { seed: 1, tuning: t }).turns, []);
  assert.deepEqual(stepBand(a.state, { phrase: -1 }, { seed: 1, tuning: t }).turns, []);
});

// ── trades: the three verdicts ───────────────────────────────────────────────────────────────────────────────
ok('verdict AGREE: the room builds on the call; the soloist keeps the solo', () => {
  const t = fixture({ heat: LEAD, len: 4, odds: Object.fromEntries(BAND_ANSWERERS.map((id) => [id, [1, 0, 0]])) });
  const tr = tradeAt(play(t, { n: 6 }).turns);
  assert.equal(tr.by, 'davis');
  assert.ok(tr.answers.length === 4 && tr.answers.every((a) => a.verdict === 'agree' && a.move === 'build'));
  assert.equal(tr.owner, 'davis');
  assert.equal('len' in tr, false, 'no hand-over, no new run');
  assert.deepEqual(tr.answers.map((a) => a.by).sort(), ['ashworth', 'carson', 'greiman', 'lois']);
});
ok('verdict DISAGREE (counter-move): the first counter-mover takes the solo with its own run and cap', () => {
  const t = fixture({
    heat: LEAD,
    len: { davis: 4, carson: 5, greiman: 6, ashworth: 2 },
    odds: { lois: [0, 0, 1], carson: [0, 1, 0], greiman: [0, 1, 0], ashworth: [1, 0, 0] },
  });
  const { turns } = play(t, { n: 3 }); // phrases 0..2: in, solo, the first trade (a later trade would chain on)
  const tr = tradeAt(turns);
  assert.deepEqual(tr.answers.map((a) => [a.by, a.verdict, a.move]), [
    ['lois', 'layOut', 'rest'],
    ['carson', 'disagree', 'counter'],
    ['greiman', 'disagree', 'counter'],
    ['ashworth', 'agree', 'build'],
  ]);
  assert.equal(tr.owner, 'carson');
  assert.equal(tr.len, 5);
  assert.equal(tr.cap, 0.1);
  assert.equal(ownerAt(turns, tr.phrase), 'carson');
  assert.equal(ownerAt(turns, tr.phrase + 4), 'carson');
  assert.equal(ownerAt(turns, tr.phrase + 5), null, 'the run elapses');
});
ok('verdict DISAGREE (cut): LOIS disagreeing is the cut — the solo ends, even over a counter-move', () => {
  const t = fixture({
    heat: LEAD,
    odds: { lois: [0, 1, 0], carson: [0, 1, 0], greiman: [0, 0, 1], ashworth: [0, 0, 1] },
  });
  const { turns } = play(t, { n: 4 });
  const tr = tradeAt(turns);
  assert.deepEqual(tr.answers[0], { by: 'lois', verdict: 'disagree', move: 'cut' });
  assert.equal(tr.owner, null);
  assert.equal(ownerAt(turns, tr.phrase), null);
  assert.ok(tr.answers.some((a) => a.by === 'carson' && a.move === 'counter'), 'the counter is on the record but the cut wins');
});
ok('verdict LAY OUT: everyone rests; the soloist keeps the solo', () => {
  const t = fixture({ heat: LEAD, len: 4, odds: Object.fromEntries(BAND_ANSWERERS.map((id) => [id, [0, 0, 1]])) });
  const tr = tradeAt(play(t, { n: 6 }).turns);
  assert.ok(tr.answers.every((a) => a.verdict === 'layOut' && a.move === 'rest'));
  assert.equal(tr.owner, 'davis');
});
ok('relation bias shifts the odds: +1 kills disagreement, -1 kills agreement; null-free, bounded', () => {
  assert.deepEqual(shiftedOdds({ agree: 0.5, disagree: 0.5, layOut: 0 }, 1), [1, 0, 0]);
  assert.deepEqual(shiftedOdds({ agree: 0.5, disagree: 0.5, layOut: 0 }, -1), [0, 1, 0]);
  assert.deepEqual(shiftedOdds({ agree: 0.4, disagree: 0.3, layOut: 0.3 }, 0), [0.4, 0.3, 0.3]);
  assert.deepEqual(shiftedOdds({ agree: 0, disagree: 0, layOut: 0 }, 0), [0, 0, 1]);
  assert.deepEqual(shiftedOdds({ agree: 0.5, disagree: 0.5, layOut: 0 }, 9), [1, 0, 0], 'out-of-range bias is clamped');
  const odds = Object.fromEntries(BAND_ANSWERERS.map((id) => [id, [0.5, 0.5, 0]]));
  const up = fixture({ heat: LEAD, odds, rel: { 'carson->davis': 1, 'lois->davis': -1 } });
  for (let seed = 1; seed <= 40; seed++) {
    const tr = tradeAt(play(up, { seed, n: 4 }).turns);
    assert.equal(tr.answers.find((a) => a.by === 'carson').verdict, 'agree');
    assert.equal(tr.answers.find((a) => a.by === 'lois').verdict, 'disagree');
  }
});
ok('trade rate: 0 never trades, 1 trades the phrase after the solo started; the odds follow the seed', () => {
  assert.equal(tradeAt(play(fixture({ heat: LEAD, rate: 0, len: 6 }), { n: 12 }).turns), undefined);
  const t = fixture({ heat: LEAD, rate: 1, len: 6 });
  assert.equal(tradeAt(play(t, { n: 12 }).turns).phrase, 2);
  const half = fixture({ heat: LEAD, rate: 0.5, len: 6, odds: Object.fromEntries(BAND_ANSWERERS.map((id) => [id, [0, 0, 1]])) });
  const counts = new Set();
  for (let seed = 1; seed <= 30; seed++) counts.add(play(half, { seed, n: 12 }).turns.filter((x) => x.kind === 'trade').length);
  assert.ok(counts.size > 1, 'different seeds trade a different number of times');
});
ok('max horns answering one call is honoured; DAVIS and LOIS never count against it', () => {
  for (const cap of [0, 1, 2, 3]) {
    const t = fixture({ heat: LEAD, maxHorns: cap });
    for (let seed = 1; seed <= 10; seed++) {
      const tr = tradeAt(play(t, { seed, n: 4 }).turns);
      assert.equal(tr.answers.filter((a) => BAND_HORNS.includes(a.by)).length, cap);
      assert.ok(tr.answers.some((a) => a.by === 'lois'));
    }
  }
  const t = fixture({ heat: { davis: 0, carson: 1, greiman: 0, ashworth: 0 }, maxHorns: 0 });
  const tr = tradeAt(play(t, { n: 4 }).turns);
  assert.deepEqual(tr.answers.map((a) => a.by).sort(), ['davis', 'lois'], 'a horn calling: DAVIS and LOIS answer');
});
ok('who answers first: the seats whose answersFirst is the caller go first, then the rest in cast order', () => {
  const t = fixture({ heat: LEAD, first: { lois: 'carson', carson: 'lois', greiman: 'lois', ashworth: 'davis' } });
  assert.deepEqual(tradeAt(play(t, { n: 4 }).turns).answers.map((a) => a.by), ['ashworth', 'lois', 'carson', 'greiman']);
});

// ── the seats ────────────────────────────────────────────────────────────────────────────────────────────────
ok('the QUEEN never solos and never answers; the GOVERNOR only counts in, ends and cuts', () => {
  assert.equal(BAND_SEATS.queen.solos, false);
  assert.equal(BAND_SEATS.queen.answers, false);
  assert.equal(BAND_SEATS.queen.sways, 'timing');
  for (const seed of [1, 2, 3, 99, 4242]) {
    const t = fixture({ rate: 0.7, len: 2, cut: 0.5 });
    const { turns } = play(t, { seed, n: 400, ctx: (p) => ({ pressure: (p % 7) / 10, ending: p % 53 === 52 }) });
    assert.ok(turns.length > 100);
    for (const x of turns) {
      assert.notEqual(x.by, 'queen');
      if (['solo', 'trade'].includes(x.kind)) assert.ok(BAND_SOLOISTS.includes(x.by), `${x.kind} by ${x.by}`);
      if (x.kind === 'trade') for (const a of x.answers) assert.ok(BAND_ANSWERERS.includes(a.by) && a.by !== x.by);
      if (['in', 'out', 'cut'].includes(x.kind)) assert.equal(x.by, 'governor');
      if (x.kind === 'yield') assert.equal(x.by, 'artist');
    }
    for (const x of turns) {
      assert.equal(x.kind === 'solo' && x.by === 'lois', false, 'LOIS never takes a solo');
      if (x.kind === 'trade') assert.ok(x.answers.every((a) => a.move !== 'counter' || a.by !== 'lois'));
    }
  }
});
ok('the GOVERNOR cuts a solo the room cannot afford, and no one solos while it cannot', () => {
  const t = fixture({ heat: LEAD, rate: 0, len: 8, cut: 0.5 });
  const { turns } = play(t, { n: 8, ctx: (p) => ({ pressure: p === 3 || p === 4 ? 0.9 : 0.1 }) });
  const cut = turns.find((x) => x.kind === 'cut');
  assert.deepEqual(cut, { kind: 'cut', phrase: 3, by: 'governor', target: 'davis' });
  assert.equal(ownerAt(turns, 3), null);
  assert.equal(turns.filter((x) => x.phrase === 4).length, 0, 'still pressed: no new solo');
  assert.equal(turns.find((x) => x.phrase === 5)?.kind, 'solo', 'the room breathes: a solo again');
  // the cut line is the tuned number: at exactly the line it cuts, just under it does not
  const line = fixture({ heat: LEAD, rate: 0, len: 8, cut: 0.5 });
  assert.equal(play(line, { n: 4, ctx: () => ({ pressure: 0.5 }) }).turns.some((x) => x.kind === 'cut'), false, 'pressed from the start: never solos, so nothing to cut');
  assert.equal(play(line, { n: 4, ctx: (p) => ({ pressure: p >= 2 ? 0.49 : 0 }) }).turns.some((x) => x.kind === 'cut'), false);
  assert.equal(play(line, { n: 4, ctx: (p) => ({ pressure: p >= 2 ? 0.5 : 0 }) }).turns.some((x) => x.kind === 'cut'), true);
});

// ── the artist always wins ───────────────────────────────────────────────────────────────────────────────────
ok('a user KEEP wins over any solo: the band yields that phrase, the solo ends, then it plays on', () => {
  const t = fixture({ heat: LEAD, rate: 0, len: 8 });
  const { turns } = play(t, { n: 6, ctx: (p) => ({ hold: { keep: p === 3 } }) });
  assert.deepEqual(turns.find((x) => x.kind === 'yield'), { kind: 'yield', phrase: 3, by: 'artist', why: 'keep', ended: 'davis' });
  assert.equal(ownerAt(turns, 3), null);
  assert.equal(turns.filter((x) => x.phrase === 3).length, 1, 'nothing else plays in a held phrase');
  assert.equal(turns.find((x) => x.phrase === 4)?.kind, 'solo');
});
ok('a user LOCK wins: a lock on everything silences the band; a lock on a persona keeps them out of solos and answers', () => {
  const t = fixture({ heat: LEAD, rate: 0, len: 8 });
  const all = play(t, { n: 6, ctx: (p) => ({ hold: { lock: p === 3 } }) });
  assert.deepEqual(all.turns.find((x) => x.kind === 'yield'), { kind: 'yield', phrase: 3, by: 'artist', why: 'lock', ended: 'davis' });
  // a held band stays silent while the hold stands, from the very first phrase (no count-in either)
  assert.deepEqual(play(t, { n: 6, ctx: () => ({ hold: { keep: true } }) }).turns, []);
  assert.deepEqual(play(t, { n: 6, ctx: () => ({ hold: { lock: true } }) }).turns, []);
  // a lock on the soloist ends their solo and someone else takes it; they never solo again while locked
  const mixed = fixture({ rate: 0, len: 2 });
  const r = play(mixed, { n: 60, ctx: (p) => ({ hold: { lock: p >= 2 ? ['davis'] : [] } }) });
  const late = r.turns.filter((x) => x.phrase >= 2);
  assert.ok(late.every((x) => x.kind !== 'solo' || x.by !== 'davis'), 'DAVIS locked out of every later solo');
  // a lock on an answerer: they do not answer; locked horns are out of the trade
  const tr = tradeAt(play(fixture({ heat: LEAD }), { n: 4, ctx: () => ({ hold: { lock: ['carson', 'lois'] } }) }).turns);
  assert.deepEqual(tr.answers.map((a) => a.by).sort(), ['ashworth', 'greiman']);
});
ok('a lock on the standing soloist yields their solo at once', () => {
  const t = fixture({ heat: LEAD, rate: 0, len: 8 });
  const { turns } = play(t, { n: 5, ctx: (p) => ({ hold: { lock: p === 3 ? ['davis'] : [] } }) });
  assert.deepEqual(turns.find((x) => x.kind === 'yield'), { kind: 'yield', phrase: 3, by: 'artist', why: 'lock', ended: 'davis' });
  assert.equal(ownerAt(turns, 3), null, 'the only heat is DAVIS, locked: no one else takes it');
});

// ── the take's record ────────────────────────────────────────────────────────────────────────────────────────
const rich = fixture({ rate: 0.8, len: 2, cut: 0.5 });
const richCtx = (p) => ({ pressure: p % 11 === 10 ? 0.9 : 0, hold: { keep: p === 17 }, ending: p === 29 });
const liveRun = (seed = 11) => play(rich, { seed, n: 60, ctx: richCtx });
function record(turns, seed = 11) {
  let frame = 0;
  const rec = createBandRecorder({ getFrame: () => frame, seed });
  for (const t of turns) {
    frame = t.phrase * 480;
    rec.update(t);
  }
  return rec.finish();
}
ok('the take records every turn (who played, who answered, verdict) and the section validates', () => {
  const { turns } = liveRun();
  const kinds = new Set(turns.map((x) => x.kind));
  for (const k of ['in', 'out', 'solo', 'trade', 'cut', 'yield']) assert.ok(kinds.has(k), `the run covers ${k}`);
  const section = record(turns);
  assert.equal(section.version, BAND_RECORD_VERSION);
  assert.equal(section.seed, 11);
  assert.equal(section.turns.length, turns.length);
  const trade = section.turns.find((r) => r[2] === 'trade');
  assert.ok(Array.isArray(trade[4].answers) && trade[4].answers.every((a) => a.length === 3), 'answers: [who, verdict, move]');
  assert.ok(checkBandRecord(section));
  assert.equal(createBandRecorder().finish(), undefined, 'no turn, no section');
});
ok('REPLAY: same seed + same take = the same conversation, exactly (and the state folds back to the same band)', () => {
  const a = liveRun(11);
  const b = liveRun(11);
  assert.deepEqual(a.turns, b.turns, 'same seed, same chart: same turns');
  const section = record(a.turns);
  const json = JSON.parse(JSON.stringify(section)); // through a file
  assert.deepEqual(bandConversation(json), a.turns, 'the take replays the conversation it recorded');
  assert.deepEqual(foldTurns(bandConversation(json)), foldTurns(a.turns));
  for (const p of [0, 1, 2, 7, 20, 40, 59]) assert.equal(bandOwnerAt(json, p), ownerAt(a.turns, p), `owner at phrase ${p}`);
  const c = liveRun(12);
  assert.notDeepEqual(c.turns, a.turns, 'a different seed is a different conversation');
});
ok('REPLAY on the bus: playback re-publishes each row at its frame with cause replay, never plays a turn of its own', () => {
  const a = liveRun(11);
  const section = JSON.parse(JSON.stringify(record(a.turns)));
  const heard = [];
  const off = on(Events.BAND_TURN, (p, meta) => heard.push([p, meta && meta.cause]));
  endBandReplay();
  const total = section.turns[section.turns.length - 1][0];
  let published = 0;
  for (let f = 0; f <= total; f += 1) published += replayBandFrame(f, section);
  assert.equal(published, a.turns.length);
  assert.deepEqual(heard.map((h) => h[0]), a.turns);
  assert.ok(heard.every((h) => h[1] === 'replay'));
  // a seek lands the cursor and re-says nothing from before it
  heard.length = 0;
  endBandReplay();
  replayBandFrame(20 * 480, section, { seeked: true });
  assert.ok(heard.every((h) => h[0].phrase >= 20));
  heard.length = 0;
  assert.equal(replayBandFrame(0, null), 0);
  assert.equal(replayBandFrame(5, undefined), 0, 'a take with no band section says nothing');
  assert.equal(replayBandFrame(5, { version: 9 }), 0, 'a malformed section says nothing');
  assert.deepEqual(heard, []);
  endBandReplay();
  off();
});
ok('the check is fail-closed: every kind of bad section is refused whole; older takes (no band section) still load', () => {
  const section = JSON.parse(JSON.stringify(record(liveRun().turns)));
  const bad = (mut) => {
    const s = JSON.parse(JSON.stringify(section));
    mut(s);
    return checkBandRecord(s);
  };
  assert.equal(checkBandRecord(undefined), null);
  assert.equal(checkBandRecord(null), null);
  assert.equal(checkBandRecord({}), null);
  assert.deepEqual(bandConversation(undefined), [], 'a take from before the band has no conversation');
  assert.equal(bad((s) => (s.version = 2)), null);
  assert.equal(bad((s) => (s.seed = -1)), null);
  assert.equal(bad((s) => (s.seed = 1.5)), null);
  assert.equal(bad((s) => (s.turns = 'x')), null);
  assert.equal(bad((s) => s.turns.push([0, 0, 'x', 'y', null])), null, 'unknown kind');
  assert.equal(bad((s) => (s.turns[0][3] = 'davis')), null, 'the count-in is the bandleader');
  assert.equal(bad((s) => s.turns.reverse()), null, 'out of order');
  assert.equal(bad((s) => (s.turns[1][0] = s.turns[0][0] - 1)), null, 'frames go backwards');
  const iTrade = section.turns.findIndex((r) => r[2] === 'trade');
  assert.ok(iTrade > 0);
  assert.equal(bad((s) => (s.turns[iTrade][4].owner = 'ashworth')), null, 'a hand-over the answers do not say');
  assert.equal(bad((s) => (s.turns[iTrade][4].answers[0][0] = 'queen')), null, 'the QUEEN does not answer');
  assert.equal(bad((s) => (s.turns[iTrade][4].answers[0][0] = s.turns[iTrade][3])), null, 'no answering yourself');
  assert.equal(bad((s) => s.turns[iTrade][4].answers.push(s.turns[iTrade][4].answers[0])), null, 'one answer each');
  assert.equal(bad((s) => (s.turns[iTrade][4].answers[0][1] = 'maybe')), null, 'unknown verdict');
  assert.equal(bad((s) => (s.turns[iTrade][4].answers[0][2] = 'rest')), null, 'verdict and move must agree');
  assert.equal(bad((s) => (s.turns[iTrade][3] = 'lois')), null, 'LOIS does not call');
  assert.equal(bad((s) => (s.turns[iTrade][3] = 'queen')), null, 'the QUEEN does not call');
  const iSolo = section.turns.findIndex((r) => r[2] === 'solo');
  assert.equal(bad((s) => (s.turns[iSolo][3] = 'queen')), null, 'the QUEEN never solos');
  assert.equal(bad((s) => (s.turns[iSolo][3] = 'lois')), null, 'LOIS never solos');
  assert.equal(bad((s) => (s.turns[iSolo][4].len = 0)), null);
  assert.equal(bad((s) => (s.turns[iSolo][4].cap = -1)), null);
  assert.equal(bad((s) => (s.turns[iSolo][4].extra = 1)), null, 'unknown field');
  assert.equal(bad((s) => s.turns.splice(iSolo, 0, JSON.parse(JSON.stringify(s.turns[iSolo])))), null, 'a solo while one stands');
  assert.equal(bad((s) => (s.turns[section.turns.findIndex((r) => r[2] === 'cut')][4].target = 'lois')), null);
  assert.equal(bad((s) => (s.turns[section.turns.findIndex((r) => r[2] === 'yield')][4].why = 'whim')), null);
  assert.equal(bad((s) => (s.turns[section.turns.findIndex((r) => r[2] === 'out')][3] = 'queen')), null);
  // a trade with no solo standing (the count-in and then straight to a call) is refused
  const lone = { version: 1, seed: 1, turns: [[0, 0, 'in', 'governor', null], [1, 1, 'trade', 'davis', { answers: [['lois', 'layOut', 'rest']], owner: 'davis' }]] };
  assert.equal(checkBandRecord(lone), null);
  // and a valid one passes
  const fine = { version: 1, seed: 1, turns: [[0, 0, 'in', 'governor', null], [5, 1, 'solo', 'davis', { len: 2, cap: 0 }]] };
  assert.ok(checkBandRecord(fine));
  assert.ok(checkBandRecord({ version: 1, seed: 0, turns: [] }));
  // the recorder refuses to write a malformed turn
  const rec = createBandRecorder({ seed: 1 });
  rec.update({ kind: 'solo', phrase: 0, by: 'queen', len: 1, cap: 0 });
  rec.update({ kind: 'trade', phrase: 2, by: 'davis', answers: [], owner: 'davis' });
  assert.equal(rec.finish(), undefined);
  assert.ok(rowOf(3.9, { kind: 'in', phrase: 0, by: 'governor' })[0] === 3);
});

// ── the live adapter: opt-in, default off ────────────────────────────────────────────────────────────────────
function harness(opts) {
  const heard = [];
  const taps = [];
  const off = on(Events.BAND_TURN, (p, meta) => heard.push([p, meta && meta.cause]));
  setBandTap((t) => taps.push(t));
  const stop = startBand({ getSeed: () => 11, ...opts });
  const bars = (list) => list.forEach((bar) => emit(Events.CLOCK_BAR, { bar }));
  return {
    heard,
    taps,
    bars,
    done() {
      stop();
      setBandTap(null);
      off();
    },
  };
}
ok('live: band OFF (the default) publishes and records nothing; byte-identical behaviour', () => {
  assert.notEqual(globalThis.__KC_BAND, true, 'the flag is off in this process');
  const h = harness({ getTuning: () => fixture({ heat: LEAD }) }); // even with a ruled table: off is off
  h.bars([0, 4, 8, 12, 16, 20]);
  assert.deepEqual(h.heard, []);
  assert.deepEqual(h.taps, []);
  h.done();
});
ok('live: band ON with the SHIPPED table (unruled) plays nothing and says how many numbers are missing', () => {
  const h = harness({ enabled: () => true });
  h.bars([0, 4, 8, 12, 16, 20, 24]);
  assert.deepEqual(h.heard, []);
  assert.deepEqual(h.taps, []);
  h.done();
});
ok('live: band ON with a ruled table plays on phrase boundaries only, announces and records each turn', () => {
  const t = fixture({ heat: LEAD, len: 3 });
  const h = harness({ enabled: () => true, getTuning: () => t });
  h.bars([0, 1, 2, 3, 4, 5, 8, 9, 12]);
  const expected = play(t, { seed: 11, n: 4 }).turns; // bars 0,4,8,12 = phrases 0..3
  assert.deepEqual(h.heard.map((x) => x[0]), expected);
  assert.ok(h.heard.every((x) => x[1] === 'band'));
  assert.deepEqual(h.taps, expected);
  assert.deepEqual(h.taps, play(t, { seed: 11, n: 4 }).turns, 'live = pure: same seed, same conversation');
  h.done();
});
ok('live: muted while a take plays; a bar counter that goes backwards starts a fresh band (counted in again)', () => {
  let replaying = true;
  const t = fixture({ heat: LEAD });
  const h = harness({ enabled: () => true, getTuning: () => t, isReplaying: () => replaying });
  h.bars([0, 4, 8]);
  assert.deepEqual(h.heard, []);
  replaying = false;
  h.bars([12, 16]);
  assert.equal(h.heard.length, 2);
  assert.equal(h.heard[0][0].kind, 'in');
  h.bars([0]);
  assert.equal(h.heard[2][0].kind, 'in', 'REC restarted the scene: a new count-in');
  h.done();
});
ok('live: the artist\'s hand and the room reach the band: a keep yields, silence ends the tune, pressure cuts', () => {
  const t = fixture({ heat: LEAD, rate: 0, len: 9, cut: 0.5 });
  let hold = {};
  let pressure = 0;
  const h = harness({ enabled: () => true, getTuning: () => t, getHold: () => hold, getPressure: () => pressure });
  h.bars([0, 4]); // in, solo
  hold = { keep: true };
  h.bars([8]);
  hold = {};
  h.bars([12]); // a new solo
  pressure = 0.9;
  h.bars([16]); // cut
  pressure = 0;
  emit(Events.AUDIO_SILENCE_START, {});
  h.bars([20]); // out
  emit(Events.AUDIO_SILENCE_END, {});
  h.bars([24]); // in
  assert.deepEqual(h.heard.map((x) => x[0].kind), ['in', 'solo', 'yield', 'solo', 'cut', 'out', 'in']);
  h.done();
});
ok('live: a throwing reader does not break the clock', () => {
  const t = fixture({ heat: LEAD });
  const h = harness({ enabled: () => true, getTuning: () => t, getPressure: () => { throw new Error('x'); } });
  h.bars([0, 4]);
  assert.deepEqual(h.heard, []);
  h.done();
});

// ── structure: the byte-identity rails and the laws ──────────────────────────────────────────────────────────
ok('band off = byte-identical: the take section declines to start while the band is off, behind the opt-in flag', () => {
  const btn = read('../components/PerformanceButton.jsx').replace(/\s+/g, ' ');
  assert.match(btn, /band: bandSection/);
  assert.match(btn, /const bandSection = \(getFrame\) => \{ if \(!bandOn\(\)\) return null;/, 'the factory declines while the band is off');
  assert.match(read('../gl/performanceCapture.mjs'), /if \(made\) sections\[name\] = made;/, 'a declined section is absent, not null');
  const live = read('./bandLive.js');
  assert.match(live, /globalThis\.__KC_BAND === true/);
  assert.match(live, /if \(isReplaying\(\) \|\| !enabled\(\)\) return;/, 'off acts on nothing');
});
ok('laws: no Math.random or Date in the band, no store or project import, no surface strings, tuning never saved', () => {
  for (const f of ['band.mjs', 'bandRecord.mjs', 'bandLive.js']) {
    const src = read(`./${f}`);
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /Math\.random|Date\.now|new Date|performance\.now/, f);
    assert.doesNotMatch(code, /state\/|useStore|projectDocument|localStorage/, `${f} never touches the store or a saved document`);
    assert.doesNotMatch(code, /['"`][^'"`\n]*\b(Tina|Bowie|Turner|David Bowie|Joshua|George Lois)\b[^'"`\n]*['"`]/, `${f}: no real name in a string`);
  }
  const bandCode = read('./band.mjs').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(bandCode, /['"`](QUEEN|GOVERNOR)['"`]/, 'QUEEN and GOVERNOR are never named');
  assert.doesNotMatch(read('../state/projectDocument.js'), /personas\/tuning|personas\/band/, 'a project never saves the table or the band');
});
ok('no new room-matrix axis: the band file touches neither the matrix nor the room codes', () => {
  for (const f of ['band.mjs', 'bandRecord.mjs', 'bandLive.js']) {
    assert.doesNotMatch(read(`./${f}`), new RegExp(['directors' + 'Matrix', 'room' + 'Codes', 'dir' + 'ectorTable'].join('|')), f);
  }
});

console.log(`band.selfcheck: ${n} checks passed`);
