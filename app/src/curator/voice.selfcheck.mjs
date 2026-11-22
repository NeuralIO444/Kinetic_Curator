// voice.selfcheck — Persona Adapters A7 (#2400): the horns' line chooser over Matt-signed lines.
//
//   node src/curator/voice.selfcheck.mjs
//
// The laws under test (rulings on #2400):
//   - the voice universe is the horns' alone (line / ctx / to), versioned separately; the
//     taste's voice section validates per horn and neutralizes when malformed;
//   - earn-in is the one law: ≥200 labeled line-moments AND held-out ≥0.3, per horn;
//   - until a horn's chooser earns in, today's selection runs untouched (the chooser with no
//     head IS lineFor); with a head, the head ranks the signed candidates and the soft decay
//     dips a just-used line's rank, recovering over VOICE_DECAY_TURNS calls;
//   - empty set = silence, under both paths — an unsigned line is never a candidate;
//   - ACCEPTANCE: every line the chooser can pick exists in the signed copy matrix — the
//     chooser only ever ranks signedCandidates over HORN_LINES, which hornLines.selfcheck
//     pins character-for-character against the matrix page;
//   - the boot bridge lands the section per horn (damage falls back alone) — and the launch
//     note / snapshot stay personas-only: a voice-only store writes neither.
import assert from 'node:assert/strict';
import { voiceFeatures, voiceFeatureNames, VOICE_FEATURES_VERSION } from './voiceFeatures.mjs';
import { validateVoiceSection, voiceHeadEarnedIn, voiceHeads, validateTaste, VOICE_HORN_IDS } from './tasteHead.js';
import { FEATURES_VERSION } from './recipeFeatures.js';
import { HORN_LINES, callsignOf, lineFor, linesForTurn, signedCandidates, turnMoments } from './hornLines.mjs';
import { createVoiceChooser, VOICE_DECAY_DIP, VOICE_DECAY_TURNS } from './voiceChooser.mjs';
import { voiceOverlayFromStoreText, personasOverlayFromStoreText } from './personaHeadsBridge.mjs';
import { loadPersonaHeadsAtBoot, LAUNCH_NOTE_KEY, HEADS_SNAPSHOT_KEY } from './personaHeadsLive.js';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// A stump that loves one line id: split on the categorical 'line' (feature index 1 in the
// sorted universe [ctx, line, to]) — the named line walks to +2, everything else to −2.
const stumpFor = (lineId) => ({
  kind: 'xgboost-trees',
  objective: 'binary:logistic',
  baseScore: 0,
  fidelity: 0.8,
  fitOn: 200,
  features: ['ctx', 'line', 'to'],
  trees: [{ f: 1, op: '=', v: lineId, gain: 1, y: { leaf: 2 }, n: { leaf: -2 } }],
});
const vEntry = (over = {}) => ({
  version: 1,
  kind: 'voice',
  head: stumpFor('H01'),
  labeledTurns: 240,
  heldOut: 0.6,
  trainedAt: '2026-11-22T03:30:00.000Z',
  featuresVersion: VOICE_FEATURES_VERSION,
  ...over,
});
const SIGNED = HORN_LINES.map((l) => ({ ...l, signed: true }));

await ok('the universe: line + ctx + to, nothing else — no content, no heat', () => {
  assert.deepEqual(voiceFeatureNames(), ['ctx', 'line', 'to']);
  assert.deepEqual(voiceFeatures({ line: 'H01', ctx: 'agree', to: 'davis', heat: 0.9 }), {
    line: 'H01',
    ctx: 'agree',
    to: 'davis',
    num: {},
  });
  assert.deepEqual(voiceFeatures({}), { num: {} }, 'absent stays absent');
  assert.deepEqual(VOICE_HORN_IDS, ['carson', 'greiman', 'ashworth'], 'only the horns speak');
});

await ok('the section validates per horn — and neutralizes when malformed', () => {
  const clean = validateVoiceSection({ carson: { ...vEntry(), junk: 'dropped' }, greiman: vEntry() });
  assert.deepEqual(Object.keys(clean).sort(), ['carson', 'greiman']);
  assert.equal(clean.carson.junk, undefined, 'rebuilt from known fields only');
  assert.equal(validateVoiceSection({ davis: vEntry() }), null, 'a non-horn seat is malformed');
  assert.equal(validateVoiceSection({ queen: vEntry() }), null, 'she never speaks, never holds a voice head');
  assert.equal(validateVoiceSection({ carson: vEntry({ kind: 'trade' }) }), null, "the entry's kind is its section's");
  assert.equal(validateVoiceSection({ carson: vEntry({ labeledTurns: -1 }) }), null);
  assert.equal(validateVoiceSection({ carson: vEntry({ heldOut: 2 }) }), null);
  assert.equal(
    validateVoiceSection({ carson: vEntry({ featuresVersion: 99 }) }),
    null,
    'a stale universe is malformed',
  );
  assert.equal(
    validateVoiceSection({ carson: vEntry({ head: { ...stumpFor('H01'), features: ['num.heat'] } }) }),
    null,
    'a head naming a foreign feature is outside the universe',
  );
  assert.equal(validateVoiceSection(null), null);
  assert.equal(validateVoiceSection({}), null, 'an empty section is no section');
  const baseTaste = () => ({
    kind: 'kc-taste',
    version: 1,
    featuresVersion: FEATURES_VERSION,
    model: 'm',
    dims: 1152,
    labels: { likes: 42, passes: 180 },
    trainedAt: '2026-09-30T00:00:00Z',
    head: { terms: { 'scale=large': 1.5 }, num: { count: -2 }, bias: 0.1, fidelity: 0.71, fitOn: 222 },
  });
  const good = validateTaste({ ...baseTaste(), voice: { carson: vEntry() } });
  assert.equal(good.ok, true);
  assert.equal(good.taste.voice.carson.labeledTurns, 240);
  const bad = validateTaste({ ...baseTaste(), voice: { carson: vEntry({ heldOut: 7 }) } });
  assert.equal(bad.ok, true);
  assert.equal(bad.taste.voice, undefined, 'a malformed section drops; the taste stands');
});

