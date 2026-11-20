// node src/personas/personaAdapters.selfcheck.mjs
// Persona Adapters A1 (#2394) — the taste.json `personas` section, the decision-feature universe,
// the per-persona tree walk, the earn-in gate, head steering in the band (the head sets the odds),
// and the take's head stamp (only the heads that actually steered).
//
// Matt's four rulings on #2394 are the contract:
//   Q1 a NEW decision-feature universe (curator/decisionFeatures.mjs), named + versioned — not the
//      recipe feature set; A2 trains against this same module.
//   Q2 steering = the head's keep-probability replaces the tuning-odds draw; the decision stays a
//      draw. Before a head earns in, behaviour is byte-identical to today.
//   Q3 heads are per persona per turn kind, keyed by A0's label kinds (solo / trade / cut).
//   Q4 the take stamp lives in the band section and lists ONLY the heads that actually steered.
//
// The shipped tuning table's band numbers are NULL (unruled), so every band behaviour below runs on
// the same clearly-marked FIXTURE table band.selfcheck.mjs uses — made up here, never exported,
// never reachable from shipped code.
import assert from 'node:assert/strict';
import { Events, on } from '../composition/eventBus.js';
import { TUNING_DEFAULTS, validateTuning } from './tuning.mjs';
import { BAND_SEATS, BAND_SOLOISTS, BAND_ANSWERERS, createBandState, stepBand } from './band.mjs';
import { createBandRecorder, checkBandRecord, replayBandFrame, endBandReplay } from './bandRecord.mjs';
import {
  validateTaste,
  validatePersonasSection,
  personaHeadEarnedIn,
  steeringHeads,
  scoreTreeHeadWith,
  HEAD_MIN_FIDELITY,
  EARN_IN_MIN_LABELED_TURNS,
  PERSONA_HEAD_IDS,
  PERSONA_HEAD_STRUCTURE,
} from '../curator/tasteHead.js';
import {
  decisionFeatures,
  decisionFeatureNames,
  DECISION_FEATURES_VERSION,
  PERSONA_DECISION_KINDS,
} from '../curator/decisionFeatures.mjs';
import { recipeFeatures, FEATURES_VERSION } from '../curator/recipeFeatures.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const clone = (o) => JSON.parse(JSON.stringify(o));

// ── FIXTURE: a made-up, fully ruled tuning table (test-only, as in band.selfcheck.mjs) ──────────────
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

/** Play phrases 0..n-1 on a tuning table, with an optional steering bundle. Returns turns + steered. */
function play(tuning, { seed = 7, n: phrases = 12, ctx = () => ({}), heads = undefined } = {}) {
  let state = createBandState();
  const turns = [];
  const steered = [];
  for (let phrase = 0; phrase < phrases; phrase++) {
    const r = stepBand(state, { phrase, ...ctx(phrase) }, { seed, tuning, heads });
    state = r.state;
    turns.push(...r.turns);
    steered.push(...r.steered);
  }
  return { turns, state, steered };
}

// ── FIXTURE heads: tiny tree ensembles over the decision universe ───────────────────────────────────
const treeHead = (features, trees, fidelity = 0.9) => ({
  kind: 'xgboost-trees',
  objective: 'binary:logistic',
  baseScore: 0,
  fidelity,
  fitOn: 240,
  features,
  trees,
});
const leafHead = (v, fidelity) => treeHead(['num.heat'], [{ leaf: v }], fidelity);
/** Scores ≈1 for the verdict 'agree', ≈0 for any other verdict (split on the candidate verdict). */
const agreeHead = () =>
  treeHead(['verdict'], [{ f: 0, op: '=', v: 'agree', y: { leaf: 6 }, n: { leaf: -6 }, gain: 1 }]);
