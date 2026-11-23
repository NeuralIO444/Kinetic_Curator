// node src/curator/fieldRevision.selfcheck.mjs
// #2151 — the standing poem's critical pass (Matt's rulings, 2026-11-12/17):
// a standing poem that reads EMPTY (the cover register) or CROWDED (the
// interior register) draws a revision request from LOIS/DAVIS — CARSON
// reads the cover pole, ASHWORTH the interior — and the poem answers
// through its own machinery only: a re-deal toward the other pole from
// the same poet's register cache, through landPoem. Pressure follows the
// user's hands: HOT (smashing KINETIC) is variety mode and draws no
// requests, FIDDLING silences them, a user change overrides a pending
// one, and a form gets one bite — never nagged twice. Supply: the
// register caches deal through the supply (the decks untouched); a
// one-word poem is exempt from the FIELD minimum and is placed PUSHED;
// a Japanese cover deals in the native face whatever its length; every
// other piece keeps the minimum.
import assert from 'node:assert/strict';
import { useStore } from '../state/store.js';
import { resetDirector } from '../curator/director.js';
import { choosePoet } from '../curator/fieldDirector.js';
import {
  fieldDealReport,
  fieldFormForDeal,
  sanitizeFieldForm,
  gateFieldForm,
  POET_DECKS,
  POET_REGISTERS,
} from '../poets/fieldForm.js';
import { placePiece } from '../poets/placement.js';
import { poemIdentity, poemFormKey } from '../poets/poemRow.mjs';
import { judgeStandingPoem, classifyTempo, pickRevisionDecision, FIELD_REVISION_KNOBS } from './fieldRevision.mjs';
import { startFieldRevision } from './fieldRevisionLive.js';
import { mkRng } from '../engine/prng.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const lcg = (s) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const S = () => useStore.getState();
const deal = (poetId, pieceId, seed = 3, extra = {}) => fieldFormForDeal({ poetId, pieceId, ...extra }, mkRng(seed));
const GIBSON_BETWEEN = ['w8', 'w9', 'w10'];

// ---------------------------------------------------------------- the judge
ok(
  'the judge reads registers, not counts: cover is empty (CARSON), interior is crowded (ASHWORTH), the middle is fine',
  () => {
    assert.deepEqual(judgeStandingPoem(deal('gibson', 'w5')), { read: 'empty', doctrine: 'carson', register: 'cover' });
    assert.deepEqual(judgeStandingPoem(deal('gibson', 'w11')), {
      read: 'crowded',
      doctrine: 'ashworth',
      register: 'interior',
    });
    assert.equal(judgeStandingPoem(deal('gibson', 'w8')).read, 'fine', 'between reads fine');
    assert.equal(judgeStandingPoem(deal('gibson', 'w1')).read, 'fine', 'a deck piece lives between the poles');
    assert.equal(
      judgeStandingPoem(deal('teijo', 't7', 3, { script: 'kana' })).read,
      'empty',
      'a Japanese cover reads empty',
    );
    assert.equal(judgeStandingPoem(null), null);
    assert.equal(judgeStandingPoem({ poetId: 'nobody', pieceId: 'x' }), null);
  },
);

// ---------------------------------------------------------------- the tempo
ok('tempo: hot is smashing, fiddling is hands on the controls, away is an empty room, watching is the rest', () => {
  const base = { away: false, rollsLastMinute: 0, lastTweak: null, undoBurstSize: 0, now: 100000 };
  assert.equal(classifyTempo({ ...base, rollsLastMinute: FIELD_REVISION_KNOBS.hotRollsPerMin }, 100000), 'hot');
  assert.equal(
    classifyTempo({ ...base, rollsLastMinute: FIELD_REVISION_KNOBS.hotRollsPerMin - 1 }, 100000),
    'watching',
  );
  assert.equal(classifyTempo({ ...base, lastTweak: { ts: 100000 - 1000, key: 'count' } }, 100000), 'fiddling');
  assert.equal(
    classifyTempo(
      { ...base, lastTweak: { ts: 100000 - FIELD_REVISION_KNOBS.fiddleWindowMs - 1, key: 'count' } },
      100000,
    ),
    'watching',
    'an old tweak is not fiddling',
  );
  assert.equal(
    classifyTempo({ ...base, undoBurstSize: 2 }, 100000),
    'fiddling',
    'a live undo burst is hands on the wheel',
  );
  assert.equal(
    classifyTempo({ ...base, away: true, rollsLastMinute: 99 }, 100000),
    'away',
    'away outranks hot: nobody is watching',
  );
  assert.equal(classifyTempo(null, 100000), 'away', 'no feed, no watcher');
  assert.equal(classifyTempo(base, 100000), 'watching');
});

