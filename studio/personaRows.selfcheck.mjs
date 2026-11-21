// personaRows.selfcheck.mjs — Persona Adapters A2 (#2395): labeled turns + takes → training rows.
//
// Fixture takes run through the REAL A0 extractor (extractLabels) so the labeled artifact is the
// production contract, then through buildRows. One block per law:
//   Q1 live-true features only — per kind, exactly the fields the live decision sees, nothing else
//      (no bpm/bar/recipe/census/principles, ever);
//   pressure re-derived from the take's stress section by tracker replay, at the decision's frame;
//   soloAge from the band's own fold; heat from the tuning table in force;
//   labels/weights ride through untouched (A0 is the label authority);
//   a take with no matching performance is dropped and counted, never guessed at;
//   the earn-in gate (A1) on shipped-shape entries: a sub-gate entry VALIDATES but never steers.
// Run: node studio/personaRows.selfcheck.mjs (also in app/selfcheck.manifest as ../studio/…)
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractLabels, verdictsFromRows } from './labelExtractor.mjs';
import { buildRows, pressureReader, PERSONA_ROWS_FORMAT } from './personaRows.mjs';
import { createStressTracker } from '../app/src/curator/stress.js';
import { validateTaste, steeringHeads } from '../app/src/curator/tasteHead.js';
import { DECISION_FEATURES_VERSION } from '../app/src/curator/decisionFeatures.mjs';
import { FEATURES_VERSION } from '../app/src/curator/recipeFeatures.js';

const here = dirname(fileURLToPath(import.meta.url));
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────
// The A0 selfcheck's conversations (bandRecord row shape; both pass checkBandRecord).
const TURNS_A = [
  [0, 0, 'in', 'governor', null],
  [0, 0, 'solo', 'davis', { len: 4, cap: 0.5 }],
  [100, 1, 'trade', 'davis', { answers: [['lois', 'agree', 'build'], ['carson', 'layOut', 'rest']], owner: 'davis' }],
  [200, 2, 'yield', 'artist', { why: 'keep', ended: 'davis' }],
  [300, 3, 'out', 'governor', null],
];
const TURNS_C = [
  [0, 0, 'in', 'governor', null],
  [0, 0, 'solo', 'greiman', { len: 5, cap: 0.3 }],
  [100, 1, 'cut', 'governor', { target: 'greiman' }],
  [200, 2, 'solo', 'ashworth', { len: 2, cap: 0.2 }],
  [300, 3, 'out', 'governor', null],
];
// Take A's stress: hot for 10 frames, then cold. Take C carries NO stress section (pressure absent).
const STRESS_A = {
  version: 1,
  initial: { smoothed: 0.2, band: 'relax' },
  runs: [
    [0, 0.9, 0.9, 0.9, 10],
    [10, 0, 0, 0, 300],
  ],
  bands: [],
  occupancy: { relax: 0, normal: 0, tighten: 0 },
};
// The SAME signals with the runs annotated at frames 50/200: under the stress record's law the
// annotations are not the timeline (order is what replays), so this record must read back
// identically to STRESS_A — a fixture where the run-frame reading and the ordinal reading differ.
const STRESS_GAPPED = {
  version: 1,
  initial: { smoothed: 0.2, band: 'relax' },
  runs: [
    [50, 0.9, 0.9, 0.9, 10],
    [200, 0, 0, 0, 300],
  ],
  bands: [],
  occupancy: { relax: 0, normal: 0, tighten: 0 },
};
const takeA = { format: 'kc-performance', version: 3, frames: 400, band: { version: 1, seed: 101, turns: TURNS_A }, stress: STRESS_A };
const takeC = { format: 'kc-performance', version: 3, frames: 400, band: { version: 1, seed: 103, turns: TURNS_C } };

const TUNING = {
  personas: {
    davis: { heat: 0.9 },
    lois: { heat: 0.4 },
    carson: { heat: 0.5 },
    greiman: { heat: 0.3 },
    ashworth: { heat: 0.2 },
    governor: { heat: 0.1 },
  },
};