const entry = (kind, head, { version = 1, labeledTurns = 240, heldOut = 0.6 } = {}) => ({
  version,
  kind,
  head,
  labeledTurns,
  heldOut,
  trainedAt: '2026-11-20T00:00:00Z',
});
/** A whole taste file (linear main head, as tasteHead.selfcheck.mjs builds) with a personas section. */
const tasteFile = (personas) => ({
  kind: 'kc-taste',
  version: 1,
  featuresVersion: FEATURES_VERSION,
  model: 'm',
  dims: 0,
  labels: { likes: 1, passes: 1 },
  trainedAt: '',
  head: { terms: {}, num: {}, bias: 0, fidelity: 0.5, fitOn: 10 },
  ...(personas !== undefined ? { personas } : {}),
});
/** A taste file → its steering bundle, through the real validation + gate. */
const bundle = (personas) => {
  const r = validateTaste(tasteFile(personas));
  assert.equal(r.ok, true);
  return steeringHeads(r.taste);
};

// ── Q1: the decision-feature universe ───────────────────────────────────────────────────────────────
ok('universe: versioned, named, and binding — decision inputs plus recipe features under their prefix', () => {
  assert.equal(DECISION_FEATURES_VERSION, 1);
  const names = decisionFeatureNames();
  assert.equal(new Set(names).size, names.length, 'no duplicate feature name');
  for (const c of ['phase', 'caller', 'verdict', 'move', 'target']) assert.ok(names.includes(c), c);
  for (const k of ['bar', 'bpm', 'energy', 'beatConfidence', 'density', 'coverage', 'heat', 'recentKeepRate', 'pressure', 'soloAge'])
    assert.ok(names.includes(`num.${k}`), `num.${k}`);
  assert.ok(names.includes('recipe.system'), 'recipe categoricals ride under recipe.');
  assert.ok(names.includes('num.recipe.count'), 'recipe numerics ride under num.recipe.');
  assert.ok(!names.includes('system') && !names.includes('num.count'), 'the recipe universe never leaks unprefixed');
});
ok('universe: the decision kinds are A0\'s label kinds — one vocabulary end to end', () => {
  assert.deepEqual([...PERSONA_DECISION_KINDS], ['solo', 'trade', 'cut']);
});
ok('encoding: any subset of inputs is a valid vector; absence is one consistent fact', () => {
  assert.deepEqual(decisionFeatures(), { num: {} });
  assert.deepEqual(decisionFeatures(null), { num: {} });
  const f = decisionFeatures({ caller: 'davis', verdict: 'agree', heat: 0.5, bpm: 120, energy: 'loud', soloAge: 2 });
  assert.equal(f.caller, 'davis');
  assert.equal(f.verdict, 'agree');
  assert.equal(f.num.heat, 0.5);
  assert.equal(f.num.bpm, 120);
  assert.equal(f.num.soloAge, 2);
  assert.equal('energy' in f.num, false, 'a non-numeric numeric is omitted, never coerced');
  const r = decisionFeatures({ recipe: recipeFeatures() });
  assert.equal(typeof r['recipe.system'], 'string');
  assert.equal(typeof r.num['recipe.count'], 'number');
  const viaParams = decisionFeatures({ layoutParams: {} });
  assert.equal(viaParams['recipe.system'], r['recipe.system'], 'layoutParams and a ready vector agree');
  // principle scores are carried in the encoding but NOT bindable in v1 (the census names none yet)
  const p = decisionFeatures({ principles: { hierarchy: 0.7 } });
  assert.equal(p.num['principle.hierarchy'], 0.7);
  assert.ok(!decisionFeatureNames().includes('num.principle.hierarchy'));
});
ok('walk: a persona head scores over decision features — the verdict candidate is the input', () => {
  const head = validateTaste(tasteFile({ lois: { trade: entry('trade', agreeHead()) } })).taste.personas.lois.trade.head;
  assert.ok(scoreTreeHeadWith(head, decisionFeatures({ verdict: 'agree' })) > 0.99);
  assert.ok(scoreTreeHeadWith(head, decisionFeatures({ verdict: 'disagree' })) < 0.01);
  assert.ok(scoreTreeHeadWith(head, decisionFeatures({ verdict: 'layOut' })) < 0.01);
  assert.ok(scoreTreeHeadWith(head, decisionFeatures({})) < 0.01, 'an absent categorical fails the = test');
});