// ---------------------------------------------------------------- the answer pick
ok(
  'the answer: same poet, toward the other pole (the middle first), never the standing piece, deterministic per stream',
  () => {
    const cover = deal('gibson', 'w5');
    const d1 = pickRevisionDecision(cover, lcg(7));
    assert.equal(d1.poetId, 'gibson');
    assert.ok(GIBSON_BETWEEN.includes(d1.pieceId), `cover answers from the middle band (got ${d1.pieceId})`);
    assert.deepEqual(pickRevisionDecision(cover, lcg(7)), d1, 'same stream, same answer');
    const inside = deal('gibson', 'w12');
    const d2 = pickRevisionDecision(inside, lcg(7));
    assert.ok(GIBSON_BETWEEN.includes(d2.pieceId), 'crowded answers from the middle band too');
    assert.equal(pickRevisionDecision(deal('gibson', 'w8'), lcg(7)), null, 'a fine poem has nothing to answer');
    assert.equal(pickRevisionDecision(deal('gibson', 'w1'), lcg(7)), null, 'a deck poem has nothing to answer');
    const kanaCover = deal('teijo', 't6', 3, { script: 'kana' });
    const d3 = pickRevisionDecision(kanaCover, lcg(7));
    assert.equal(d3.script, 'kana', 'a poem standing in the native face is answered in the native face');
    assert.equal(d3.poetId, 'teijo');
  },
);

// ---------------------------------------------------------------- the supply deals
ok('supply: a one-word poem deals under its exemption — and stands pushed, gate-clean, door-fixed', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const rep = fieldDealReport({ poetId: 'gibson', pieceId: 'w5' }, lcg(seed));
    assert.ok(rep.form, `w5 seed ${seed}: the one-word exemption deals it (10 stamps, under the minimum)`);
    assert.equal(rep.form.stamps.length, 10);
    assert.ok(gateFieldForm(rep.form.stamps, { aspect: rep.form.aspect }).ok, 'the gate passes the pushed form');
    assert.deepEqual(sanitizeFieldForm(rep.form), rep.form, 'the dealt form is a fixed point of the door');
  }
  const piece = POET_REGISTERS.gibson.find((p) => p.id === 'w5');
  const plain = placePiece(piece, lcg(5));
  const pushed = placePiece(piece, lcg(5), { push: true });
  const mean = (ss) => ss.reduce((a, s) => a + s.em, 0) / ss.length;
  assert.ok(
    mean(pushed.stamps) > mean(plain.stamps) * 1.5,
    `the push is real scale (${mean(plain.stamps).toFixed(3)} → ${mean(pushed.stamps).toFixed(3)})`,
  );
  assert.ok(
    pushed.stamps.some((s) => s.rotation !== 0),
    'the push treats glyphs per-glyph (rotation rides the stream)',
  );
  assert.deepEqual(
    placePiece(piece, lcg(5), { push: true }),
    pushed,
    'the push replays identically off the same stream',
  );
});

ok('supply: a Japanese cover deals in the native face whatever its length; every other piece keeps the minimum', () => {
  const t7 = fieldDealReport({ poetId: 'teijo', pieceId: 't7', script: 'kana' }, lcg(3));
  assert.ok(t7.form, 't7 deals: a cover in the native face (3 stamps) is exempt');
  assert.equal(t7.form.script, 'kana');
  assert.equal(t7.form.stamps.length, 3);
  // every cover, both faces, across seeds: dealt, gate-clean, and a fixed point of the door (the push included)
  for (const [pieceId, extra] of [
    ['t5', {}],
    ['t5', { script: 'kana' }],
    ['t6', { script: 'kana' }],
    ['t7', { script: 'kana' }],
  ]) {
    for (let seed = 1; seed <= 12; seed++) {
      const rep = fieldDealReport({ poetId: 'teijo', pieceId, ...extra }, lcg(seed));
      assert.ok(rep.form, `teijo ${pieceId} ${extra.script ?? 'latin'} seed ${seed}: deals under its exemption`);
      assert.ok(
        gateFieldForm(rep.form.stamps, { aspect: rep.form.aspect, allowKana: !!extra.script }).ok,
        `teijo ${pieceId} seed ${seed}: the gate passes`,
      );
      assert.deepEqual(sanitizeFieldForm(rep.form), rep.form, `teijo ${pieceId} seed ${seed}: door fixed point`);
    }
  }
  const t9 = fieldDealReport({ poetId: 'teijo', pieceId: 't9', script: 'kana' }, lcg(3));
  assert.equal(t9.form, null, 't9 (between, 5 native stamps) keeps the minimum: silence');
  assert.equal(t9.gate, null, 'a threshold refusal is plain silence, not a gate refusal');
  const t9latin = fieldDealReport({ poetId: 'teijo', pieceId: 't9' }, lcg(3));
  assert.ok(t9latin.form, 't9 in its Latin face (18 stamps) deals as it always did');
});

