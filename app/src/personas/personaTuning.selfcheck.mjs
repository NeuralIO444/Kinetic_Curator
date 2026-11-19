// personaTuning.selfcheck.mjs — #2382 (Persona Kernel P2): the persona tuning table, `kc-persona-tuning/1`.
//
// Pins the slice's contract (docs/design/persona-kernel-spec.md §3c):
//   A  the shipped table: validates clean, carries the §3c shape exactly (band seats, per-persona band
//      fields, every directed relation pair, the band section), and ships today's measured values — the
//      numbers the code ran with before the table existed
//   B  the consumers: mindConduct / loisCut export the table's shipped values, so the constants every
//      existing pin reads are the table's, not a copy that can drift (the sway module's cross-pin
//      lives in its own suite, beside the module — the deniability geography)
//   C  the validator bites: drift, a probability out of range, half-ruled odds, odds that do not sum,
//      and a dangling answersFirst are each named as problems
//   D  the DEV rig: a live edit moves the mechanics without reload (the brake lets a bolder move in,
//      the cut gates stop cutting at zero), refused edits change nothing (unruled leaves, unknown
//      paths, invalid values), and Reset restores the shipped table
//   E  rig, never scene: tuning.mjs imports only its JSON — no store, no project, no storage — so an
//      edit cannot be saved anywhere; a fresh read of the module contract starts with no edits in force
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  TUNING_DEFAULTS,
  TUNING_PROBLEMS,
  TUNING_SCHEMA,
  TUNING_SEATS,
  personaTuning,
  tuningValue,
  tuningDefault,
  tuningOverrides,
  setTuningValue,
  resetTuning,
  validateTuning,
} from './tuning.mjs';
import { BRAKE_AT, BRAKE_MAX, DAVIS_MAX_ROUTES, BOLD_BAND, davisRoute } from '../curator/mindConduct.js';
import { LOIS_CUT_GATES, judgeDeal } from '../curator/loisCut.mjs';
import { CHAPTERS, chapterLooks } from '../data/chapters.js';

let passed = 0;
const ok = (name, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};
console.log('personaTuning.selfcheck');

const clone = (o) => JSON.parse(JSON.stringify(o));

// ── A · the shipped table ────────────────────────────────────────────────────
ok('A1 no drift: the shipped table validates against kc-persona-tuning/1', () => {
  assert.deepStrictEqual([...TUNING_PROBLEMS], []);
  assert.equal(TUNING_DEFAULTS.schema, TUNING_SCHEMA);
  assert.equal(TUNING_SCHEMA, 'kc-persona-tuning/1');
  assert.ok(Object.isFrozen(TUNING_DEFAULTS) && Object.isFrozen(TUNING_DEFAULTS.personas.lois.knobs));
});

ok('A2 the shape: exactly the band seats, their band fields, every relation pair, the band section', () => {
  assert.deepStrictEqual(Object.keys(TUNING_DEFAULTS.personas).sort(), [...TUNING_SEATS].sort());
  for (const id of TUNING_SEATS) {
    const s = TUNING_DEFAULTS.personas[id];
    for (const f of ['soloLengthPhrases', 'stepCap', 'odds', 'heat', 'answersFirst'])
      assert.ok(f in s, `${id}.${f} present`);
    assert.deepStrictEqual(Object.keys(s.odds).sort(), ['agree', 'disagree', 'layOut']);
  }
  const pairs = Object.keys(TUNING_DEFAULTS.relations);
  assert.equal(pairs.length, TUNING_SEATS.length * (TUNING_SEATS.length - 1));
  for (const a of TUNING_SEATS)
    for (const b of TUNING_SEATS) if (a !== b) assert.ok(`${a}->${b}` in TUNING_DEFAULTS.relations, `${a}->${b} present`);
  assert.deepStrictEqual(Object.keys(TUNING_DEFAULTS.band).sort(), ['bandleaderCut', 'maxHornsPerCall', 'tradeRate']);
});