// ── the section: validation and the neutralizing precedent ──────────────────────────────────────────
ok('section: a taste file with no personas section validates to exactly the pre-A1 object', () => {
  const r = validateTaste(tasteFile());
  assert.equal(r.ok, true);
  assert.equal('personas' in r.taste, false);
  assert.deepEqual(Object.keys(r.taste).sort(), ['dims', 'featuresVersion', 'head', 'kind', 'labels', 'model', 'trainedAt', 'version']);
});
ok('section: a valid section is kept, cleaned, and stamped with the universe version', () => {
  const r = validateTaste(
    tasteFile({
      davis: { solo: entry('solo', leafHead(1)), trade: entry('trade', agreeHead(), { version: 2 }) },
      lois: { trade: entry('trade', agreeHead(), { version: 3 }) },
      governor: { cut: entry('cut', leafHead(2)) },
    }),
  );
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.taste.personas).sort(), ['davis', 'governor', 'lois']);
  assert.equal(r.taste.personas.lois.trade.version, 3);
  assert.equal(r.taste.personas.davis.solo.featuresVersion, DECISION_FEATURES_VERSION);
  assert.equal(r.taste.personas.davis.trade.head.kind, 'xgboost-trees');
});
ok('section: a bad section NEUTRALIZES (queen/chapters law) — the file and its heads survive', () => {
  const badSections = [
    ['the rhythm section gets no entry in A1', { queen: { trade: entry('trade', agreeHead()) } }],
    ['an unknown seat', { nobody: { trade: entry('trade', agreeHead()) } }],
    ['a head splitting on a feature outside the universe', { lois: { trade: entry('trade', treeHead(['num.bogus'], [{ leaf: 1 }])) } }],
    ['a head splitting on a RECIPE feature (wrong universe)', { lois: { trade: entry('trade', treeHead(['num.count'], [{ leaf: 1 }])) } }],
    ['kind does not match its key', { lois: { trade: entry('solo', leafHead(1)) } }],
    ['a structurally impossible head (LOIS never solos)', { lois: { solo: entry('solo', leafHead(1)) } }],
    ['a structurally impossible head (a horn holds no cut head)', { carson: { cut: entry('cut', leafHead(1)) } }],
    ['heldOut out of range', { lois: { trade: entry('trade', agreeHead(), { heldOut: 1.5 }) } }],
    ['labeledTurns negative', { lois: { trade: entry('trade', agreeHead(), { labeledTurns: -1 }) } }],
    ['version below 1', { lois: { trade: entry('trade', agreeHead(), { version: 0 }) } }],
    ['trained on a stale feature universe', { lois: { trade: { ...entry('trade', agreeHead()), featuresVersion: 99 } } }],
    ['an empty persona entry', { davis: {} }],
    ['the section is an array', []],
    ['a linear head where a tree head belongs', { lois: { trade: entry('trade', { terms: {}, num: {}, bias: 0, fidelity: 0.5 }) } }],
  ];
  for (const [why, personas] of badSections) {
    const r = validateTaste(tasteFile(personas));
    assert.equal(r.ok, true, `${why}: the file still validates`);
    assert.equal('personas' in r.taste, false, `${why}: the section is dropped`);
    assert.ok(r.taste.head, `${why}: the main head is untouched`);
    assert.equal(validatePersonasSection(personas), null, why);
  }
});
ok('structure pins: the artifact\'s seats and kinds mirror the band\'s own structure', () => {
  assert.deepEqual([...PERSONA_HEAD_IDS], Object.keys(BAND_SEATS).filter((id) => id !== 'queen'));
  assert.deepEqual([...PERSONA_HEAD_STRUCTURE.solo], [...BAND_SOLOISTS]);
  assert.deepEqual([...PERSONA_HEAD_STRUCTURE.trade], [...BAND_ANSWERERS]);
  assert.deepEqual([...PERSONA_HEAD_STRUCTURE.cut], ['governor']);
});