ok('supply: the identity chip names register poems — the clean transcription of a pushed word', () => {
  const id = poemIdentity({ poetId: 'gibson', pieceId: 'w5' });
  assert.equal(id.surname, 'Gibson');
  assert.equal(id.firstWords, 'ICEBREAKER');
  assert.equal(poemIdentity({ poetId: 'teijo', pieceId: 't12' }).surname, 'Nakamura');
});

ok('variety: the hot pick ranges across the register line; the calm pick is the deck alone', () => {
  const registerIds = new Set(
    Object.values(POET_REGISTERS)
      .flat()
      .map((p) => p.id),
  );
  const deckIds = new Set(
    Object.values(POET_DECKS)
      .flat()
      .map((p) => p.id),
  );
  let sawRegister = false;
  for (let seed = 1; seed <= 60; seed++) {
    const d = choosePoet({ intensity: 0.5, rng: mkRng(seed), typeEligible: true, variety: true });
    assert.ok(d && (deckIds.has(d.pieceId) || registerIds.has(d.pieceId)), 'variety deals only supply pieces');
    if (registerIds.has(d.pieceId)) sawRegister = true;
  }
  assert.ok(sawRegister, 'variety reached the register cache');
  for (let seed = 1; seed <= 60; seed++) {
    const d = choosePoet({ intensity: 0.5, rng: mkRng(seed), typeEligible: true });
    assert.ok(d && deckIds.has(d.pieceId), 'no variety, no cache — the deck alone, as shipped');
  }
});

// ---------------------------------------------------------------- the store
const BASE = S();
function reset(extra = {}) {
  resetDirector();
  useStore.setState({
    seed: 0x2151,
    layoutParams: { ...BASE.layoutParams, composition: 'raster' },
    lockedParams: {},
    poemDeal: 0,
    fieldRevision: null,
    fieldVariety: false,
    historyUndoStack: [],
    historyRedoStack: [],
    ...extra,
  });
}
const stand = (form) => useStore.setState({ layoutParams: { ...S().layoutParams, fieldForm: form } });

ok('store: a request banks against the standing form — and only that form, only once', () => {
  reset();
  const cover = deal('gibson', 'w5', 4);
  stand(cover);
  const key = poemFormKey(cover);
  S().requestFieldRevision({ formKey: 'bogus', register: 'cover', read: 'empty', doctrine: 'carson' });
  assert.equal(S().fieldRevision, null, 'a request naming another form is refused');
  S().requestFieldRevision({ formKey: key, register: 'cover', read: 'empty', doctrine: 'carson' });
  const rec = S().fieldRevision;
  assert.equal(rec.status, 'pending');
  assert.equal(rec.pieceId, 'w5');
  assert.equal(rec.doctrine, 'carson');
  assert.equal(rec.knobs, FIELD_REVISION_KNOBS, 'the knobs ride the record as provenance');
  S().cancelFieldRevision('hot');
  assert.equal(S().fieldRevision.status, 'silenced');
  S().requestFieldRevision({ formKey: key, register: 'cover', read: 'empty', doctrine: 'carson' });
  assert.equal(S().fieldRevision.status, 'silenced', 'one bite per form: a silenced form is never re-requested');
});

ok('store: the answer re-deals toward the other pole through the deal path — counter, record and form agree', () => {
  reset();
  const cover = deal('gibson', 'w5', 4);
  stand(cover);
  S().requestFieldRevision({ formKey: poemFormKey(cover), register: 'cover', read: 'empty', doctrine: 'carson' });
  const before = S().poemDeal;
  S().answerFieldRevision();
  const rec = S().fieldRevision;
  assert.equal(rec.status, 'answered');
  assert.equal(rec.outcome, 'redealt');
  const landed = S().layoutParams.fieldForm;
  assert.ok(
    landed && landed.poetId === 'gibson' && GIBSON_BETWEEN.includes(landed.pieceId),
    `answered from the middle band (got ${landed?.pieceId})`,
  );
  assert.equal(rec.answerPieceId, landed.pieceId);
  assert.ok(S().poemDeal > before, 'the answer is a deal: the counter advanced');
  assert.equal(rec.deal, S().poemDeal, 'the record names the counter it stands at');
  assert.deepEqual(sanitizeFieldForm(landed), landed, 'the answered form passes the door');
});