ok("A3 today's measured values: the table ships the numbers the code ran with", () => {
  const p = TUNING_DEFAULTS.personas;
  assert.deepStrictEqual(p.lois.knobs.brake, { at: 0.5, max: 0.4 });
  assert.deepStrictEqual(p.lois.knobs.cutGates, { glance: 0.28, originality: 0.22, boldness: 0.3 });
  assert.deepStrictEqual(p.lois.knobs.flatRead, {
    biasSwing: 0.5,
    happyKeepRate: 0.15,
    biasFullAtRolls: 8,
    fluxHeld: 0.05,
    noiseFlat: 0.9,
    eps: 0.03,
    minLevel: 0.05,
    pinned: 0.92,
  });
  assert.equal(p.davis.knobs.boldBand, 0.5);
  assert.equal(p.davis.knobs.maxRoutes, 3);
  assert.deepStrictEqual(p.davis.knobs.backoff, { reverts: 3, bars: 32 });
  assert.deepStrictEqual(p.davis.knobs.spectrumOpeners, {
    low: { key: 'colour', value: 0.35 },
    mid: { key: 'scale', value: 0.3 },
    high: { key: 'displace', value: 0.4 },
  });
  assert.equal(p.queen.knobs.minKeeps, 8);
  assert.equal(p.queen.knobs.beatConfidence, 0.62);
  assert.deepStrictEqual(p.queen.knobs.m1, { bias: 0.06, proximity: 0.72 });
  assert.deepStrictEqual(p.queen.knobs.m2, { t0: 0.4, slope: 0.15, cap: 0.55, floor: 0.4 });
  assert.deepStrictEqual(p.queen.knobs.m3, { drift: 0.1 });
  assert.deepStrictEqual(p.queen.knobs.m4, { armMs: 40, holdPct: 0.08 });
  assert.deepStrictEqual(p.queen.knobs.m5, { gainPeak: 1.18 });
  assert.deepStrictEqual(p.queen.knobs.m6, { keeps: 3, strength: 0.35 });
  assert.deepStrictEqual(p.queen.knobs.m7, { confidence: 0.6, step: 3, deadband: 2, range: [60, 180] });
  assert.deepStrictEqual(p.queen.knobs.m8, {
    wetStep: 0.05,
    wetDeadband: 0.02,
    evolveRange: [200, 10000],
    evolveStep: 250,
    evolveDeadband: 100,
  });
});

ok('A4 the band fields ship unruled (null): no value has been measured or ruled for them yet', () => {
  for (const id of TUNING_SEATS) {
    const s = TUNING_DEFAULTS.personas[id];
    assert.equal(s.soloLengthPhrases, null, `${id}.soloLengthPhrases`);
    assert.equal(s.stepCap, null, `${id}.stepCap`);
    assert.equal(s.heat, null, `${id}.heat`);
    assert.equal(s.answersFirst, null, `${id}.answersFirst`);
    assert.deepStrictEqual(s.odds, { agree: null, disagree: null, layOut: null }, `${id}.odds`);
  }
  for (const v of Object.values(TUNING_DEFAULTS.relations)) assert.equal(v, null);
  assert.deepStrictEqual(TUNING_DEFAULTS.band, { tradeRate: null, maxHornsPerCall: null, bandleaderCut: null });
});

// ── B · the consumers read the table ─────────────────────────────────────────
ok("B1 the modules' exported constants are the table's shipped values", () => {
  assert.equal(BRAKE_AT, tuningDefault('personas.lois.knobs.brake.at'));
  assert.equal(BRAKE_MAX, tuningDefault('personas.lois.knobs.brake.max'));
  assert.equal(BOLD_BAND, tuningDefault('personas.davis.knobs.boldBand'));
  assert.equal(DAVIS_MAX_ROUTES, tuningDefault('personas.davis.knobs.maxRoutes'));
  assert.deepStrictEqual(LOIS_CUT_GATES, tuningDefault('personas.lois.knobs.cutGates'));
});

// ── C · the validator bites ──────────────────────────────────────────────────
ok('C1 drift and bad values are named as problems', () => {
  const missing = clone(TUNING_DEFAULTS);
  delete missing.personas.queen;
  assert.ok(validateTuning(missing).some((p) => p.includes('queen')), 'a missing seat is named');

  const unknown = clone(TUNING_DEFAULTS);
  unknown.personas.lois.knobs.brake.sideways = 1;
  assert.ok(validateTuning(unknown).some((p) => p.includes('sideways')), 'an unknown knob is named');

  const prob = clone(TUNING_DEFAULTS);
  prob.personas.lois.knobs.brake.max = 1.5;
  assert.ok(validateTuning(prob).some((p) => p.includes('brake.max')), 'a probability over 1 is named');

  const halfOdds = clone(TUNING_DEFAULTS);
  halfOdds.personas.carson.odds.agree = 0.5;
  assert.ok(validateTuning(halfOdds).some((p) => p.includes('odds')), 'half-ruled odds are named');

  const badSum = clone(TUNING_DEFAULTS);
  badSum.personas.carson.odds = { agree: 0.5, disagree: 0.3, layOut: 0.1 };
  assert.ok(validateTuning(badSum).some((p) => p.includes('sum')), 'odds that do not sum to 1 are named');

  const dangling = clone(TUNING_DEFAULTS);
  dangling.personas.carson.answersFirst = 'nobody';
  assert.ok(validateTuning(dangling).some((p) => p.includes('answersFirst')), 'a dangling answersFirst is named');

  const bias = clone(TUNING_DEFAULTS);
  bias.relations['carson->lois'] = 2;
  assert.ok(validateTuning(bias).some((p) => p.includes('carson->lois')), 'a relation bias out of [-1, 1] is named');

  const divisor = clone(TUNING_DEFAULTS);
  divisor.personas.davis.knobs.boldBand = 0;
  assert.ok(validateTuning(divisor).some((p) => p.includes('boldBand')), 'a zero divisor leaf is named');
});