// The labeled artifact, produced by A0 itself: 101 kept once (weak-good blanket; the in-take keep
// still targets the solo), 103 passed (every decision bad).
const verdicts = verdictsFromRows([{ seed: 101, timestamp: '2026-11-01T10:00:00.000Z' }], [{ seed: 103, timestamp: '2026-11-01T10:00:00.000Z' }]);
const labeled = extractLabels(
  [
    { name: 'a.kcperf', perf: takeA },
    { name: 'c.kcperf', perf: takeC },
  ],
  verdicts,
);

// The expected pressure at a frame, stated independently, under the stress record's documented
// law: a run's frame is an annotation — order is what replays — so the k-th update of the take
// (counting every run's updates in order) sits at frame k, exactly as expandStressRecord reads
// the record back. Read the clamped smoothed after the last update at or before the frame (the
// initial smoothed before any update).
function expectedPressure(frame, rec = STRESS_A) {
  const t = createStressTracker({ initial: rec.initial });
  let p = clamp01(rec.initial.smoothed);
  let ord = 0;
  for (const [, activity, dish, taste, n] of rec.runs) {
    for (let j = 0; j < n; j++) {
      t.update({ activity, dish, taste });
      if (ord <= frame) p = clamp01(t.smoothed);
      ord += 1;
    }
  }
  return p;
}

// The superseded reading — update j of a run at frame (run frame + j) — kept here only so the
// gapped fixture can prove the two laws give different pressures and the ordinal one is in force.
function runFrameLawPressure(frame, rec) {
  const t = createStressTracker({ initial: rec.initial });
  let p = clamp01(rec.initial.smoothed);
  for (const [f0, activity, dish, taste, n] of rec.runs) {
    for (let j = 0; j < n; j++) {
      t.update({ activity, dish, taste });
      if (f0 + j <= frame) p = clamp01(t.smoothed);
    }
  }
  return p;
}

// ── the rows: shape, counts, and A0's labels untouched ──────────────────────────────────────────────
{
  const art = buildRows(labeled, [
    { name: 'a.kcperf', perf: takeA },
    { name: 'c.kcperf', perf: takeC },
  ], TUNING);
  assert.equal(art.format, PERSONA_ROWS_FORMAT);
  assert.equal(art.featuresVersion, DECISION_FEATURES_VERSION);
  assert.equal(art.summary.takes, 2);
  assert.equal(art.summary.droppedTakes, 0);
  assert.equal(art.summary.droppedUnits, 0);
  assert.equal(art.rows.length, 6, 'A: solo + 2 trade answers; C: solo + cut + solo');
  const solo = art.rows.find((r) => r.kind === 'solo' && r.id === 'davis');
  assert.equal(solo.label, 'good', "A0's targeted in-take keep rides through");
  assert.equal(solo.weight, 1);
  assert.equal(solo.takeSeed, 101);
  const lois = art.rows.find((r) => r.kind === 'trade' && r.id === 'lois');
  assert.equal(lois.label, 'weak-good');
  assert.equal(lois.weight, 0.25);
  const cut = art.rows.find((r) => r.kind === 'cut');
  assert.equal(cut.id, 'governor');
  assert.equal(cut.label, 'bad', "A0's take-level pass rides through");
  assert.equal(cut.weight, -1);
  assert.deepEqual(art.summary.labeledByEntry, {
    'davis|solo': 1,
    'lois|trade': 1,
    'carson|trade': 1,
    'greiman|solo': 1,
    'governor|cut': 1,
    'ashworth|solo': 1,
  });
}