await ok('earn-in: 200 labeled moments and 0.3 held-out, per horn', () => {
  assert.equal(voiceHeadEarnedIn(vEntry({ labeledTurns: 199 })), false);
  assert.equal(voiceHeadEarnedIn(vEntry({ labeledTurns: 200, heldOut: 0.29 })), false);
  assert.equal(voiceHeadEarnedIn(vEntry({ labeledTurns: 200, heldOut: 0.3 })), true);
  assert.equal(voiceHeadEarnedIn(null), false);
  const taste = {
    voice: { carson: vEntry(), greiman: vEntry({ labeledTurns: 12 }), ashworth: vEntry({ version: 3 }) },
  };
  const heads = voiceHeads(taste);
  assert.deepEqual(Object.keys(heads).sort(), ['ashworth', 'carson'], 'only earned-in horns steer');
  assert.equal(heads.ashworth.version, 3);
  assert.equal(voiceHeads({}), null);
  assert.equal(voiceHeads({ voice: { carson: vEntry({ labeledTurns: 3 }) } }), null, 'none earned in = no bundle');
});

await ok('moments: a trade turn’s horn answers, then the cut — one logic for live and training', () => {
  const turn = {
    kind: 'trade',
    by: 'davis',
    answers: [
      { by: 'carson', verdict: 'agree', move: 'build' },
      { by: 'lois', verdict: 'agree', move: 'build' },
      { by: 'greiman', verdict: 'disagree', move: 'counter' },
    ],
  };
  assert.deepEqual(turnMoments(turn), [
    { persona: 'carson', ctx: 'agree', to: 'davis' },
    { persona: 'greiman', ctx: 'disagree', to: 'davis' },
  ]);
  const cut = { kind: 'trade', by: 'carson', answers: [{ by: 'lois', verdict: 'disagree', move: 'cut' }] };
  assert.deepEqual(turnMoments(cut), [{ persona: 'carson', ctx: 'cut', to: 'lois' }]);
  assert.deepEqual(turnMoments({ kind: 'solo', by: 'carson' }), []);
  assert.deepEqual(turnMoments(null), []);
});

await ok('no head = today’s selection, exactly (candidates[0] is lineFor’s pick)', () => {
  const chooser = createVoiceChooser(null, SIGNED);
  for (const m of [
    { persona: 'carson', ctx: 'agree', to: 'davis' },
    { persona: 'greiman', ctx: 'agree', to: 'ashworth' },
    { persona: 'ashworth', ctx: 'cut', to: 'lois' },
    { persona: 'greiman', ctx: 'disagree', to: 'carson' },
  ]) {
    assert.equal(chooser.choose(m)?.id, lineFor(m.persona, m.ctx, m.to, SIGNED)?.id, `moment ${m.persona}/${m.ctx}`);
  }
  // candidates keep lineFor's specificity order: addressee-specific before generic
  assert.deepEqual(
    signedCandidates('greiman', 'agree', 'ashworth', SIGNED).map((l) => l.id),
    ['H06', 'H05'],
  );
  // and the spoken lines match linesForTurn word for word
  const turn = {
    kind: 'trade',
    by: 'davis',
    answers: [
      { by: 'carson', verdict: 'agree', move: 'build' },
      { by: 'ashworth', verdict: 'layOut', move: 'rest' },
    ],
  };
  assert.deepEqual(createVoiceChooser(null, SIGNED).linesForTurn(turn), linesForTurn(turn, SIGNED));
});

await ok('empty set = silence, under both paths — unsigned is never a candidate', () => {
  const plain = createVoiceChooser(null); // the shipped table: every line unsigned
  assert.equal(plain.choose({ persona: 'carson', ctx: 'agree', to: 'davis' }), null);
  const headed = createVoiceChooser({ carson: { version: 1, head: stumpFor('H01') } });
  assert.equal(
    headed.choose({ persona: 'carson', ctx: 'agree', to: 'davis' }),
    null,
    'a head cannot conjure a signed line',
  );
  assert.deepEqual(
    headed.linesForTurn({ kind: 'trade', by: 'davis', answers: [{ by: 'carson', verdict: 'agree', move: 'build' }] }),
    [],
  );
});

