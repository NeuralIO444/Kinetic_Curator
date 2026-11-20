// node src/curator/rhythmSection.selfcheck.mjs
// #2389 (Persona Kernel P9) — the rhythm section's seat in the band: her timing sway on the WHOLE band (when a horn
// comes in, how long a solo breathes, how tight a trade sits), never content; the literal caps; the null (unruled)
// law; her eyes (at most once a phrase, timing only, recorded, replayed without a model, no model = no look); the
// take's band.rhythm record (additive, fail-closed); and the live wiring through the band's adapter.
//
// The shipped table's timing shares and vision cadence/weight are NULL (unruled). Everything below that needs numbers
// runs on FIXTURE tables made up in this file, never exported, never reachable from shipped code.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Events, emit, on } from '../composition/eventBus.js';
import { TUNING_DEFAULTS, validateTuning, setTuningValue } from '../personas/tuning.mjs';
import { BAND_SOLOISTS, BAND_ANSWERERS, createBandState, stepBand } from '../personas/band.mjs';
import { setBandTap } from '../personas/bandRecord.mjs';
import { startBand } from '../personas/bandLive.js';
import {
  bandTimingOpen,
  bandTiming,
  relaxedTiming,
  BAND_ARM_CAP_MS,
  BAND_HOLD_CAP,
  LOOK_MOTIONS,
  phraseTiming,
} from './queenLean.mjs';
import { bandTimingStep } from './director.js';
import {
  RHYTHM_ARM_CAP_MS,
  RHYTHM_HOLD_CAP,
  RHYTHM_MOTIONS,
  RHYTHM_RECORD_VERSION,
  createRhythmRecorder,
  checkRhythmRecord,
  replayRhythmFrame,
  endRhythmReplay,
  getRhythmTiming,
  getRhythmLooks,
  setRhythmTap,
  noteRhythmTiming,
  noteRhythmLook,
  resetRhythm,
} from '../personas/rhythmRecord.mjs';
import { shouldLook, validateLook, buildLookRequest, RHYTHM_VISION_CONSUMER } from '../personas/rhythmVision.mjs';
import { createRhythmEyes } from '../personas/rhythmVisionLive.js';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// ── FIXTURES (test-only) ───────────────────────────────────────────────────────────────────────────────────
const knobsWith = ({ timing = {}, vision = {} } = {}) => {
  const k = clone(TUNING_DEFAULTS.personas.queen.knobs);
  k.timing = { hornEntry: null, soloBreath: null, tradeTight: null, ...timing };
  k.vision = { everyPhrases: null, weight: null, ...vision };
  return k;
};
const RULED = { hornEntry: 1, soloBreath: 1, tradeTight: 1 };
function bandFixture({ len = 2, vision = {}, timing = {} } = {}) {
  const t = clone(TUNING_DEFAULTS);
  t.band = { tradeRate: 1, maxHornsPerCall: 3, bandleaderCut: 0.9 };
  for (const id of BAND_SOLOISTS) {
    t.personas[id].soloLengthPhrases = len;
    t.personas[id].stepCap = 0.1;
    t.personas[id].heat = id === 'carson' ? 1 : 0;
  }
  for (const id of BAND_ANSWERERS) {
    t.personas[id].odds = { agree: 0.2, disagree: 0.6, layOut: 0.2 };
    t.personas[id].answersFirst = 'carson';
  }
  for (const k of Object.keys(t.relations)) t.relations[k] = 0;
  t.personas.queen.knobs.timing = { hornEntry: null, soloBreath: null, tradeTight: null, ...timing };
  t.personas.queen.knobs.vision = { everyPhrases: null, weight: null, ...vision };
  assert.deepEqual(validateTuning(t), [], 'the fixture is a valid table');
  return t;
}
const SOLO_HORN = Object.freeze({ kind: 'solo', phrase: 3, by: 'carson', len: 2, cap: 0.1 });
const SOLO_LEAD = Object.freeze({ kind: 'solo', phrase: 3, by: 'davis', len: 2, cap: 0.1 });
const TRADE_TO_HORN = Object.freeze({
  kind: 'trade',
  phrase: 4,
  by: 'davis',
  answers: Object.freeze([Object.freeze({ by: 'greiman', verdict: 'disagree', move: 'counter' })]),
  owner: 'greiman',
  len: 2,
  cap: 0.1,
});
const TRADE_KEPT = Object.freeze({ kind: 'trade', phrase: 4, by: 'davis', answers: Object.freeze([]), owner: 'davis' });
const SIG = { nKeeps: 8, beatConfident: true };