// ── Q1: per kind, exactly the live-true fields — and nothing else, ever ─────────────────────────────
{
  const art = buildRows(labeled, [
    { name: 'a.kcperf', perf: takeA },
    { name: 'c.kcperf', perf: takeC },
  ], TUNING);
  const cats = new Set();
  const nums = new Set();
  for (const r of art.rows) {
    for (const k of Object.keys(r.features)) if (k !== 'num') cats.add(k);
    for (const k of Object.keys(r.features.num)) nums.add(k);
  }
  assert.deepEqual([...cats].sort(), ['caller', 'move', 'target', 'verdict'], 'no phase, no recipe.* categoricals');
  assert.deepEqual([...nums].sort(), ['heat', 'pressure', 'soloAge'], 'no bpm/bar/density/coverage/keep-rate/recipe numerics');

  const solo = art.rows.find((r) => r.kind === 'solo' && r.id === 'davis');
  assert.deepEqual(Object.keys(solo.features).sort(), ['num'], 'a solo pick has no categorical facts');
  assert.deepEqual(Object.keys(solo.features.num).sort(), ['heat', 'pressure']);
  assert.equal(solo.features.num.heat, 0.9, "the candidate's heat from the table in force");

  const lois = art.rows.find((r) => r.kind === 'trade' && r.id === 'lois');
  assert.equal(lois.features.caller, 'davis', 'the call being answered');
  assert.equal(lois.features.verdict, 'agree');
  assert.equal(lois.features.move, 'build');
  assert.equal(lois.features.num.heat, 0.4, "the ANSWERER's heat, not the caller's");
  assert.equal(lois.features.num.soloAge, 1, 'the solo stood one phrase when the trade answered it');

  const cut = art.rows.find((r) => r.kind === 'cut');
  assert.equal(cut.features.target, 'greiman');
  assert.equal(cut.features.num.soloAge, 1);
  assert.ok(!('heat' in cut.features.num), 'heat is stripped from a cut live — it is not a fact of that decision');
  assert.ok(!('pressure' in cut.features.num), 'take C has no stress section: pressure is absent, not invented');
}

// ── pressure: replayed from the stress section, read at the decision's own frame ────────────────────
{
  const at = pressureReader(takeA);
  assert.equal(at(0), expectedPressure(0));
  assert.equal(at(100), expectedPressure(100));
  assert.ok(at(0) > at(100), 'the room cooled between the solo and the trade — the series moves');
  assert.equal(pressureReader(takeC), null, 'no stress section, no reader');
  assert.equal(pressureReader({ stress: { version: 99, runs: [] } }), null, 'a foreign stress record is not replayed');
  const art = buildRows(labeled, [{ name: 'a.kcperf', perf: takeA }], TUNING);
  const solo = art.rows.find((r) => r.kind === 'solo');
  assert.equal(solo.features.num.pressure, expectedPressure(0), "the solo's row carries frame 0's pressure");
  const trade = art.rows.find((r) => r.kind === 'trade' && r.id === 'lois');
  assert.equal(trade.features.num.pressure, expectedPressure(100), "the trade's row carries frame 100's pressure");
}

// ── pressure, gapped record: the run frames are annotations — the ordinal law is the one in force ──
{
  const gappedTake = { ...takeA, stress: STRESS_GAPPED };
  const at = pressureReader(gappedTake);
  // The two laws genuinely disagree on this record (at frame 100 the ordinal series has cooled
  // through 91 cold updates; the run-frame reading has not reached the cold run yet).
  assert.notEqual(expectedPressure(100, STRESS_GAPPED), runFrameLawPressure(100, STRESS_GAPPED), 'the fixture separates the two laws');
  assert.equal(at(0), expectedPressure(0, STRESS_GAPPED));
  assert.equal(at(5), expectedPressure(5, STRESS_GAPPED), 'frame 5 is six updates in, though the first run is annotated at 50');
  assert.equal(at(100), expectedPressure(100, STRESS_GAPPED));
  assert.notEqual(at(100), runFrameLawPressure(100, STRESS_GAPPED), 'the reader follows the ordinal law, not the annotations');
  // Same signals, different annotations: the readback is STRESS_A's, value for value.
  const atA = pressureReader(takeA);
  for (const f of [0, 5, 9, 10, 100, 309]) assert.equal(at(f), atA(f), `annotation-free readback at frame ${f}`);
  // And through buildRows: the trade at frame 100 carries the ordinal pressure.
  const art = buildRows(labeled, [{ name: 'a.kcperf', perf: gappedTake }], TUNING);
  const trade = art.rows.find((r) => r.kind === 'trade' && r.id === 'lois');
  assert.equal(trade.features.num.pressure, expectedPressure(100, STRESS_GAPPED), "the trade's row carries the ordinal frame-100 pressure");
}

