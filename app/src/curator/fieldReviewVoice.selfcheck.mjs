// node src/curator/fieldReviewVoice.selfcheck.mjs
// #2006 SLICE 2 — the review loop gets its VOICE and still no hand. A
// fresh landing's banked verdict (slice 1) is spoken onto the footer
// tape: DAVIS on clean, LOIS on janky, silence on exempt. The rules
// line is the line of record; the Mind backend may be asked to phrase
// it (validated proposal, 300 ms cap, one flight per persona) and the
// spoken line's provenance rides the record's `voice` extension.
// This suite proves, in order:
//   1. the line table — verdict → line per persona and gate, the exact
//      rules wording, the proposed rung orders, the percent formatter;
//   2. the proposal contract — a model reply may phrase and order but
//      never invent: no figures, wrong figures, figure look-alikes,
//      out-of-set rungs or a ladder on a clean landing all drop whole;
//      figures must keep their roles (the value before its limit,
//      crop's withheld limit stays withheld), the figure set is closed
//      (no percent beyond the record's own, however correct the pair —
//      the round-2 QA fence; figures are figures in any script —
//      Unicode digits and percent signs are unowned by construction,
//      the round-3 QA fence), and a clean proposal is fenced the other
//      way — no figures, no contrary verdict, no repair named (the QA
//      fix pass pins);
//   3. the ask context (§3.7: names + measures only, gates with
//      pass/fail, the rules line as idiom anchor, the approved set);
//   4. the extension's fail-closed shape (sanitizeReviewVoice);
//   5. the live driver over the real store — speech, silence, the
//      frequency gate, the fallback matrix (unavailable / throw /
//      malformed / late / stale / replaying ⇒ the rules line stands,
//      provenance marked), one flight per persona, replay never asks;
//   6. slice-1 integrity — an unspoken record is EXACTLY slice 1's
//      record (no `voice` key), and a spoken record minus its voice
//      deep-equals the record the same deal banks with no voice wired.
import assert from 'node:assert/strict';
import { useStore } from '../state/store.js';
import { resetDirector } from './director.js';
import { REVIEW_GATES } from './fieldReview.mjs';
import {
  REVIEW_LADDER,
  proposedOrder,
  pct,
  rulesVoice,
  voiceForRecord,
  askSeedFor,
  reviewAskContext,
  validateReviewProposal,
  sanitizeReviewVoice,
} from './fieldReviewVoice.mjs';
import { startReviewVoice } from './fieldReviewVoiceLive.mjs';
import { getLoisVerdict, clearLoisVerdict } from './loisRank.js';

const S = () => useStore.getState();

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const oka = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const flush = async () => {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};

// ---------------------------------------------------------------------------
// Fixture records — slice 1's exact banked shape, verdicts hand-set.
// ---------------------------------------------------------------------------
const rec = (verdict, gate, measures, seed = 11, stream = 'poem:0') => ({
  verdict,
  gate,
  exempt: null,
  measures,
  gates: REVIEW_GATES,
  backend: 'rules',
  rung: null,
  seed,
  stream,
});
const CLEAN = (seed = 11, stream = 'poem:0') => rec('clean', null, { m1: 0, m2: 0.2, m3: 0.03, m4: 0 }, seed, stream);
const J = {
  selfOverlap: rec('janky', 'selfOverlap', { m1: 0.12, m2: 0, m3: 0.03, m4: 0 }),
  markCover: rec('janky', 'markCover', { m1: 0, m2: 0.73, m3: 0.03, m4: 0 }),
  coverage: rec('janky', 'coverage', { m1: 0, m2: 0, m3: 0.41, m4: 0 }),
  coverageLow: rec('janky', 'coverageLow', { m1: 0, m2: 0, m3: 0.0009, m4: 0 }),
  crop: rec('janky', 'crop', { m1: 0, m2: 0, m3: 0.03, m4: 0.25 }),
};
const EXEMPT = {
  verdict: 'exempt',
  gate: null,
  exempt: 'plate',
  measures: null,
  gates: REVIEW_GATES,
  backend: 'rules',
  rung: null,
  seed: 11,
  stream: 'poem:0',
};
const LINES = {
  selfOverlap: 'The poem prints over itself. 12% of its ink is doubled — 5% is the limit. Would shrink it.',
  markCover: 'The marks are eating the poem. 73% of its ink is covered — 50% is the limit. Would shrink it.',
  coverage: 'The poem eats the dish. 41% of the dish is ink — 35% is the limit. Would shrink it.',
  coverageLow: 'The poem is barely there. 0.09% of the dish is ink — 0.15% is the floor. Would deal it again.',
  crop: 'The frame cuts the poem. 25% of its glyphs cross the edge — the limit is none. Would shift it back.',
};

