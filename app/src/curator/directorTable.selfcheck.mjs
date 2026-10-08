// directorTable.selfcheck.mjs — #1145: the 20 gain rows.
import assert from 'node:assert';
import { DIRECTOR_TABLE, rowFor, relaxSecondsFor } from './directorTable.js';
import { DIRECTORS_MATRIX } from './directorsMatrix.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

ok('exactly one row per room in the readout matrix (20 rooms, no inventions)', () => {
  const matrixKeys = [];
  for (const lois of Object.keys(DIRECTORS_MATRIX)) {
    for (const davis of Object.keys(DIRECTORS_MATRIX[lois])) matrixKeys.push(`${lois}×${davis}`);
  }
  assert.equal(matrixKeys.length, 20);
  assert.deepEqual(Object.keys(DIRECTOR_TABLE).sort(), matrixKeys.sort());
});

ok('rowFor resolves every room; unknown pairs give null', () => {
  assert.ok(rowFor('NOD', 'BLOOM'));
  assert.equal(rowFor('NOD', 'NOPE'), null);
  assert.equal(rowFor(null, null), null);
});

ok('bounds on every column (the table is tunable, not lawless)', () => {
  for (const [key, r] of Object.entries(DIRECTOR_TABLE)) {
    assert.ok(r.base_temp >= 0.1 && r.base_temp <= 0.55, `${key}: temp ${r.base_temp}`);
    assert.ok(r.kin_weight >= 0.25 && r.kin_weight <= 2, `${key}: kin ${r.kin_weight}`);
    assert.ok(r.lois_weight >= 0 && r.lois_weight <= 1, `${key}: lois ${r.lois_weight}`);
    assert.ok(r.sway_allowance >= 0 && r.sway_allowance <= 1, `${key}: sway ${r.sway_allowance}`);
    assert.ok(r.intensity_budget >= 0 && r.intensity_budget <= 1, `${key}: budget ${r.intensity_budget}`);
    assert.ok(r.tilt_limit >= 0 && r.tilt_limit <= 0.05, `${key}: tilt ${r.tilt_limit}`);
  }
});

ok('relax_seconds is DERIVED from intensity_budget: clamp(round(20 + b*25), 20, 45)', () => {
  assert.equal(relaxSecondsFor(0), 20);
  assert.equal(relaxSecondsFor(1), 45);
  assert.equal(relaxSecondsFor(0.5), 33); // round(32.5) = 33 banker's? no — Math.round(32.5)=33
  assert.equal(relaxSecondsFor(-1), 20);
  assert.equal(relaxSecondsFor(2), 45);
  for (const [key, r] of Object.entries(DIRECTOR_TABLE)) {
    assert.equal(r.relax_seconds, relaxSecondsFor(r.intensity_budget), `${key}: relax must follow the rule`);
    assert.ok(r.relax_seconds >= 20 && r.relax_seconds <= 45, `${key}: clamp`);
  }
});

ok('DAVIS ALONE: LOIS weight is 0 in every AWAY row (he is not in the room)', () => {
  for (const key of Object.keys(DIRECTOR_TABLE).filter((k) => k.startsWith('AWAY×'))) {
    assert.equal(DIRECTOR_TABLE[key].lois_weight, 0, key);
  }
});

ok('the money rows read as designed', () => {
  const burn = DIRECTOR_TABLE['BURN×FLOW']; // FULL BURN
  assert.equal(burn.base_temp, 0.55);
  assert.ok(burn.kin_weight >= 1.5, 'unleashed');
  assert.ok(burn.sway_allowance <= 0.2, 'the Queen backs off when it is already wild');
  assert.equal(burn.relax_seconds, 45, 'longest cool-down');
  const agree = DIRECTOR_TABLE['NOD×BLOOM']; // AGREEMENT
  assert.ok(agree.base_temp <= 0.15, 'cool');
  assert.ok(agree.kin_weight < 1, 'settles');
  assert.ok(agree.lois_weight > 0.8, 'tightens');
});

console.log(`directorTable.selfcheck: ${n} checks passed`);