// ── the caps and the null law ──────────────────────────────────────────────────────────────────────────────
await ok('caps are LITERAL and equal M4: 40 ms early, +8% hold (pinned here as numbers, never derived)', () => {
  assert.equal(BAND_ARM_CAP_MS, 40);
  assert.equal(BAND_HOLD_CAP, 0.08);
  assert.equal(RHYTHM_ARM_CAP_MS, 40);
  assert.equal(RHYTHM_HOLD_CAP, 0.08);
  assert.deepEqual(phraseTiming(true), { armEarlyMs: 40, holdPct: 0.08 }, 'M4 as shipped');
  assert.deepEqual([...LOOK_MOTIONS], [...RHYTHM_MOTIONS]);
});

await ok('null is unruled: the SHIPPED table leans on nothing — every turn kind, every signal', () => {
  assert.deepEqual(TUNING_DEFAULTS.personas.queen.knobs.timing, {
    hornEntry: null,
    soloBreath: null,
    tradeTight: null,
  });
  assert.deepEqual(TUNING_DEFAULTS.personas.queen.knobs.vision, { everyPhrases: null, weight: null });
  for (const t of [
    SOLO_HORN,
    SOLO_LEAD,
    TRADE_TO_HORN,
    TRADE_KEPT,
    { kind: 'cut', phrase: 2, by: 'governor', target: 'davis' },
  ])
    for (const look of [null, { motion: 'busy' }, { motion: 'still' }]) {
      assert.equal(bandTimingOpen(t, { nKeeps: 99, beatConfident: true, look }), null);
      assert.equal(bandTiming(t, { nKeeps: 99, beatConfident: true, look }), null);
    }
  assert.equal(bandTimingStep(SOLO_HORN, { motion: 'busy' }), null, 'the Director host, live table: no lean');
  assert.equal(setTuningValue('personas.queen.knobs.timing.hornEntry', 0.5).ok, false, 'the rig cannot rule a null');
  assert.equal(setTuningValue('personas.queen.knobs.vision.everyPhrases', 1).ok, false);
});

await ok('the shape is pinned: timing shares are probabilities, the cadence an integer ≥ 1, null allowed', () => {
  const t = clone(TUNING_DEFAULTS);
  t.personas.queen.knobs.timing.hornEntry = 1.5;
  assert.ok(validateTuning(t).some((p) => p.includes('timing.hornEntry')));
  const u = clone(TUNING_DEFAULTS);
  u.personas.queen.knobs.vision.everyPhrases = 0;
  assert.ok(validateTuning(u).some((p) => p.includes('vision.everyPhrases')));
  const w = clone(TUNING_DEFAULTS);
  w.personas.queen.knobs.timing.bogus = null;
  assert.ok(validateTuning(w).some((p) => p.includes('drift')));
  const v = clone(TUNING_DEFAULTS);
  v.personas.queen.knobs.timing = { hornEntry: 0.5, soloBreath: 0, tradeTight: 1 };
  v.personas.queen.knobs.vision = { everyPhrases: 2, weight: 0.25 };
  assert.deepEqual(validateTuning(v), []);
});