// ---------------------------------------------------------------------------
// 1. The line table.
// ---------------------------------------------------------------------------
ok('pct: shares speak as whole percents, small readings keep two significant decimals', () => {
  assert.equal(pct(0), '0%');
  assert.equal(pct(1), '100%');
  assert.equal(pct(0.5), '50%');
  assert.equal(pct(0.05), '5%');
  assert.equal(pct(0.35), '35%');
  assert.equal(pct(0.4152), '42%');
  assert.equal(pct(0.0015), '0.15%');
  assert.equal(pct(0.0009), '0.09%');
});

ok('line table: LOIS names the failing gate with its measured value against its limit, per gate', () => {
  for (const gate of Object.keys(J)) {
    const v = rulesVoice(J[gate]);
    assert.equal(v.persona, 'lois', gate);
    assert.equal(v.line, LINES[gate], gate);
  }
});

ok('line table: DAVIS speaks clean — the woohoo, picked by the record seed', () => {
  assert.equal(rulesVoice(CLEAN(0)).line, 'WOO HOO.');
  assert.equal(rulesVoice(CLEAN(1)).line, 'Woohoo — landed clean.');
  assert.equal(rulesVoice(CLEAN(2)).line, 'WOO HOO — the poem stands.');
  assert.equal(rulesVoice(CLEAN(0)).persona, 'davis');
  assert.equal(rulesVoice(CLEAN(0)).rungOrder, null);
});

ok('proposed orders: the gate-aware lead rung walks first, the ladder follows', () => {
  assert.deepEqual(REVIEW_LADDER, [1, 2, 4, 5]);
  assert.deepEqual(proposedOrder('selfOverlap'), [1, 2, 4, 5]);
  assert.deepEqual(proposedOrder('markCover'), [1, 2, 4, 5]);
  assert.deepEqual(proposedOrder('coverage'), [1, 2, 4, 5]);
  assert.deepEqual(proposedOrder('coverageLow'), [4, 1, 2, 5]);
  assert.deepEqual(proposedOrder('crop'), [2, 1, 4, 5]);
  assert.deepEqual(rulesVoice(J.coverageLow).rungOrder, [4, 1, 2, 5]);
  assert.deepEqual(rulesVoice(J.crop).rungOrder, [2, 1, 4, 5]);
});

ok('silence: exempt, missing and unmeasured records have no rules voice', () => {
  assert.equal(rulesVoice(EXEMPT), null);
  assert.equal(rulesVoice(null), null);
  assert.equal(rulesVoice(rec('clean', null, null)), null);
  assert.equal(voiceForRecord(EXEMPT, 3), null);
});

ok('voiceForRecord: the rules extension carries persona, line, bar, backend and the record seed', () => {
  assert.deepEqual(voiceForRecord(J.markCover, 7), {
    persona: 'lois',
    line: LINES.markCover,
    bar: 7,
    backend: 'rules',
    seed: 11,
    rungOrder: [1, 2, 4, 5],
  });
  assert.deepEqual(voiceForRecord(CLEAN(0), 7), {
    persona: 'davis',
    line: 'WOO HOO.',
    bar: 7,
    backend: 'rules',
    seed: 0,
  });
  assert.equal(voiceForRecord(J.markCover, -1).bar, null, 'a bar that is not a bar reads null, never a lie');
});

// ---------------------------------------------------------------------------
// 2. The proposal contract.
// ---------------------------------------------------------------------------
ok('validator: a proposal may rephrase and re-order — the figures and the set are not negotiable', () => {
  const p = validateReviewProposal(
    { line: 'Buried at 73% — over the 50% line. Cut it.', rungOrder: [5, 4, 2, 1] },
    J.markCover,
  );
  assert.deepEqual(p, { line: 'Buried at 73% — over the 50% line. Cut it.', rungOrder: [5, 4, 2, 1] });
  const bare = validateReviewProposal({ line: 'Buried at 73% — over the 50% line.' }, J.markCover);
  assert.deepEqual(bare, { line: 'Buried at 73% — over the 50% line.', rungOrder: null });
  assert.deepEqual(validateReviewProposal({ line: 'WOO HOO, it stands.' }, CLEAN()), {
    line: 'WOO HOO, it stands.',
    rungOrder: null,
  });
});