// ── the earn-in gate ────────────────────────────────────────────────────────────────────────────────
ok('earn-in: ≥200 labeled turns AND held-out ≥ 0.3 — both, at the boundary, no switch', () => {
  assert.equal(EARN_IN_MIN_LABELED_TURNS, 200);
  assert.equal(HEAD_MIN_FIDELITY, 0.3);
  const e = (labeledTurns, heldOut) => entry('trade', agreeHead(), { labeledTurns, heldOut });
  assert.equal(personaHeadEarnedIn(e(199, 0.99)), false);
  assert.equal(personaHeadEarnedIn(e(200, 0.29)), false);
  assert.equal(personaHeadEarnedIn(e(200, 0.3)), true);
  assert.equal(personaHeadEarnedIn(e(2000, 0.31)), true);
  assert.equal(personaHeadEarnedIn(null), false);
  assert.equal(personaHeadEarnedIn({}), false);
});
ok('earn-in: the steering bundle holds ONLY earned-in heads, and is null when there are none', () => {
  assert.equal(steeringHeads(null), null);
  assert.equal(steeringHeads(validateTaste(tasteFile()).taste), null, 'no section, no bundle');
  const b = bundle({
    davis: { solo: entry('solo', leafHead(1), { version: 2 }), trade: entry('trade', agreeHead(), { labeledTurns: 150 }) },
    lois: { trade: entry('trade', agreeHead(), { version: 3 }) },
    governor: { cut: entry('cut', leafHead(2), { heldOut: 0.29 }) },
  });
  assert.deepEqual(Object.keys(b).sort(), ['davis', 'lois']);
  assert.deepEqual(Object.keys(b.davis), ['solo'], 'the below-turns trade head is not in the bundle');
  assert.equal(b.davis.solo.version, 2);
  assert.equal(b.lois.trade.version, 3);
  assert.equal(bundle({ lois: { trade: entry('trade', agreeHead(), { labeledTurns: 3 }) } }), null, 'nothing earned in, no bundle');
});