await ok('with a head, the head ranks — and the decay dips a just-used line, then recovers', () => {
  // Two signed greiman/agree candidates for 'ashworth': H06 (specific) and H05 (generic).
  // A head that mildly prefers the generic H05 must pick it first; the dip then hands the
  // next identical moment to H06; after the recovery window the head's pick returns.
  const mild = {
    kind: 'xgboost-trees',
    objective: 'binary:logistic',
    baseScore: 0,
    fidelity: 0.8,
    fitOn: 200,
    features: ['ctx', 'line', 'to'],
    trees: [{ f: 1, op: '=', v: 'H05', gain: 1, y: { leaf: 0.11 }, n: { leaf: -0.11 } }],
  };
  const chooser = createVoiceChooser({ greiman: { version: 1, head: mild } }, SIGNED);
  const moment = { persona: 'greiman', ctx: 'agree', to: 'ashworth' };
  assert.equal(chooser.choose(moment).id, 'H05', 'the head outranks specificity order');
  assert.equal(chooser.choose(moment).id, 'H06', `the dip (${VOICE_DECAY_DIP}) hands the repeat to the runner-up`);
  let last = null;
  for (let i = 0; i < VOICE_DECAY_TURNS + 2; i++) last = chooser.choose(moment);
  assert.equal(last.id, 'H05', 'after the recovery window the head’s pick returns');
});

await ok('ACCEPTANCE: every chosen line exists in the signed copy matrix', () => {
  const matrix = new Map(HORN_LINES.map((l) => [l.id, l]));
  const chooser = createVoiceChooser(
    {
      carson: { version: 1, head: stumpFor('H02') },
      greiman: { version: 1, head: stumpFor('H08') },
      ashworth: { version: 1, head: stumpFor('H12') },
    },
    SIGNED,
  );
  const turns = [
    { kind: 'trade', by: 'davis', answers: [{ by: 'carson', verdict: 'disagree', move: 'counter' }] },
    { kind: 'trade', by: 'carson', answers: [{ by: 'greiman', verdict: 'disagree', move: 'counter' }] },
    { kind: 'trade', by: 'lois', answers: [{ by: 'ashworth', verdict: 'agree', move: 'build' }] },
    { kind: 'trade', by: 'greiman', answers: [{ by: 'lois', verdict: 'disagree', move: 'cut' }] },
  ];
  let spoken = 0;
  for (const t of turns)
    for (const l of chooser.linesForTurn(t)) {
      spoken += 1;
      const src = matrix.get(l.id);
      assert.ok(src, `the picked line ${l.id} exists in the copy matrix`);
      assert.equal(l.persona, src.horn);
      const fill = src.ctx === 'cut' ? 'COVER' : callsignOf(t.by);
      assert.equal(l.text, src.text.replace('{to}', fill), 'the spoken text is the matrix text, filled');
    }
  assert.ok(spoken >= 3, `the heads actually spoke (${spoken} lines)`);
});

await ok('the bridge: the section lands per horn, damage falls back alone, no note speaks of it', async () => {
  const store = JSON.stringify({
    kind: 'kc-taste',
    version: 1,
    voice: { carson: vEntry({ version: 2 }), greiman: { kind: 'voice' }, ashworth: vEntry() },
  });
  const overlay = voiceOverlayFromStoreText(store);
  assert.deepEqual(Object.keys(overlay).sort(), ['ashworth', 'carson'], 'the damaged horn falls back alone');
  assert.equal(overlay.carson.version, 2);
  assert.equal(voiceOverlayFromStoreText('{"voice":{"davis":{}}}'), null);
  assert.equal(voiceOverlayFromStoreText('not json'), null);
  assert.equal(personasOverlayFromStoreText(store), null, 'voice entries are not a personas overlay');
  const writes = {};
  const storage = { getItem: () => null, setItem: (k, v) => (writes[k] = v), removeItem: () => {} };
  let applied = null;
  const res = await loadPersonaHeadsAtBoot({
    isDesktop: () => true,
    appDataDir: async () => '/data',
    join: async (...p) => p.join('/'),
    readTextFile: async () => store,
    getTaste: () => ({ personas: {} }),
    overlay: () => false,
    overlayRelations: () => false,
    overlayQueenTiming: () => false,
    overlayVoice: (o) => ((applied = o), true),
    storage,
  });
  assert.deepEqual(res, { ok: true });
  assert.deepEqual(Object.keys(applied).sort(), ['ashworth', 'carson']);
  assert.equal(writes[LAUNCH_NOTE_KEY], undefined, 'no launch note for voice heads');
  assert.equal(writes[HEADS_SNAPSHOT_KEY], undefined, 'no snapshot churn for voice heads');
});

console.log(`voice.selfcheck: ${n} checks passed`);