ok('validator: missing or invented figures drop the proposal whole', () => {
  assert.equal(validateReviewProposal({ line: 'The marks have it. 50% is the limit.' }, J.markCover), null);
  assert.equal(validateReviewProposal({ line: '73% covered, way over.' }, J.markCover), null);
  assert.equal(validateReviewProposal({ line: 'Buried at 61% — over the 50% line.' }, J.markCover), null);
  // A figure look-alike does not count: 0.05% inside 10.05% is not the reading.
  const low = rec('janky', 'coverageLow', { m1: 0, m2: 0, m3: 0.0005, m4: 0 });
  assert.equal(validateReviewProposal({ line: 'At 10.05% of the dish — 0.15% is the floor.' }, low), null);
  assert.ok(validateReviewProposal({ line: 'At 0.05% of the dish — 0.15% is the floor.' }, low));
});

ok('validator: figure roles are fenced — the limit spoken before the value drops whole', () => {
  // QA's probes: both figures present but the roles swapped — the tape
  // would assert numbers the record contradicts.
  assert.equal(validateReviewProposal({ line: '50% of its ink is covered — 73% is the limit.' }, J.markCover), null);
  assert.equal(validateReviewProposal({ line: '0.15% of the dish is ink — 0.09% is the floor.' }, J.coverageLow), null);
  assert.equal(
    validateReviewProposal({ line: '5% is the limit, and 12% of its ink is doubled.' }, J.selfOverlap),
    null,
  );
  // The value first, in the rules' own roles, stands — whatever the words.
  assert.ok(validateReviewProposal({ line: 'Doubled ink at 12% — past the 5% limit.' }, J.selfOverlap));
  assert.ok(validateReviewProposal({ line: 'Barely there: 0.09% of the dish, under the 0.15% floor.' }, J.coverageLow));
});

ok('validator: equal figures — when value and limit format alike, presence is the whole fence', () => {
  const at = rec('janky', 'markCover', { m1: 0, m2: 0.5, m3: 0.03, m4: 0 }); // measured 50%, limit 50%
  assert.deepEqual(validateReviewProposal({ line: 'Half of its ink is covered: 50%, right at it.' }, at), {
    line: 'Half of its ink is covered: 50%, right at it.',
    rungOrder: null,
  });
  assert.equal(validateReviewProposal({ line: 'Half of its ink is covered, right at it.' }, at), null);
});

ok('validator: the rules’ own lines pass their own fence — every gate, every woohoo', () => {
  // The consistency property: the validator must be satisfiable by the
  // templates it fences for, crop's figure-free limit included.
  for (const gate of Object.keys(J)) {
    assert.deepEqual(
      validateReviewProposal({ line: LINES[gate] }, J[gate]),
      { line: LINES[gate], rungOrder: null },
      gate,
    );
  }
  for (const seed of [0, 1, 2]) {
    const r = CLEAN(seed);
    const line = rulesVoice(r).line;
    assert.deepEqual(validateReviewProposal({ line }, r), { line, rungOrder: null }, line);
  }
});

ok('validator: crop’s limit stays unspoken — an invented 0% drops, a limit-free rephrase stands', () => {
  assert.equal(
    validateReviewProposal(
      { line: 'The frame cuts the poem. 25% of its glyphs cross the edge — 0% is allowed.' },
      J.crop,
    ),
    null,
  );
  assert.equal(validateReviewProposal({ line: 'Over the edge at 25%, heading for 0%.' }, J.crop), null);
  assert.deepEqual(validateReviewProposal({ line: 'Glyphs over the edge: 25% of them. Shift it back.' }, J.crop), {
    line: 'Glyphs over the edge: 25% of them. Shift it back.',
    rungOrder: null,
  });
  assert.equal(
    validateReviewProposal({ line: 'Glyphs over the edge, every one. Shift it back.' }, J.crop),
    null,
    'the value figure is still required',
  );
});

ok('validator: the figure set is closed — an extra figure beside a correct pair drops whole', () => {
  // QA round 2: the required pair present, whole and in role was not
  // enough — a line could still speak numbers the record does not own.
  assert.equal(
    validateReviewProposal(
      { line: '173% covered at the peak — 73% of its ink is covered — 50% is the limit.' },
      J.markCover,
    ),
    null,
    'an invented peak is not fenced out by the correct pair behind it',
  );
  assert.equal(
    validateReviewProposal(
      { line: '73% of its ink is covered — 150% effort will not save it; 50% is the limit.' },
      J.markCover,
    ),
    null,
  );
  assert.equal(
    validateReviewProposal({ line: '73% covered — 50% is the limit — and 5% of its ink is doubled.' }, J.markCover),
    null,
    'another gate’s figure is not this record’s to speak',
  );
  assert.equal(
    validateReviewProposal(
      { line: 'The frame cuts the poem. 25% of its glyphs cross the edge — and 40% of the dish is ink.' },
      J.crop,
    ),
    null,
    'crop owns its value figure only — an invented coverage figure drops too',
  );
  // A restated owned figure is no invention: the value may be spoken twice.
  assert.deepEqual(
    validateReviewProposal({ line: 'Covered: 73% of its ink — 73% against a 50% limit.' }, J.markCover),
    {
      line: 'Covered: 73% of its ink — 73% against a 50% limit.',
      rungOrder: null,
    },
  );
});