// ── honesty: unmatched takes and unruled heat ───────────────────────────────────────────────────────
{
  const orphan = extractLabels([{ name: 'x.kcperf', perf: takeA }], verdictsFromRows([], []));
  orphan.takes[0].seed = 999; // a labeled take whose performance we do not hold
  const art = buildRows(orphan, [{ name: 'a.kcperf', perf: takeA }], TUNING);
  assert.equal(art.summary.droppedTakes, 1);
  assert.equal(art.rows.length, 0, 'no performance, no rows — never guessed at');

  const noHeat = buildRows(labeled, [{ name: 'a.kcperf', perf: takeA }], { personas: {} });
  const solo = noHeat.rows.find((r) => r.kind === 'solo');
  assert.ok(!('heat' in solo.features.num), 'an unruled (absent) heat stays absent from the vector');
  assert.throws(() => buildRows({ format: 'nope', version: 1, takes: [] }, [], TUNING), /kc-labeled-turns/);
}

// ── the earn-in gate on shipped-shape entries: validates, but a sub-gate head never steers ──────────
{
  const leafHead = (v) => ({
    kind: 'xgboost-trees',
    objective: 'binary:logistic',
    baseScore: 0,
    fidelity: 0.5,
    fitOn: 240,
    features: ['num.heat'],
    trees: [{ leaf: v }],
  });
  const entry = (kind, head, over = {}) => ({
    version: 1,
    kind,
    head,
    labeledTurns: 240,
    heldOut: 0.6,
    trainedAt: '2026-11-20T00:00:00Z',
    featuresVersion: DECISION_FEATURES_VERSION,
    ...over,
  });
  const tasteFile = (personas) => ({
    kind: 'kc-taste',
    version: 1,
    featuresVersion: FEATURES_VERSION,
    model: 'm',
    dims: 0,
    labels: { likes: 1, passes: 1 },
    trainedAt: '',
    head: { terms: {}, num: {}, bias: 0, fidelity: 0.5, fitOn: 10 },
    personas,
  });
  const r = validateTaste(
    tasteFile({
      davis: { solo: entry('solo', leafHead(1)) },
      carson: { solo: entry('solo', leafHead(1), { labeledTurns: 199 }) },
      lois: { trade: entry('trade', leafHead(1), { labeledTurns: 500, heldOut: 0.29 }) },
    }),
  );
  assert.equal(r.ok, true);
  assert.ok(r.taste.personas, 'all three entries validate — shipping is not the gate');
  const bundle = steeringHeads(r.taste);
  assert.deepEqual(Object.keys(bundle), ['davis'], 'earn-in is A1’s gate: ≥200 turns AND ≥0.3 held-out, or the head never reaches the band');
  assert.deepEqual(Object.keys(bundle.davis), ['solo']);
}

// ── CLI smoke: files in, rows file out ──────────────────────────────────────────────────────────────
{
  const dir = mkdtempSync(join(tmpdir(), 'kc-persona-rows-'));
  try {
    const aPath = join(dir, 'a.json');
    const cPath = join(dir, 'c.json');
    writeFileSync(aPath, JSON.stringify(takeA));
    writeFileSync(cPath, JSON.stringify(takeC));
    const labeledPath = join(dir, 'labeled.json');
    const labeledFromDisk = extractLabels(
      [
        { name: aPath, perf: takeA },
        { name: cPath, perf: takeC },
      ],
      verdicts,
    );
    writeFileSync(labeledPath, JSON.stringify(labeledFromDisk));
    const tuningPath = join(dir, 'tuning.json');
    writeFileSync(tuningPath, JSON.stringify(TUNING));
    const outPath = join(dir, 'rows.json');
    execFileSync('node', [join(here, 'personaRows.mjs'), '--labeled', labeledPath, '--takes', dir, '--tuning', tuningPath, '--out', outPath], {
      stdio: 'pipe',
    });
    const art = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.equal(art.format, PERSONA_ROWS_FORMAT);
    assert.equal(art.rows.length, 6);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('personaRows.selfcheck: all blocks passed');