// ── the sway: timing only, capped, relaxing, 8 keeps ───────────────────────────────────────────────────────
await ok('when a horn comes in, how long a solo breathes, how tight a trade sits — each a share of M4', () => {
  const k = knobsWith({ timing: { hornEntry: 0.5, soloBreath: 0.25, tradeTight: 0.75 } });
  assert.deepEqual(bandTimingOpen(SOLO_HORN, SIG, k), { phrase: 3, enterEarlyMs: 20, breathePct: 0.02, tightMs: 0 });
  assert.deepEqual(bandTimingOpen(SOLO_LEAD, SIG, k), { phrase: 3, enterEarlyMs: 0, breathePct: 0.02, tightMs: 0 });
  assert.deepEqual(bandTimingOpen(TRADE_TO_HORN, SIG, k), {
    phrase: 4,
    enterEarlyMs: 20,
    breathePct: 0.02,
    tightMs: 30,
  });
  assert.deepEqual(bandTimingOpen(TRADE_KEPT, SIG, k), { phrase: 4, enterEarlyMs: 0, breathePct: 0, tightMs: 30 });
  assert.equal(bandTimingOpen({ kind: 'in', phrase: 0, by: 'governor' }, SIG, k), null, 'a count-in is not hers');
  assert.equal(bandTimingOpen({ kind: 'cut', phrase: 2, by: 'governor', target: 'davis' }, SIG, k), null);
});

await ok(
  'never content: a lean carries only timing fields; the turn is untouched; the conversation is identical',
  () => {
    const k = knobsWith({ timing: RULED });
    const t = bandTimingOpen(TRADE_TO_HORN, SIG, k);
    assert.deepEqual(Object.keys(t).sort(), ['breathePct', 'enterEarlyMs', 'phrase', 'tightMs']);
    assert.ok(Object.isFrozen(TRADE_TO_HORN) && TRADE_TO_HORN.owner === 'greiman');
    const src = read('./queenLean.mjs');
    const m10 = src.slice(src.indexOf('// ─── M10'));
    assert.ok(!/turn\.\w+\s*=[^=]/.test(m10), 'M10 never writes a turn field');
    assert.ok(!/\bowner\s*:|\bby\s*:|\banswers\s*:/.test(m10.replace(/\/\/.*$/gm, '')), 'M10 never builds a turn');
  },
);

await ok('capped: whatever the shares and the look, never past 40 ms or +8% (and never negative)', () => {
  for (const w of [0, 0.5, 1])
    for (const motion of ['still', 'flowing', 'busy']) {
      const k = knobsWith({ timing: RULED, vision: { weight: w } });
      for (const turn of [SOLO_HORN, SOLO_LEAD, TRADE_TO_HORN, TRADE_KEPT]) {
        const t = bandTimingOpen(turn, { ...SIG, look: { motion } }, k);
        if (!t) continue;
        for (const ms of [t.enterEarlyMs, t.tightMs]) assert.ok(ms >= 0 && ms <= 40, `${ms}`);
        assert.ok(t.breathePct >= 0 && t.breathePct <= 0.08, `${t.breathePct}`);
      }
    }
});

await ok('8 keeps before any lean; no confident beat, no lean; the gate is M4’s own', () => {
  const k = knobsWith({ timing: RULED });
  assert.equal(bandTimingOpen(SOLO_HORN, { nKeeps: 7, beatConfident: true }, k), null);
  assert.ok(bandTimingOpen(SOLO_HORN, { nKeeps: 8, beatConfident: true }, k));
  assert.equal(bandTimingOpen(SOLO_HORN, { nKeeps: 50, beatConfident: false }, k), null);
});

await ok('relaxing: a lean is full at its phrase boundary and relaxes linearly to nothing across the phrase', () => {
  const t = bandTimingOpen(TRADE_TO_HORN, SIG, knobsWith({ timing: RULED }));
  assert.deepEqual(relaxedTiming(t, 0), { ...t });
  const half = relaxedTiming(t, 0.5);
  assert.equal(half.tightMs, t.tightMs / 2);
  assert.deepEqual(relaxedTiming(t, 1), { phrase: 4, enterEarlyMs: 0, breathePct: 0, tightMs: 0 });
  assert.equal(relaxedTiming(null, 0.3), null);
});