// ── D · the DEV rig ──────────────────────────────────────────────────────────
ok('D1 no edits in force at rest: the table in force is the shipped table', () => {
  assert.deepStrictEqual(tuningOverrides(), {});
  assert.equal(personaTuning(), TUNING_DEFAULTS);
});

ok("D2 a live edit moves the mechanics without reload: LOIS's brake and his cut gates", () => {
  const show = { energy: 'high', bpm: 120, silent: false, routes: [], owned: [], flatBars: 0, brake: true };
  const braked = davisRoute(show, 0, 0);
  assert.ok(braked && braked.target !== 'clock.kinemeRate', 'under the shipped brake the daring clock move is out of reach');
  try {
    assert.equal(setTuningValue('personas.lois.knobs.brake.max', 1).ok, true);
    const lifted = davisRoute(show, 0, 0);
    assert.ok(
      JSON.stringify(lifted) !== JSON.stringify(braked),
      "raising brake.max changes Davis's pick on the same show, same seed — live, no reload",
    );

    // the cut: some dealt hand in some chapter cuts under the shipped gates…
    let cutSomewhere = false;
    for (const c of CHAPTERS) {
      const deck = chapterLooks(c.id).map((l) => l.params);
      if (!deck.length) continue;
      for (const look of chapterLooks(c.id)) if (judgeDeal(look.params, deck).cut) cutSomewhere = true;
    }
    assert.ok(cutSomewhere, 'the shipped gates cut somewhere (the sweep has teeth)');
    // …and with every gate at zero nothing can fall under one: no cuts, anywhere.
    for (const g of ['glance', 'originality', 'boldness'])
      assert.equal(setTuningValue(`personas.lois.knobs.cutGates.${g}`, 0).ok, true);
    for (const c of CHAPTERS) {
      const deck = chapterLooks(c.id).map((l) => l.params);
      if (!deck.length) continue;
      for (const look of chapterLooks(c.id))
        assert.equal(judgeDeal(look.params, deck).cut, false, `${c.id}/${look.id}: gates at zero, no cut`);
    }
  } finally {
    resetTuning();
  }
  assert.deepStrictEqual(tuningOverrides(), {}, 'reset clears every edit');
  assert.equal(personaTuning(), TUNING_DEFAULTS, 'after reset the shipped table is in force again');
  assert.equal(JSON.stringify(davisRoute(show, 0, 0)), JSON.stringify(braked), 'and the mechanics read the shipped values again');
});

ok('D3 refused edits change nothing: unruled leaves, unknown paths, sections, invalid values', () => {
  assert.equal(setTuningValue('band.tradeRate', 0.5).ok, false, 'an unruled leaf cannot be edited into a ruling');
  assert.equal(setTuningValue('relations.lois->davis', -0.5).ok, false, 'an unruled relation cannot be edited');
  assert.equal(setTuningValue('personas.lois.knobs.brake.nope', 1).ok, false, 'an unknown path is refused');
  assert.equal(setTuningValue('personas.lois.knobs.brake', 1).ok, false, 'a section is not a value');
  assert.equal(setTuningValue('personas.lois.knobs.brake.max', 2).ok, false, 'a probability over 1 is refused');
  assert.equal(setTuningValue('personas.lois.knobs.brake.max', 'high').ok, false, 'a non-number is refused');
  assert.equal(tuningValue('personas.lois.knobs.brake.max'), 0.4, 'the shipped value stands');
  assert.deepStrictEqual(tuningOverrides(), {});
});

// ── E · rig, never scene ─────────────────────────────────────────────────────
ok('E1 tuning.mjs imports only its JSON: no store, no project, no storage — an edit has nowhere to be saved', () => {
  const src = readFileSync(new URL('./tuning.mjs', import.meta.url), 'utf8');
  const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
  assert.deepStrictEqual(imports, ['./tuning.json']);
  assert.ok(!/localStorage|sessionStorage/.test(src), 'no web storage either: session memory only');
});

console.log(`personaTuning.selfcheck: ${passed} checks passed`);