// ── Q2: steering — the head sets the odds ───────────────────────────────────────────────────────────
ok('steering (trade): an earned-in head\'s probabilities become the answerer\'s odds', () => {
  const t = fixture({ heat: LEAD, len: 6, odds: Object.fromEntries(BAND_ANSWERERS.map((id) => [id, [0.34, 0.33, 0.33]])) });
  const heads = bundle({ lois: { trade: entry('trade', agreeHead(), { version: 3 }) } });
  for (let seed = 1; seed <= 12; seed++) {
    const { turns, steered } = play(t, { seed, n: 4, heads });
    const trade = turns.find((x) => x.kind === 'trade');
    assert.ok(trade, `seed ${seed}: a trade happens`);
    assert.equal(trade.answers.find((a) => a.by === 'lois').verdict, 'agree', `seed ${seed}: LOIS agrees — her head said so`);
    const loisSteered = [...new Map(steered.map((s) => [`${s.id}|${s.kind}`, s])).values()];
    assert.deepEqual(loisSteered, [{ id: 'lois', kind: 'trade', version: 3 }], 'her head, and only hers, steered');
  }
});
ok('steering (solo): an earned-in solo head outweighs the tuned heat', () => {
  const t = fixture({ heat: { davis: 0.9, carson: 0.05, greiman: 0.05, ashworth: 0.05 }, rate: 0, len: 1 });
  const heads = bundle({ davis: { solo: entry('solo', leafHead(-20)) } }); // DAVIS's head: never take it
  for (let seed = 1; seed <= 10; seed++) {
    const { turns } = play(t, { seed, n: 12, heads });
    assert.ok(turns.some((x) => x.kind === 'solo'), `seed ${seed}: solos happen`);
    assert.ok(turns.every((x) => x.kind !== 'solo' || x.by !== 'davis'), `seed ${seed}: DAVIS never solos under his head`);
  }
  const control = play(t, { seed: 7, n: 12 });
  assert.ok(control.turns.some((x) => x.kind === 'solo' && x.by === 'davis'), 'control: on heat alone DAVIS solos');
});
ok('steering (cut): an earned-in cut head replaces the tuned line — both ways', () => {
  const t = fixture({ heat: LEAD, rate: 0, len: 8, cut: 0.8 });
  const eager = bundle({ governor: { cut: entry('cut', leafHead(20), { version: 1 }) } }); // always cut
  const calm = play(t, { seed: 7, n: 4, ctx: () => ({ pressure: 0 }) });
  assert.deepEqual(calm.turns.map((x) => x.kind), ['in', 'solo'], 'control: under the line, no cut');
  const cutRun = play(t, { seed: 7, n: 4, ctx: () => ({ pressure: 0 }), heads: eager });
  assert.deepEqual(cutRun.turns.find((x) => x.kind === 'cut'), { kind: 'cut', phrase: 2, by: 'governor', target: 'davis' });
  assert.deepEqual(cutRun.steered, [{ id: 'governor', kind: 'cut', version: 1 }]);
  const patient = bundle({ governor: { cut: entry('cut', leafHead(-20)) } }); // never cut
  const pressed = play(t, { seed: 7, n: 6, ctx: (p) => ({ pressure: p >= 2 ? 0.95 : 0 }), heads: patient });
  assert.ok(pressed.turns.every((x) => x.kind !== 'cut'), 'over the line, the head still says let it play');
  assert.ok(pressed.steered.length > 0, 'the head was consulted — it steered by refusing');
});
ok('byte-identical rails: no heads, empty heads, and below-gate heads all play exactly today\'s band', () => {
  const t = fixture({ rate: 0.7, len: 2, cut: 0.5 });
  const ctx = (p) => ({ pressure: p % 11 === 10 ? 0.9 : 0, hold: { keep: p === 17 }, ending: p === 29 });
  const belowGate = bundle({ lois: { trade: entry('trade', agreeHead(), { labeledTurns: 199 }) } });
  assert.equal(belowGate, null, 'a below-gate head never reaches the band');
  for (let seed = 1; seed <= 8; seed++) {
    const base = play(t, { seed, n: 60, ctx });
    assert.deepEqual(play(t, { seed, n: 60, ctx, heads: null }).turns, base.turns, `seed ${seed}: heads null`);
    assert.deepEqual(play(t, { seed, n: 60, ctx, heads: {} }).turns, base.turns, `seed ${seed}: heads empty`);
    assert.deepEqual(play(t, { seed, n: 60, ctx, heads: belowGate }).turns, base.turns, `seed ${seed}: below gate`);
    assert.deepEqual(base.steered, [], 'nothing steered');
  }
  // and heads can never steer an unruled band: readiness is checked before any head is consulted
  const r = stepBand(createBandState(), { phrase: 0 }, { seed: 1, heads: bundle({ governor: { cut: entry('cut', leafHead(20)) } }) });
  assert.ok(Array.isArray(r.unruled) && r.unruled.length > 0);
  assert.deepEqual(r.turns, []);
  assert.deepEqual(r.steered, []);
});