ok('validator: figures are figures in any script — non-ASCII digits and percent signs are unowned', () => {
  // QA round 3: enumeration was ASCII-only, so a figure spoken in
  // another script walked past BOTH fences — the closed set never
  // enumerated it, and the clean fence's figure test never fired.
  // pct speaks ASCII only, so every token below is a number the
  // record does not own, however correct the pair in front of it is.
  // Escapes name the codepoints exactly: ％ U+FF05 and ٪ U+066A are
  // percent signs; ٩ U+0669 (Arabic-Indic), ९ U+0969 (Devanagari)
  // and ９ U+FF19 (fullwidth) are decimal digits.
  const pair = 'The marks are eating the poem. 73% of its ink is covered — 50% is the limit.';
  assert.equal(
    validateReviewProposal({ line: `${pair} Earlier it hit 99\uFF05.` }, J.markCover),
    null,
    'fullwidth percent',
  );
  assert.equal(
    validateReviewProposal({ line: `${pair} Earlier it hit \u0669\u0669%.` }, J.markCover),
    null,
    'Arabic-Indic digits',
  );
  assert.equal(
    validateReviewProposal({ line: `${pair} Earlier it hit \u0969\u0969%.` }, J.markCover),
    null,
    'Devanagari digits',
  );
  assert.equal(
    validateReviewProposal({ line: `${pair} Earlier it hit \uFF19\uFF19%.` }, J.markCover),
    null,
    'fullwidth digits',
  );
  assert.equal(
    validateReviewProposal({ line: `${pair} Earlier it hit 99\u066A.` }, J.markCover),
    null,
    'Arabic percent sign',
  );
  // A mixed token is ONE unowned figure, not an owned figure hiding
  // behind a foreign prefix: ٩ + '73%' extracts whole and drops.
  assert.equal(
    validateReviewProposal({ line: `${pair} Earlier it hit \u066973%.` }, J.markCover),
    null,
    'mixed-script token',
  );
  // The clean fence reads the same enumeration — QA's clean triple.
  assert.equal(validateReviewProposal({ line: 'WOO HOO — 99\uFF05 of the dish is ink and it sings.' }, CLEAN()), null);
  assert.equal(
    validateReviewProposal({ line: 'WOO HOO — \u0669\u0669% of the dish is ink and it sings.' }, CLEAN()),
    null,
  );
  assert.equal(
    validateReviewProposal({ line: 'WOO HOO — \uFF19\uFF19% of the dish is ink and it sings.' }, CLEAN()),
    null,
  );
  // ASCII behaviour is unchanged — two round-2 spot-pins stand as-is.
  assert.equal(
    validateReviewProposal(
      { line: '173% covered at the peak — 73% of its ink is covered — 50% is the limit.' },
      J.markCover,
    ),
    null,
  );
  assert.deepEqual(
    validateReviewProposal({ line: 'Covered: 73% of its ink — 73% against a 50% limit.' }, J.markCover),
    {
      line: 'Covered: 73% of its ink — 73% against a 50% limit.',
      rungOrder: null,
    },
  );
});

ok('validator: a clean proposal carrying any percent figure drops whole', () => {
  // QA's probe: an invented figure spoken over a clean record.
  assert.equal(validateReviewProposal({ line: 'WOO HOO — 99% of the dish is ink and it sings.' }, CLEAN()), null);
  assert.equal(validateReviewProposal({ line: 'WOO HOO — the poem stands at 0.09% of the dish.' }, CLEAN()), null);
  assert.equal(validateReviewProposal({ line: 'Clean — 100%.' }, CLEAN()), null);
});