ok("store: a hold silences the answer — the user's lock outranks the critics", () => {
  reset();
  const cover = deal('gibson', 'w5', 4);
  stand(cover);
  S().requestFieldRevision({ formKey: poemFormKey(cover), register: 'cover', read: 'empty', doctrine: 'carson' });
  useStore.setState({ lockedParams: { fieldForm: cover } });
  const deals = S().poemDeal;
  S().answerFieldRevision();
  assert.equal(S().fieldRevision.status, 'silenced');
  assert.equal(S().fieldRevision.outcome, 'held');
  assert.equal(S().layoutParams.fieldForm, cover, 'the held poem never moved');
  assert.equal(S().poemDeal, deals, 'no deal was drawn');
});

ok("store: the variety flag is the driver's note, nothing more", () => {
  reset();
  assert.equal(S().fieldVariety, false);
  S().setFieldVariety(true);
  assert.equal(S().fieldVariety, true);
  S().setFieldVariety(true);
  assert.equal(S().fieldVariety, true, 'idempotent');
});

// ---------------------------------------------------------------- the driver
function fakeStage({ form, tempo, replaying = false }) {
  const calls = { variety: [], requests: [], cancels: [], answers: 0 };
  const state = {
    layoutParams: { fieldForm: form, poemKeeps: [] },
    lockedParams: {},
    fieldRevision: null,
    setFieldVariety: (hot) => calls.variety.push(hot),
    requestFieldRevision: (req) => {
      calls.requests.push(req);
      state.fieldRevision = {
        status: 'pending',
        formKey: req.formKey,
        poetId: form.poetId,
        pieceId: form.pieceId,
        ...req,
      };
    },
    cancelFieldRevision: (why) => {
      calls.cancels.push(why);
      if (state.fieldRevision) state.fieldRevision = { ...state.fieldRevision, status: 'silenced', outcome: why };
    },
    answerFieldRevision: () => {
      calls.answers += 1;
      if (state.fieldRevision) state.fieldRevision = { ...state.fieldRevision, status: 'answered' };
    },
  };
  let at = 100000;
  let currentTempo = tempo;
  let replayingNow = replaying;
  const snap = () =>
    currentTempo === 'hot'
      ? { away: false, rollsLastMinute: 30, lastTweak: null, undoBurstSize: 0, now: at }
      : currentTempo === 'fiddling'
        ? { away: false, rollsLastMinute: 0, lastTweak: { ts: at - 500, key: 'count' }, undoBurstSize: 0, now: at }
        : { away: false, rollsLastMinute: 0, lastTweak: null, undoBurstSize: 0, now: at };
  let tickFn = null;
  const stop = startFieldRevision({
    getState: () => state,
    isReplaying: () => replayingNow,
    now: () => at,
    snapshot: snap,
    setInterval: (fn) => {
      tickFn = fn;
      return 1;
    },
    clearInterval: () => {},
  });
  return {
    calls,
    state,
    stop,
    setTempo: (t) => {
      currentTempo = t;
    },
    setReplaying: (r) => {
      replayingNow = r;
    },
    tick: (advanceMs = 0) => {
      at += advanceMs;
      tickFn();
    },
  };
}

ok('driver: watching + dwell draws the request; the grace passes and the poem answers', () => {
  const stage = fakeStage({ form: deal('gibson', 'w5', 4), tempo: 'watching' });
  stage.tick(0); // first sight of the form: the dwell clock starts
  stage.tick(FIELD_REVISION_KNOBS.standDwellMs - 1);
  assert.equal(stage.calls.requests.length, 0, 'not yet: the dwell has not elapsed');
  stage.tick(2);
  assert.equal(stage.calls.requests.length, 1, 'the request fired in the watching tempo');
  assert.equal(stage.calls.requests[0].read, 'empty');
  stage.tick(FIELD_REVISION_KNOBS.answerDelayMs - 1);
  assert.equal(stage.calls.answers, 0, 'the grace is still running');
  stage.tick(FIELD_REVISION_KNOBS.answerDelayMs + 1);
  assert.equal(stage.calls.answers, 1, 'the poem answered');
  stage.stop();
});