// ── her eyes ───────────────────────────────────────────────────────────────────────────────────────────────
await ok(
  'vision moves ONLY her timing: busy tightens and shortens the breath, still loosens; weight null moves nothing',
  () => {
    const half = knobsWith({ timing: { hornEntry: 0.5, soloBreath: 0.5, tradeTight: 0.5 }, vision: { weight: 0.5 } });
    const base = bandTimingOpen(TRADE_TO_HORN, SIG, half);
    const busy = bandTimingOpen(TRADE_TO_HORN, { ...SIG, look: { motion: 'busy' } }, half);
    const still = bandTimingOpen(TRADE_TO_HORN, { ...SIG, look: { motion: 'still' } }, half);
    const flowing = bandTimingOpen(TRADE_TO_HORN, { ...SIG, look: { motion: 'flowing' } }, half);
    assert.deepEqual(flowing, base, 'a flowing frame moves nothing');
    assert.ok(
      busy.tightMs > base.tightMs && busy.enterEarlyMs > base.enterEarlyMs && busy.breathePct < base.breathePct,
    );
    assert.ok(still.tightMs < base.tightMs && still.breathePct > base.breathePct);
    const unruled = knobsWith({ timing: { hornEntry: 0.5, soloBreath: 0.5, tradeTight: 0.5 } });
    assert.deepEqual(
      bandTimingOpen(TRADE_TO_HORN, { ...SIG, look: { motion: 'busy' } }, unruled),
      bandTimingOpen(TRADE_TO_HORN, SIG, unruled),
    );
    assert.equal(
      bandTimingOpen(TRADE_TO_HORN, { ...SIG, look: { motion: 'busy' } }, knobsWith({ vision: { weight: 1 } })),
      null,
      'a look alone never leans',
    );
  },
);

await ok('at most once a phrase, never per frame; unruled cadence = she does not look', () => {
  assert.equal(shouldLook({ phrase: 0, everyPhrases: null }), false);
  assert.equal(shouldLook({ phrase: 0, everyPhrases: 1 }), true);
  assert.equal(shouldLook({ phrase: 3, lastLookPhrase: 3, everyPhrases: 1 }), false, 'never twice in a phrase');
  assert.equal(shouldLook({ phrase: 4, lastLookPhrase: 3, everyPhrases: 1, inFlight: true }), false);
  assert.equal(shouldLook({ phrase: 4, lastLookPhrase: 3, everyPhrases: 2 }), false);
  assert.equal(shouldLook({ phrase: 5, lastLookPhrase: 3, everyPhrases: 2 }), true);
  assert.equal(shouldLook({ phrase: 2, lastLookPhrase: 5, everyPhrases: 1 }), false);
});

await ok('a reading is one word from a fixed schema; anything else is discarded; the ask names nobody', () => {
  assert.deepEqual(validateLook({ motion: 'busy' }), { motion: 'busy' });
  for (const bad of [null, {}, { motion: 'loud' }, { motion: '忙しい' }, ['busy'], { motion: 'busy', note: '忙' }])
    assert.equal(validateLook(bad), null);
  const req = JSON.stringify(buildLookRequest({ imageBase64: 'AAAA' }));
  assert.ok(!/queen|tina|turner|lois|davis|governor/i.test(req));
  assert.equal(RHYTHM_VISION_CONSUMER, 'stage.describe', 'gated on a local vision badge (the registry’s gate)');
});

await ok('no vision model = she does not look: the eyes refuse without a record, never fetch', async () => {
  let fetched = 0;
  const eyes = createRhythmEyes({
    getRecord: () => null,
    fetchImpl: () => (fetched++, Promise.reject(new Error('no'))),
  });
  assert.equal(eyes.canLook(), false);
  assert.equal(await eyes.look(), null);
  assert.equal(fetched, 0);
  const rec = { endpoint: 'http://127.0.0.1:11434', model: 'qwen3-vl:8b-instruct', tier: 'B', badges: ['vision'] };
  const reply = (content) => () => Promise.resolve({ ok: true, json: () => Promise.resolve({ message: { content } }) });
  const frame = () => Promise.resolve({ bytes: new Uint8Array([1, 2, 3]), mime: 'image/png' });
  const prepareImage = () => Promise.resolve({ base64: 'AQID' });
  const good = createRhythmEyes({
    getRecord: () => rec,
    getFrame: frame,
    prepareImage,
    fetchImpl: reply('{"motion":"still"}'),
  });
  assert.equal(good.canLook(), true);
  assert.deepEqual(await good.look(), { motion: 'still' });
  const bad = createRhythmEyes({
    getRecord: () => rec,
    getFrame: frame,
    prepareImage,
    fetchImpl: reply('{"motion":"wild"}'),
  });
  assert.equal(await bad.look(), null, 'a bad reply is no reading');
  const noFrame = createRhythmEyes({
    getRecord: () => rec,
    getFrame: () => null,
    prepareImage,
    fetchImpl: reply('{"motion":"busy"}'),
  });
  assert.equal(await noFrame.look(), null);
});