// ── Q4: the take stamp ──────────────────────────────────────────────────────────────────────────────
function record(turns, steered, seed = 11) {
  let frame = 0;
  const rec = createBandRecorder({ getFrame: () => frame, seed });
  for (const t of turns) {
    frame = t.phrase * 480;
    rec.update(t);
  }
  if (steered) rec.noteHeads(steered);
  return rec.finish();
}
ok('stamp: the band section lists ONLY the heads that actually steered, with versions', () => {
  const t = fixture({ heat: LEAD, len: 6 });
  const heads = bundle({
    lois: { trade: entry('trade', agreeHead(), { version: 3 }) },
    davis: { solo: entry('solo', leafHead(1), { version: 2 }) }, // loaded, and DAVIS does solo — but see below
  });
  const { turns, steered } = play(t, { seed: 11, n: 6, heads });
  const section = record(turns, steered);
  assert.ok(section);
  const stamped = Object.fromEntries(section.heads.map((h) => [`${h.id}|${h.kind}`, h.version]));
  assert.equal(stamped['lois|trade'], 3);
  assert.equal(stamped['davis|solo'], 2, 'DAVIS\'s head weighed his solo pick — it steered');
  const checked = checkBandRecord(JSON.parse(JSON.stringify(section)));
  assert.deepEqual(checked.heads, section.heads, 'the stamp survives the check, copied');
});
ok('stamp: no steering, no stamp — the section is exactly the pre-A1 shape', () => {
  const t = fixture({ heat: LEAD, len: 3 });
  const { turns } = play(t, { seed: 11, n: 5 });
  const section = record(turns, null);
  assert.equal('heads' in section, false);
  assert.deepEqual(Object.keys(section).sort(), ['seed', 'turns', 'version']);
  assert.equal('heads' in checkBandRecord(section), false, 'an old take checks back with no stamp key');
  // a recorder told about malformed steering writes nothing
  const rec = createBandRecorder({ seed: 1 });
  rec.update({ kind: 'in', phrase: 0, by: 'governor' });
  rec.noteHeads([{ id: 'queen', kind: 'trade', version: 1 }, { id: 'lois', kind: 'dance', version: 1 }, null, 'x']);
  assert.equal('heads' in rec.finish(), false);
});
ok('stamp: the check is fail-closed on a bad stamp; replay never reads it', () => {
  const t = fixture({ heat: LEAD, len: 6 });
  const heads = bundle({ lois: { trade: entry('trade', agreeHead(), { version: 3 }) } });
  const { turns, steered } = play(t, { seed: 11, n: 6, heads });
  const section = record(turns, steered);
  const bad = (mut) => {
    const s = JSON.parse(JSON.stringify(section));
    mut(s);
    return checkBandRecord(s);
  };
  assert.equal(bad((s) => s.heads.push({ id: 'queen', kind: 'trade', version: 1 })), null, 'she holds no head in A1');
  assert.equal(bad((s) => s.heads.push({ id: 'lois', kind: 'trade', version: 9 })), null, 'one entry per (id, kind)');
  assert.equal(bad((s) => (s.heads[0].kind = 'yield')), null, 'a stamp kind is a decision kind');
  assert.equal(bad((s) => (s.heads[0].version = 0)), null);
  assert.equal(bad((s) => (s.heads = 'lois')), null);
  // replay exact with stamped versions: the same turns come off the bus, stamp or no stamp
  const heard = [];
  const off = on(Events.BAND_TURN, (p) => heard.push(p));
  const run = (sec) => {
    heard.length = 0;
    endBandReplay();
    const total = sec.turns[sec.turns.length - 1][0];
    let published = 0;
    for (let f = 0; f <= total; f += 1) published += replayBandFrame(f, sec);
    return { published, heard: [...heard] };
  };
  const withStamp = run(JSON.parse(JSON.stringify(section)));
  const bare = JSON.parse(JSON.stringify(section));
  delete bare.heads;
  const withoutStamp = run(bare);
  assert.equal(withStamp.published, turns.length);
  assert.deepEqual(withStamp.heard, withoutStamp.heard, 'the stamp changes nothing playback says');
  assert.deepEqual(withStamp.heard, turns);
  endBandReplay();
  off();
});

console.log(`personaAdapters.selfcheck: ${n} checks passed`);