ok('validator: a clean proposal may not name the verdict it is not, nor a repair it never proposes', () => {
  // QA's probes: verdict-contradicting speech over a clean record.
  assert.equal(validateReviewProposal({ line: 'The poem is buried under the marks. Cut it.' }, CLEAN()), null);
  assert.equal(validateReviewProposal({ line: 'Janky — half the poem is under the marks.' }, CLEAN()), null);
  assert.equal(validateReviewProposal({ line: 'WOO HOO. Would shrink it anyway.' }, CLEAN()), null);
  // The woohoo register itself is untouched by the fences.
  assert.ok(validateReviewProposal({ line: 'Woohoo — nothing doubled, nothing buried, it stands.' }, CLEAN()));
});

ok('validator: out-of-set rungs, a ladder on a clean landing, and malformed replies all drop', () => {
  const good = 'Buried at 73% — over the 50% line.';
  assert.equal(validateReviewProposal({ line: good, rungOrder: [3, 1] }, J.markCover), null, 'rung 3 is not armed yet');
  assert.equal(validateReviewProposal({ line: good, rungOrder: [1, 1] }, J.markCover), null);
  assert.equal(validateReviewProposal({ line: good, rungOrder: [] }, J.markCover), null);
  assert.equal(validateReviewProposal({ line: good, rungOrder: 'ladder' }, J.markCover), null);
  assert.equal(validateReviewProposal({ line: 'WOO HOO.', rungOrder: [1] }, CLEAN()), null);
  assert.equal(validateReviewProposal(null, J.markCover), null);
  assert.equal(validateReviewProposal('a line', J.markCover), null);
  assert.equal(validateReviewProposal({ line: 42 }, J.markCover), null);
  assert.equal(validateReviewProposal({ line: 'x'.repeat(141) }, CLEAN()), null);
  assert.equal(validateReviewProposal({ line: 'WOO HOO.' }, EXEMPT), null, 'an exempt record approves no speech');
});

// ---------------------------------------------------------------------------
// 3. The ask context.
// ---------------------------------------------------------------------------
ok('ask context: names and measures only — gates with pass/fail, the rules line, the approved set', () => {
  const ctx = reviewAskContext(J.markCover, { poet: 'Whittier', piece: 'g1', room: { verdict: 'davis-solo' } });
  assert.equal(ctx.kind, 'field-review');
  assert.equal(ctx.poet, 'Whittier');
  assert.equal(ctx.piece, 'g1');
  assert.equal(ctx.room, 'davis-solo');
  assert.equal(ctx.verdict, 'janky');
  assert.equal(ctx.gate, 'markCover');
  assert.deepEqual(ctx.measures.markCover, { value: 0.73, limit: 0.5, pass: false });
  assert.deepEqual(ctx.measures.selfOverlap, { value: 0, limit: 0.05, pass: true });
  assert.deepEqual(ctx.measures.coverageLow, { value: 0.03, limit: 0.0015, pass: true });
  assert.equal(ctx.rulesLine, LINES.markCover);
  assert.deepEqual(ctx.rungSet, [1, 2, 4, 5]);
  assert.equal(ctx.leadRung, 1);
  assert.equal(ctx.seed, askSeedFor(J.markCover));
  const clean = reviewAskContext(CLEAN(), {});
  assert.deepEqual(clean.rungSet, []);
  assert.equal(clean.leadRung, null);
  assert.equal(reviewAskContext(EXEMPT, {}), null);
});

// ---------------------------------------------------------------------------
// 4. The extension's fail-closed shape.
// ---------------------------------------------------------------------------
ok('sanitize: the extension must be the verdict’s own persona, a bounded line, a real backend', () => {
  const good = { persona: 'lois', line: LINES.markCover, bar: 7, backend: 'apple', seed: 99, rungOrder: [1, 2, 4, 5] };
  assert.deepEqual(sanitizeReviewVoice(good, J.markCover), good);
  assert.equal(sanitizeReviewVoice({ ...good, persona: 'davis' }, J.markCover), null);
  assert.equal(sanitizeReviewVoice({ ...good, backend: 'grok' }, J.markCover), null);
  assert.equal(sanitizeReviewVoice({ ...good, seed: 1.5 }, J.markCover), null);
  assert.equal(sanitizeReviewVoice({ ...good, bar: -1 }, J.markCover), null);
  assert.equal(sanitizeReviewVoice({ ...good, line: '' }, J.markCover), null);
  assert.equal(sanitizeReviewVoice({ ...good, rungOrder: [3] }, J.markCover), null);
  assert.equal(sanitizeReviewVoice(good, CLEAN()), null, 'a lois voice never rides a clean record');
  const davis = { persona: 'davis', line: 'WOO HOO.', bar: null, backend: 'rules', seed: 0 };
  assert.deepEqual(sanitizeReviewVoice(davis, CLEAN()), davis);
  assert.equal(sanitizeReviewVoice({ ...davis, rungOrder: [1] }, CLEAN()), null, 'no ladder on a clean voice');
});