// ── the record: additive, fail-closed, replay without a model ──────────────────────────────────────────────
await ok('record: timing and looks as rows; absent when she did nothing; caps enforced on the way in', () => {
  let frame = 10;
  const rec = createRhythmRecorder({ getFrame: () => frame });
  assert.equal(rec.finish(), undefined, 'nothing noted: no section');
  rec.update({ type: 'timing', phrase: 3, enterEarlyMs: 20, breathePct: 0.02, tightMs: 0 });
  frame = 12;
  rec.update({ type: 'look', phrase: 3, motion: 'busy' });
  rec.update({ type: 'timing', phrase: 4, enterEarlyMs: 41, breathePct: 0, tightMs: 0 }); // past the cap: refused
  rec.update({ type: 'look', phrase: 4, motion: 'chaos' });
  assert.deepEqual(rec.finish(), {
    version: RHYTHM_RECORD_VERSION,
    timing: [[10, 3, 20, 0.02, 0]],
    looks: [[12, 3, 'busy']],
  });
});

await ok(
  'record: fail-closed — a bad row, a stray key, a wrong version or out-of-order rows refuse the whole record',
  () => {
    const good = { version: 1, timing: [[10, 3, 20, 0.02, 0]], looks: [[12, 3, 'busy']] };
    assert.deepEqual(checkRhythmRecord(good), good);
    const bads = [
      { ...good, version: 2 },
      { ...good, extra: 1 },
      { ...good, timing: [[10, 3, 20, 0.09, 0]] },
      { ...good, timing: [[10, 3, -1, 0, 0]] },
      { ...good, looks: [[12, 3, 'wild']] },
      { ...good, looks: [[12, 3]] },
      {
        ...good,
        timing: [
          [10, 3, 1, 0, 0],
          [9, 4, 1, 0, 0],
        ],
      },
      { ...good, timing: 'x' },
      null,
      [],
    ];
    for (const b of bads) assert.equal(checkRhythmRecord(b), null, JSON.stringify(b));
  },
);

await ok('replay: the holder is rebuilt from the rows, as they happened, with no model and no lean anew', () => {
  endRhythmReplay();
  const sec = {
    version: 1,
    timing: [
      [10, 3, 20, 0.02, 0],
      [30, 5, 0, 0, 12],
    ],
    looks: [[12, 3, 'busy']],
  };
  assert.equal(replayRhythmFrame(5, sec), 0);
  assert.equal(getRhythmTiming(), null);
  replayRhythmFrame(12, sec);
  assert.deepEqual(getRhythmTiming(), { phrase: 3, enterEarlyMs: 20, breathePct: 0.02, tightMs: 0 });
  assert.deepEqual(getRhythmLooks(), [{ phrase: 3, motion: 'busy' }]);
  replayRhythmFrame(31, sec);
  assert.equal(getRhythmTiming().tightMs, 12);
  replayRhythmFrame(11, sec, { seeked: true });
  assert.deepEqual(
    getRhythmTiming(),
    { phrase: 3, enterEarlyMs: 20, breathePct: 0.02, tightMs: 0 },
    'a seek lands right',
  );
  assert.deepEqual(getRhythmLooks(), []);
  assert.equal(
    replayRhythmFrame(99, { version: 1, timing: [[1, 1, 99, 0, 0]], looks: [] }),
    0,
    'malformed: nothing replayed',
  );
  endRhythmReplay();
  assert.equal(getRhythmTiming(), null);
});