ok('driver: hot draws no requests and flips variety on; fiddling silences a pending request', () => {
  const hot = fakeStage({ form: deal('gibson', 'w5', 4), tempo: 'hot' });
  hot.tick(0);
  hot.tick(FIELD_REVISION_KNOBS.standDwellMs + 5000);
  assert.equal(hot.calls.requests.length, 0, 'hot mode draws no requests');
  assert.deepEqual(hot.calls.variety, [true], 'variety follows the hot tempo');
  hot.stop();

  const stage = fakeStage({ form: deal('gibson', 'w11', 4), tempo: 'watching' });
  stage.tick(0);
  stage.tick(FIELD_REVISION_KNOBS.standDwellMs + 1);
  assert.equal(stage.calls.requests.length, 1, 'a crowded poem drew its request');
  assert.equal(stage.calls.requests[0].doctrine, 'ashworth');
  stage.state.fieldRevision.status = 'pending';
  // the user starts fiddling: the next tick must silence, not answer
  const fiddle = fakeStage({ form: deal('gibson', 'w11', 4), tempo: 'fiddling' });
  fiddle.state.fieldRevision = stage.state.fieldRevision;
  fiddle.tick(0);
  assert.equal(fiddle.calls.answers, 0);
  assert.deepEqual(fiddle.calls.cancels, ['fiddling'], 'fiddling silences the pending request');
  fiddle.stop();
  stage.stop();
});

ok('driver: a fine poem standing forever draws nothing', () => {
  const stage = fakeStage({ form: deal('gibson', 'w8', 4), tempo: 'watching' });
  stage.tick(0);
  stage.tick(FIELD_REVISION_KNOBS.standDwellMs * 3);
  assert.equal(stage.calls.requests.length, 0);
  stage.stop();
});

ok('driver: replay mutes the pass — a pole poem standing past the dwell draws no request, no variety write', () => {
  const stage = fakeStage({ form: deal('gibson', 'w5', 4), tempo: 'watching', replaying: true });
  stage.tick(0);
  stage.tick(FIELD_REVISION_KNOBS.standDwellMs * 3);
  assert.equal(stage.calls.requests.length, 0, 'no request fires while a take plays back');
  assert.equal(stage.calls.variety.length, 0, 'no variety write occurs during replay');
  assert.equal(stage.calls.answers, 0, 'nothing answers during replay');
  assert.equal(stage.calls.cancels.length, 0, 'nothing is silenced during replay either — the pass is mute');
  stage.stop();
});

ok('driver: a pending request never answers mid-replay — the grace restarts when playback ends', () => {
  const stage = fakeStage({ form: deal('gibson', 'w5', 4), tempo: 'watching' });
  stage.tick(0);
  stage.tick(FIELD_REVISION_KNOBS.standDwellMs + 1);
  assert.equal(stage.calls.requests.length, 1, 'the request fired live');
  stage.setReplaying(true);
  stage.tick(FIELD_REVISION_KNOBS.answerDelayMs * 3);
  assert.equal(stage.calls.answers, 0, 'no answer commits during replay');
  assert.equal(stage.calls.cancels.length, 0, 'replay does not silence the request — the pass simply does not speak');
  stage.setReplaying(false);
  stage.tick(0); // the pass sees the pending request again: the grace clock restarts from here
  assert.equal(stage.calls.answers, 0, 'the grace has not run yet');
  stage.tick(FIELD_REVISION_KNOBS.answerDelayMs + 1);
  assert.equal(stage.calls.answers, 1, 'after playback the grace runs and the poem answers');
  stage.stop();
});

ok('driver: the dwell clock runs only while watching — hot standing does not bank time toward judgment', () => {
  const stage = fakeStage({ form: deal('gibson', 'w5', 4), tempo: 'hot' });
  stage.tick(0); // first sight of the form
  stage.tick(FIELD_REVISION_KNOBS.standDwellMs * 2); // the poem stands twice the dwell while hot
  assert.equal(stage.calls.requests.length, 0, 'hot draws no requests');
  stage.setTempo('watching');
  stage.tick(FIELD_REVISION_KNOBS.standDwellMs - 1);
  assert.equal(
    stage.calls.requests.length,
    0,
    'the hot standing banked no dwell: judgment still waits for a full watching dwell',
  );
  stage.tick(2);
  assert.equal(stage.calls.requests.length, 1, 'a full dwell stood in the watching tempo draws the request');
  stage.stop();
});

console.log(`[selfcheck] fieldRevision (#2151): ${n} cases passed`);