// ---------------------------------------------------------------------------
// 5. The live driver, over the real store.
// ---------------------------------------------------------------------------
const setup = (seed, extraParams = {}) => {
  resetDirector();
  useStore.setState({
    seed,
    seedOffsets: { spatial: 0, color: 0, asset: 0, noise: 0 },
    curatePress: 0,
    poemDeal: 0,
    lockedParams: {},
    layoutParams: { ...useStore.getInitialState().layoutParams, composition: 'raster', ...extraParams },
    kineticRound: null,
    kineticNotch: null,
    armedMode: null,
    armedMotion: null,
    fieldReview: null,
    fieldGateRefusal: null,
  });
};
const bank = (record) => useStore.setState({ fieldReview: record });
const wire = (opts = {}) => {
  const lines = [];
  const stop = startReviewVoice({
    getState: useStore.getState,
    subscribe: (fn) => useStore.subscribe(fn),
    speak: (l) => {
      lines.push(l);
      return true;
    },
    bar: () => 7,
    ...opts,
  });
  return { lines, stop };
};
const fakeModel = ({ available = true, name = 'apple', reply = () => null } = {}) => {
  const m = {
    name,
    asks: [],
    available: () => available,
    ask(persona, ctx, opts) {
      m.asks.push({ persona, ctx, opts });
      return Promise.resolve().then(() => reply(persona, ctx, opts));
    },
  };
  return m;
};

ok('driver: a janky landing speaks the rules line and banks its provenance — no backend wired', () => {
  setup(4242);
  const { lines, stop } = wire({ model: null });
  const r = { ...J.markCover };
  bank(r);
  stop();
  assert.deepEqual(lines, [LINES.markCover]);
  assert.deepEqual(S().fieldReview.voice, {
    persona: 'lois',
    line: LINES.markCover,
    bar: 7,
    backend: 'rules',
    seed: 11,
    rungOrder: [1, 2, 4, 5],
  });
  const { voice, ...rest } = S().fieldReview;
  assert.deepEqual(rest, r, 'the record itself is slice 1’s — the voice only extends it');
});

ok('driver: the default speak writes the standing tape slot (loisRank), parts untouched', () => {
  setup(4242);
  clearLoisVerdict();
  const stop = startReviewVoice({
    getState: useStore.getState,
    subscribe: (fn) => useStore.subscribe(fn),
    model: null,
    bar: () => 7,
  });
  bank({ ...J.crop });
  stop();
  assert.equal(getLoisVerdict(), LINES.crop);
  clearLoisVerdict();
});

ok('driver: silence — exempt and empty records never speak and never gain a voice', () => {
  setup(4242);
  const { lines, stop } = wire({ model: null });
  bank({ ...EXEMPT });
  assert.ok(!('voice' in S().fieldReview), 'an exempt record stays exactly slice 1’s');
  bank(null);
  stop();
  assert.deepEqual(lines, []);
  assert.equal(S().fieldReview, null);
});

ok('driver: frequency — Davis does not woohoo every clean deal; a janky verdict resets the gate', () => {
  setup(4242);
  const { lines, stop } = wire({ model: null });
  bank(CLEAN(0, 'poem:0'));
  bank(CLEAN(1, 'poem:1'));
  assert.ok(!('voice' in S().fieldReview), 'the suppressed clean record was never extended');
  assert.equal(lines.length, 1, 'and the tape kept the standing woohoo');
  bank({ ...J.crop, stream: 'poem:2' });
  bank(CLEAN(2, 'poem:3'));
  stop();
  assert.deepEqual(lines, ['WOO HOO.', LINES.crop, 'WOO HOO — the poem stands.']);
});

ok('driver: the same record carried by (HOLD) is not re-spoken', () => {
  setup(4242);
  const { lines, stop } = wire({ model: null });
  const r = { ...J.markCover };
  bank(r);
  useStore.setState({ fieldReview: S().fieldReview }); // carry-by: same object
  useStore.setState({ curatePress: 9 }); // unrelated churn
  stop();
  assert.equal(lines.length, 1);
});

await oka('fallback: backend unavailable ⇒ no ask, the rules line stands marked rules', async () => {
  setup(4242);
  const model = fakeModel({ available: false });
  const { lines, stop } = wire({ model });
  bank({ ...J.markCover });
  await flush();
  stop();
  assert.equal(model.asks.length, 0);
  assert.deepEqual(lines, [LINES.markCover]);
  assert.equal(S().fieldReview.voice.backend, 'rules');
});

