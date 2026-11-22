// queenRows.selfcheck — Persona Adapters A6 (#2399): labeled takes → her timing rows.
//
//   node studio/queenRows.selfcheck.mjs
//
// The laws under test: one row per leaned turn of a labeled take, carrying the app's own
// queenTimingFeatures (kind + the sway sizes she used) and the TAKE's verdict — the ledger
// blanket first (kept → weak-good with stacking; passed → bad), the intake verdict as the
// fallback for a take in neither ledger, nothing for an unlabeled take. Takes she never leaned
// in (no rhythm record) are counted, never encoded.
import assert from 'node:assert/strict';
import { buildQueenRows, takeVerdict, QUEEN_ROWS_FORMAT } from './queenRows.mjs';
import { LABELED_TURNS_FORMAT, LABELED_TURNS_VERSION } from './labelExtractor.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const TURNS = [
  [0, 0, 'in', 'governor', null],
  [0, 0, 'solo', 'davis', { len: 4, cap: 0.5 }],
  [100, 1, 'trade', 'davis', { answers: [['lois', 'agree', 'build']], owner: 'davis' }],
  [200, 2, 'out', 'governor', null],
];
const RHYTHM = {
  version: 1,
  timing: [
    [0, 0, 12, 0.04, 0],
    [100, 1, 0, 0, 9],
  ],
  looks: [],
};
const take = (seed, rhythm) => ({
  name: `take-${seed}.json`,
  perf: {
    format: 'kc-performance',
    version: 3,
    frames: 400,
    band: { version: 1, seed, turns: TURNS, ...(rhythm ? { rhythm } : {}) },
  },
});
const unit = (source, label, weight) => ({ turn: 1, frame: 0, phrase: 0, kind: 'solo', by: 'davis', label, weight, source });
const labeled = (takes) => ({ format: LABELED_TURNS_FORMAT, version: LABELED_TURNS_VERSION, takes });

ok('the take verdict: blanket first, intake fallback, unlabeled is nothing', () => {
  assert.deepEqual(takeVerdict({ units: [unit('ledger-keep', 'weak-good', 0.5)] }), { label: 'weak-good', weight: 0.5 });
  assert.deepEqual(takeVerdict({ units: [unit('ledger-pass', 'bad', -1)] }), { label: 'bad', weight: -1 });
  assert.deepEqual(
    takeVerdict({ units: [unit('intake-keep', 'good', 1), unit('intake-lock', 'strong-bad', -2)] }),
    { label: 'strong-bad', weight: -2 },
    'no ledger entry: the LAST intake verdict is the take’s story',
  );
  assert.equal(takeVerdict({ units: [unit('none', 'unlabeled', 0)] }), null);
  assert.equal(takeVerdict({ units: [] }), null);
});

ok('rows: one per leaned turn, the take’s label on each, features from the app’s builder', () => {
  const art = buildQueenRows(
    labeled([
      { seed: 101, name: 'take-101.json', units: [unit('ledger-keep', 'weak-good', 0.5)] },
      { seed: 103, name: 'take-103.json', units: [unit('ledger-pass', 'bad', -1)] },
      { seed: 105, name: 'take-105.json', units: [unit('intake-lock', 'strong-bad', -2)] },
    ]),
    [take(101, RHYTHM), take(103, RHYTHM), take(105, RHYTHM)],
  );
  assert.equal(art.format, QUEEN_ROWS_FORMAT);
  assert.equal(art.rows.length, 6, 'two leaned turns × three labeled takes');
  const [r0, r1] = art.rows;
  assert.deepEqual(r0, {
    takeSeed: 101,
    features: { kind: 'solo', num: { enterEarlyMs: 12, breathePct: 0.04, tightMs: 0 } },
    label: 1,
    weight: 0.5,
  });
  assert.deepEqual(r1.features, { kind: 'trade', num: { enterEarlyMs: 0, breathePct: 0, tightMs: 9 } });
  assert.equal(art.rows[2].label, 0, 'a passed take blames the sways it used');
  assert.equal(art.rows[2].weight, -1);
  assert.equal(art.rows[4].weight, -2, 'the intake fallback carries its weight');
  assert.deepEqual(art.summary, { labeledTakes: 3, droppedTakes: 0, unleanedTakes: 0, rows: 6 });
});

ok('counted, never guessed: unleaned and unlabeled takes contribute nothing', () => {
  const art = buildQueenRows(
    labeled([
      { seed: 101, name: 'take-101.json', units: [unit('ledger-keep', 'weak-good', 0.5)] },
      { seed: 103, name: 'take-103.json', units: [unit('none', 'unlabeled', 0)] },
      { seed: 107, name: 'take-107.json', units: [unit('ledger-keep', 'weak-good', 0.25)] },
    ]),
    [take(101, null), take(103, RHYTHM)],
  );
  assert.equal(art.rows.length, 0);
  assert.equal(art.summary.unleanedTakes, 1, 'labeled but she never leaned (no rhythm record)');
  assert.equal(art.summary.droppedTakes, 2, 'unlabeled + missing performance');
  assert.throws(() => buildQueenRows({ format: 'nope', version: 1, takes: [] }, []), /not a/);
});

console.log(`queenRows.selfcheck: ${n} blocks passed`);