await ok('older takes: a band section without rhythm loads exactly as before (P7 reader untouched)', () => {
  const app = read('../App.jsx');
  assert.match(
    app,
    /replayBandFrame\(frame, perf && perf\.band, o\);\s*replayRhythmFrame\(frame, perf && perf\.band && perf\.band\.rhythm, o\);/,
  );
  assert.equal(replayRhythmFrame(3, undefined), 0);
  const pb = read('../components/PerformanceButton.jsx');
  assert.match(pb, /if \(!r\) return band;/, 'no rhythm noted: the band section is exactly P7’s');
});

// ── live wiring through the band's adapter ─────────────────────────────────────────────────────────────────
function harness(opts) {
  const turns = [];
  const rhythm = [];
  const offTurn = on(Events.BAND_TURN, (p) => turns.push(p));
  setBandTap(() => {});
  setRhythmTap((e) => rhythm.push(e));
  const stop = startBand({ getSeed: () => 23, ...opts });
  return {
    turns,
    rhythm,
    stop, // the band's own stop, without clearing the taps
    bars: (list) => list.forEach((bar) => emit(Events.CLOCK_BAR, { bar })),
    done() {
      stop();
      setBandTap(null);
      setRhythmTap(null);
      offTurn();
      resetRhythm();
    },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

await ok('live: band OFF (default) — no timing, no look, nothing noted, even with a ruled table and eyes', async () => {
  let asked = 0;
  const t = bandFixture({ timing: RULED, vision: { everyPhrases: 1, weight: 1 } });
  const h = harness({
    getTuning: () => t,
    getTiming: (turn) => bandTimingOpen(turn, SIG, t.personas.queen.knobs),
    eyes: { canLook: () => true, look: () => (asked++, Promise.resolve({ motion: 'busy' })) },
  });
  h.bars([0, 4, 8, 12, 16]);
  await tick();
  assert.deepEqual(h.turns, []);
  assert.deepEqual(h.rhythm, []);
  assert.equal(asked, 0);
  h.done();
});

await ok(
  'live: band ON, timing shares unruled — the conversation plays, she leans on nothing and never looks',
  async () => {
    let asked = 0;
    const t = bandFixture();
    const h = harness({
      enabled: () => true,
      getTuning: () => t,
      getTiming: (turn, look) => bandTimingOpen(turn, { ...SIG, look }, t.personas.queen.knobs),
      eyes: { canLook: () => true, look: () => (asked++, Promise.resolve({ motion: 'busy' })) },
    });
    h.bars([0, 4, 8, 12, 16, 20]);
    await tick();
    assert.ok(h.turns.length > 2, 'the band played');
    assert.deepEqual(h.rhythm, []);
    assert.equal(asked, 0);
    h.done();
  },
);

await ok(
  'live: ruled — she leans on the turns, looks once a phrase at most, records both; the turns are unchanged',
  async () => {
    const t = bandFixture({ timing: RULED, vision: { everyPhrases: 1, weight: 0.5 } });
    let asked = 0;
    const looksAsked = [];
    const h = harness({
      enabled: () => true,
      getTuning: () => t,
      getTiming: (turn, look) => bandTimingOpen(turn, { ...SIG, look }, t.personas.queen.knobs),
      eyes: { canLook: () => true, look: () => (asked++, looksAsked.push(asked), Promise.resolve({ motion: 'busy' })) },
    });
    for (const bar of [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20]) {
      h.bars([bar]);
      await tick();
    }
    // the conversation is the pure band's, exactly (timing never enters a turn)
    let state = createBandState();
    const pure = [];
    for (let phrase = 0; phrase < 6; phrase++) {
      const r = stepBand(state, { phrase }, { seed: 23, tuning: t });
      state = r.state;
      pure.push(...r.turns);
    }
    assert.deepEqual(h.turns, pure);
    assert.ok(h.turns.every((x) => !('enterEarlyMs' in x) && !('tightMs' in x) && !('breathePct' in x)));
    const looks = h.rhythm.filter((e) => e.type === 'look');
    const leans = h.rhythm.filter((e) => e.type === 'timing');
    assert.ok(looks.length >= 1 && looks.length <= 6, `at most once a phrase (${looks.length})`);
    assert.equal(new Set(looks.map((l) => l.phrase)).size, looks.length, 'never twice in a phrase');
    assert.ok(leans.length >= 1, 'she leaned on some turn');
    assert.ok(leans.every((l) => l.enterEarlyMs <= 40 && l.tightMs <= 40 && l.breathePct <= 0.08));
    h.done();
  },
);

await ok('live: muted while a take plays — no lean, no look (the take’s rows speak)', async () => {
  const t = bandFixture({ timing: RULED, vision: { everyPhrases: 1, weight: 0.5 } });
  let asked = 0;
  const h = harness({
    enabled: () => true,
    isReplaying: () => true,
    getTuning: () => t,
    getTiming: (turn) => bandTimingOpen(turn, SIG, t.personas.queen.knobs),
    eyes: { canLook: () => true, look: () => (asked++, Promise.resolve({ motion: 'busy' })) },
  });
  h.bars([0, 4, 8, 12]);
  await tick();
  assert.deepEqual(h.rhythm, []);
  assert.equal(asked, 0);
  h.done();
});

await ok('live: no look while the band is unruled — a ruled vision cadence alone never asks (QA nit, P9)', async () => {
  const t = bandFixture({ timing: RULED, vision: { everyPhrases: 1, weight: 0.5 } });
  t.band.tradeRate = null; // one band number unruled: stepBand answers `unruled`, so the eyes stay shut
  let asked = 0;
  const h = harness({
    enabled: () => true,
    getTuning: () => t,
    getTiming: (turn, look) => bandTimingOpen(turn, { ...SIG, look }, t.personas.queen.knobs),
    eyes: { canLook: () => true, look: () => (asked++, Promise.resolve({ motion: 'busy' })) },
  });
  h.bars([0, 4, 8, 12, 16]);
  await tick();
  assert.equal(asked, 0, 'no look while unruled');
  assert.deepEqual(h.rhythm, []);
  h.done();
});

// A look that lands late is dropped unless the band is still live: replaying, switched off, or stopped.
for (const [label, spoil] of [
  ['a take is playing', (c) => (c.replaying = true)],
  ['the band is switched off', (c) => (c.on = false)],
  ['the band was stopped', (c, h) => h.stop()],
]) {
  await ok(`live: a late look is ignored when ${label} (control: it lands when live)`, async () => {
    for (const spoiled of [false, true]) {
      const t = bandFixture({ timing: RULED, vision: { everyPhrases: 1, weight: 0.5 } });
      const c = { replaying: false, on: true };
      let release;
      const gate = new Promise((r) => (release = r));
      let asked = 0;
      const h = harness({
        enabled: () => c.on,
        isReplaying: () => c.replaying,
        getTuning: () => t,
        eyes: { canLook: () => true, look: () => (asked++, gate.then(() => ({ motion: 'busy' }))) },
      });
      h.bars([0]);
      await tick();
      assert.equal(asked, 1, 'the look was asked');
      if (spoiled) spoil(c, h);
      release();
      await tick();
      await tick();
      const looks = h.rhythm.filter((e) => e.type === 'look');
      assert.equal(looks.length, spoiled ? 0 : 1, spoiled ? 'the late look is dropped' : 'the live look lands');
      h.done();
    }
  });
}

await ok('the holder: notes keep the last lean and a short look window; never on the band view', () => {
  resetRhythm();
  noteRhythmTiming({ phrase: 1, enterEarlyMs: 5, breathePct: 0.01, tightMs: 2 });
  noteRhythmTiming({ phrase: 2, enterEarlyMs: 400, breathePct: 0, tightMs: 0 }); // refused
  assert.equal(getRhythmTiming().phrase, 1);
  for (let i = 0; i < 12; i++) noteRhythmLook({ phrase: i, motion: 'still' });
  assert.equal(getRhythmLooks().length, 8);
  resetRhythm();
  const live = read('../personas/bandLive.js');
  assert.ok(!/view = \{[^}]*timing/.test(live) && !/view = \{[^}]*look/.test(live), 'the band view carries neither');
});

console.log(`rhythmSection.selfcheck: ${n} checks passed`);