await oka('fallback: a throwing or garbage backend ⇒ the rules line stands, the ask counted once', async () => {
  setup(4242);
  const thrower = {
    name: 'apple',
    asks: 0,
    available: () => true,
    ask() {
      thrower.asks++;
      throw new Error('bridge down');
    },
  };
  const a = wire({ model: thrower });
  bank({ ...J.markCover });
  await flush();
  a.stop();
  assert.equal(thrower.asks, 1);
  assert.equal(S().fieldReview.voice.backend, 'rules');

  setup(4242);
  const garbage = fakeModel({ reply: () => ({ line: 'no figures in this one' }) });
  const b = wire({ model: garbage });
  bank({ ...J.markCover, stream: 'poem:9' });
  await flush();
  b.stop();
  assert.equal(garbage.asks.length, 1);
  assert.deepEqual(b.lines, [LINES.markCover]);
  assert.equal(S().fieldReview.voice.backend, 'rules');
  assert.equal(S().fieldReview.voice.line, LINES.markCover);
});

await oka(
  'a valid proposal replaces the line and the provenance — ask seed, model backend, its rung order',
  async () => {
    setup(4242);
    const model = fakeModel({
      reply: () => ({ line: 'Buried at 73% — over the 50% line. Cut it.', rungOrder: [5, 4, 2, 1] }),
    });
    const { lines, stop } = wire({ model });
    const r = { ...J.markCover };
    bank(r);
    await flush();
    stop();
    assert.equal(model.asks.length, 1);
    assert.equal(model.asks[0].persona, 'lois');
    assert.equal(model.asks[0].ctx.kind, 'field-review');
    assert.equal(model.asks[0].opts.seed, askSeedFor(r));
    assert.deepEqual(lines, [LINES.markCover, 'Buried at 73% — over the 50% line. Cut it.']);
    assert.deepEqual(S().fieldReview.voice, {
      persona: 'lois',
      line: 'Buried at 73% — over the 50% line. Cut it.',
      bar: 7,
      backend: 'apple',
      seed: askSeedFor(r),
      rungOrder: [5, 4, 2, 1],
    });
  },
);

await oka('a proposal without a rung order keeps the rules’ order; the demo backend marks itself demo', async () => {
  setup(4242);
  const model = fakeModel({ name: 'demo', reply: () => ({ line: 'WOO HOO, it stands.' }) });
  const { stop } = wire({ model });
  bank(CLEAN(0));
  await flush();
  stop();
  assert.equal(model.asks[0].persona, 'davis');
  assert.deepEqual(S().fieldReview.voice, {
    persona: 'davis',
    line: 'WOO HOO, it stands.',
    bar: 7,
    backend: 'demo',
    seed: askSeedFor(CLEAN(0)),
  });
});

await oka('one flight per persona: a second landing waits, and a stale proposal colours nothing', async () => {
  setup(4242);
  let resolveAsk;
  const manual = {
    name: 'apple',
    asks: [],
    available: () => true,
    ask(persona, ctx, opts) {
      manual.asks.push({ persona, ctx, opts });
      return new Promise((res) => {
        resolveAsk = res;
      });
    },
  };
  const { lines, stop } = wire({ model: manual });
  bank({ ...J.markCover, stream: 'poem:0' });
  const b = { ...J.markCover, stream: 'poem:1', seed: 12, measures: { m1: 0, m2: 0.9, m3: 0.03, m4: 0 } };
  bank(b);
  assert.equal(manual.asks.length, 1, 'the second landing was not asked while LOIS was in flight');
  resolveAsk({ line: 'Buried at 73% — over the 50% line.' }); // valid for A, stale for the room
  await flush();
  stop();
  assert.equal(S().fieldReview.voice.backend, 'rules', 'the standing record keeps its own rules line');
  assert.equal(S().fieldReview.voice.line, rulesVoice(b).line);
  assert.deepEqual(lines, [LINES.markCover, rulesVoice(b).line], 'only rules lines were ever spoken');
});

await oka('the ask cap: a proposal landing past 300 ms is dropped; inside it, it lands', async () => {
  setup(4242);
  let t = 1000;
  const model = fakeModel({ reply: () => ({ line: 'Buried at 73% — over the 50% line.' }) });
  const late = wire({ model, now: () => t });
  bank({ ...J.markCover });
  t = 1000 + 301;
  await flush();
  late.stop();
  assert.equal(S().fieldReview.voice.backend, 'rules');

  setup(4242);
  t = 1000;
  const model2 = fakeModel({ reply: () => ({ line: 'Buried at 73% — over the 50% line.' }) });
  const inTime = wire({ model: model2, now: () => t });
  bank({ ...J.markCover, stream: 'poem:5' });
  t = 1000 + 299;
  await flush();
  inTime.stop();
  assert.equal(S().fieldReview.voice.backend, 'apple');
});

await oka('replaying: the voice is muted — no speech, no voice, no asks', async () => {
  setup(4242);
  const model = fakeModel({ reply: () => ({ line: 'Buried at 73% — over the 50% line.' }) });
  let replaying = true;
  const { lines, stop } = wire({ model, isReplaying: () => replaying });
  bank({ ...J.markCover });
  await flush();
  assert.deepEqual(lines, []);
  assert.equal(model.asks.length, 0);
  assert.ok(!('voice' in S().fieldReview));
  replaying = false;
  bank({ ...J.crop, stream: 'poem:6' });
  await flush();
  stop();
  assert.deepEqual(lines, [LINES.crop], 'the driver is live again once the take ends');
});

ok('the store guard: a voice for another record, a downgrade, or a wrong persona changes nothing', () => {
  setup(4242);
  bank({ ...J.markCover });
  const before = JSON.stringify(S().fieldReview);
  S().amendFieldReviewVoice(
    { persona: 'lois', line: 'x', bar: 1, backend: 'apple', seed: 1 },
    { seed: 999, stream: 'poem:0' },
  );
  assert.equal(JSON.stringify(S().fieldReview), before, 'a stale key is refused');
  S().amendFieldReviewVoice(
    { persona: 'davis', line: 'WOO HOO.', bar: 1, backend: 'apple', seed: 1 },
    { seed: 11, stream: 'poem:0' },
  );
  assert.equal(JSON.stringify(S().fieldReview), before, 'the wrong persona is refused');
  S().amendFieldReviewVoice(
    { persona: 'lois', line: 'Buried at 73% — over the 50% line.', bar: 1, backend: 'apple', seed: 5 },
    { seed: 11, stream: 'poem:0' },
  );
  assert.equal(S().fieldReview.voice.backend, 'apple');
  S().amendFieldReviewVoice(
    { persona: 'lois', line: LINES.markCover, bar: 1, backend: 'rules', seed: 11 },
    { seed: 11, stream: 'poem:0' },
  );
  assert.equal(S().fieldReview.voice.backend, 'apple', 'a rules line never overwrites a model line');
});

// ---------------------------------------------------------------------------
// 6. End-to-end through the real deal paths + slice-1 integrity.
// ---------------------------------------------------------------------------
ok('end-to-end: a real CURATOR press landing is spoken, and its record minus voice is the unvoiced deal’s', () => {
  setup(4242);
  const { lines, stop } = wire({ model: null });
  S().curateUnlocked();
  stop();
  const spoken = S().fieldReview;
  assert.ok(spoken, 'the press banked its record (slice 1)');
  setup(4242);
  S().curateUnlocked();
  const unvoiced = S().fieldReview;
  const { voice, ...rest } = spoken;
  assert.equal(JSON.stringify(rest), JSON.stringify(unvoiced), 'the voice changed nothing about the record');
  if (spoken.verdict === 'exempt') {
    assert.deepEqual(lines, []);
    assert.ok(!('voice' in spoken));
  } else {
    assert.deepEqual(lines, [voice.line]);
    assert.equal(voice.backend, 'rules');
    assert.deepEqual(voice, voiceForRecord(unvoiced, 7));
  }
});

await oka(
  'replay never re-asks: a re-derived landing under playback asks nothing and banks slice 1’s record',
  async () => {
    setup(4242);
    const model = fakeModel({ reply: () => null });
    let replaying = false;
    const { lines, stop } = wire({ model, isReplaying: () => replaying });
    S().curateUnlocked();
    await flush();
    const asksLive = model.asks.length;
    const linesLive = lines.length;
    const live = S().fieldReview;
    replaying = true; // the take plays back: the same deal re-derives its record
    setup(4242);
    S().curateUnlocked();
    await flush();
    stop();
    assert.equal(model.asks.length, asksLive, 'no backend was asked during playback');
    assert.equal(lines.length, linesLive, 'nothing was re-spoken during playback');
    const { voice, ...rest } = live;
    assert.equal(
      JSON.stringify(S().fieldReview),
      JSON.stringify(rest),
      'the re-derived record is slice 1’s, bit-for-bit',
    );
  },
);

console.log(`fieldReviewVoice.selfcheck: ${n} checks passed`);
