// node src/engine/cultureWorld.selfcheck.mjs
// CULTURE Phase 0 — the gate and the empty dish (foundation spec §2/§3.5/§5; parent umbrella 1183).
//   1. the empty world: the shared Life stage grid, an empty body table at the 2,048 ceiling, the stamp
//   2. simLaw honesty: the world steps on CPU in JS and says so, in the codebase's stamp vocabulary
//   3. scheduler law: whole fixed 120 Hz steps only, remainder carried, no drift over long runs, the
//      per-call bound drops loudly (counted), never silently
//   4. fixed-step determinism: the same irregular feed sequence produces the identical world hash
//   5. gate-off parity: the document serializes byte-identically with the gate off or absent, the
//      store defaults off, and no world stands anywhere until the shell registers one
import assert from 'node:assert/strict';
import {
  CULTURE_WORLD_BACKEND,
  CULTURE_WORLD_SIM_LAW,
  CULTURE_STEP_HZ,
  CULTURE_STEP_S,
  CULTURE_BODY_CAP,
  CULTURE_MAX_STEPS_PER_ADVANCE,
  cultureDishOn,
  createCultureWorld,
  cultureWorldSimTimeS,
  advanceCultureWorld,
  cultureWorldHash,
  standingCultureWorld,
} from './cultureWorld.mjs';
import { STAGE_COLS, STAGE_ROWS } from './dishLifeStage.mjs';
import { simLawFor, DEFAULT_SIM_BACKENDS } from './kernel/simBackends.js';
import { mkRng } from './prng.js';
import { useStore } from '../state/store.js';
import { serializeProject, parseProject, DOC_FIELD_CLASS } from '../state/projectDocument.js';
import { PROJECT_STATE_KEYS } from '../state/projectWatch.mjs';

let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};
const S = () => useStore.getState();

// 1 — the empty world.
{
  const w = createCultureWorld({ seed: 7 });
  assert.equal(w.seed, 7);
  assert.equal(w.grid.cols, STAGE_COLS, 'the grid is the shared Life stage grid (the soil, spec §5.2)');
  assert.equal(w.grid.rows, STAGE_ROWS);
  assert.equal(w.grid.cells.length, STAGE_COLS * STAGE_ROWS);
  assert.ok(
    w.grid.cells.every((c) => c === 0),
    'the soil starts all dead: Phase 0 grows nothing',
  );
  assert.equal(w.bodies.capacity, CULTURE_BODY_CAP);
  assert.equal(CULTURE_BODY_CAP, 2048, 'capacity is the contacts ceiling already on main (K3 ladder step 2)');
  assert.equal(w.bodies.count, 0, 'the table is empty: capacity is a ceiling, not a population');
  assert.equal(w.bodies.alive.length, CULTURE_BODY_CAP);
  assert.equal(w.bodies.x.length, CULTURE_BODY_CAP);
  assert.equal(w.bodies.y.length, CULTURE_BODY_CAP);
  assert.equal(w.step, 0);
  assert.equal(w.accS, 0);
  assert.equal(w.droppedSteps, 0);
  assert.equal(cultureWorldSimTimeS(w), 0);
  ok('the empty world: shared grid, empty body table at the 2,048 ceiling, clock at zero');
}

// 2 — simLaw honesty.
{
  const w = createCultureWorld({ seed: 1 });
  assert.equal(CULTURE_WORLD_SIM_LAW, 'js-exact');
  assert.equal(w.simLaw, 'js-exact', 'the world stamps itself js-exact: CPU steps, bit-exact replay');
  assert.equal(w.backend, CULTURE_WORLD_BACKEND);
  assert.match(CULTURE_WORLD_BACKEND, /^js\.[a-zA-Z]+\.v\d+$/, 'a versioned JS backend id, simBackends vocabulary');
  assert.ok(!CULTURE_WORLD_BACKEND.includes('gpu'), 'no GPU anything is claimed');
  assert.equal(simLawFor(DEFAULT_SIM_BACKENDS), CULTURE_WORLD_SIM_LAW, 'the same law the all-JS take stamp carries');
  ok('simLaw honesty: js-exact, a js.* backend id, no GPU claim');
}

// 3 — scheduler law.
{
  assert.equal(CULTURE_STEP_HZ, 120);
  assert.equal(CULTURE_STEP_S, 1 / 120);

  const w = createCultureWorld({ seed: 3 });
  assert.equal(advanceCultureWorld(w, 0), 0, 'a zero feed runs nothing');
  assert.equal(advanceCultureWorld(w, -1), 0, 'a negative feed runs nothing');
  assert.equal(advanceCultureWorld(w, NaN), 0, 'a NaN feed runs nothing');
  assert.equal(advanceCultureWorld(w, Infinity), 0, 'an infinite feed runs nothing');
  assert.equal(w.step, 0);

  assert.equal(advanceCultureWorld(w, CULTURE_STEP_S / 2), 0, 'half a step is carried, not run');
  assert.equal(w.step, 0);
  assert.equal(advanceCultureWorld(w, CULTURE_STEP_S / 2), 1, 'the second half completes the step');
  assert.equal(w.step, 1);
  assert.equal(w.accS, 0, 'the remainder after an exact step is exactly zero');

  const w2 = createCultureWorld({ seed: 3 });
  let ran = 0;
  for (let i = 0; i < 60; i++) ran += advanceCultureWorld(w2, 1 / 60);
  assert.equal(ran, 120, 'sixty 60 Hz frames run exactly 120 fixed steps');
  assert.equal(w2.step, 120);
  assert.equal(w2.accS, 0, 'no remainder, no drift at the matched rate');
  assert.ok(Math.abs(cultureWorldSimTimeS(w2) - 1) < 1e-12, 'sim time is the steps, not the wall clock');

  const w3 = createCultureWorld({ seed: 3 });
  advanceCultureWorld(w3, 0.999);
  assert.equal(w3.step, 119, 'a 0.999 s feed runs its 119 whole steps and no more');
  assert.ok(w3.accS >= 0 && w3.accS < CULTURE_STEP_S, 'the remainder is always a fraction of one step');
  assert.ok(Math.abs(w3.step * CULTURE_STEP_S + w3.accS - 0.999) < 1e-9, 'steps + remainder account for the feed');

  const w4 = createCultureWorld({ seed: 3 });
  for (let i = 0; i < 216000; i++) advanceCultureWorld(w4, 1 / 60);
  assert.equal(w4.step, 432000, 'an hour of 60 Hz frames is exactly 432,000 steps');
  assert.equal(w4.accS, 0, 'no drift over a long run');

  const w5 = createCultureWorld({ seed: 3 });
  const ranCap = advanceCultureWorld(w5, 10);
  assert.equal(ranCap, CULTURE_MAX_STEPS_PER_ADVANCE, 'one feed call runs at most the bound');
  assert.equal(w5.step, CULTURE_MAX_STEPS_PER_ADVANCE);
  assert.equal(
    w5.droppedSteps,
    1200 - CULTURE_MAX_STEPS_PER_ADVANCE,
    'the excess whole steps are counted, not swallowed',
  );
  assert.ok(w5.accS >= 0 && w5.accS < CULTURE_STEP_S, 'even after a drop the remainder is a fraction of one step');
  ok('scheduler law: whole steps only, remainder carried, no drift, the bound drops loudly');
}

// 4 — fixed-step determinism under an irregular feed.
{
  const rng = mkRng(0xc017);
  const feeds = [];
  for (let i = 0; i < 600; i++) feeds.push(0.001 + rng() * 0.049); // 1–50 ms chunks, no divisor of the step
  const a = createCultureWorld({ seed: 42 });
  const b = createCultureWorld({ seed: 42 });
  for (const dt of feeds) {
    advanceCultureWorld(a, dt);
    advanceCultureWorld(b, dt);
  }
  assert.equal(a.step, b.step);
  assert.ok(Object.is(a.accS, b.accS), 'the carried remainder is bit-identical');
  assert.equal(cultureWorldHash(a), cultureWorldHash(b), 'the same feed sequence produces the identical world');

  const c = createCultureWorld({ seed: 42 });
  for (const dt of feeds) advanceCultureWorld(c, dt);
  advanceCultureWorld(c, CULTURE_STEP_S);
  assert.notEqual(cultureWorldHash(c), cultureWorldHash(a), 'one more step is a different world');

  const d = createCultureWorld({ seed: 43 });
  for (const dt of feeds) advanceCultureWorld(d, dt);
  assert.notEqual(cultureWorldHash(d), cultureWorldHash(a), 'a different seed is a different world');
  ok('determinism: an irregular feed sequence hashes identically across runs');
}

// 5 — gate-off parity.
{
  assert.equal(cultureDishOn(null), false);
  assert.equal(cultureDishOn({}), false, 'absent = off');
  assert.equal(cultureDishOn({ cultureDish: false }), false);
  assert.equal(cultureDishOn({ cultureDish: 1 }), false, 'only exactly true is on');
  assert.equal(cultureDishOn({ cultureDish: 'true' }), false);
  assert.equal(cultureDishOn({ cultureDish: true }), true);

  assert.equal(S().cultureDish, false, 'the store defaults off');
  S().setCultureDish(true);
  assert.equal(S().cultureDish, true);
  S().setCultureDish(false);
  assert.equal(S().cultureDish, false);

  const st = { ...S() };
  const absent = { ...st };
  delete absent.cultureDish;
  const offDoc = serializeProject({ ...st, cultureDish: false });
  const absentDoc = serializeProject(absent);
  assert.ok(!('cultureDish' in offDoc), 'off serializes as before: no field');
  assert.ok(!('cultureDish' in absentDoc), 'absent serializes as before: no field');
  assert.equal(JSON.stringify(offDoc), JSON.stringify(absentDoc), 'off and absent are byte-identical');
  const onDoc = serializeProject({ ...st, cultureDish: true });
  assert.equal(onDoc.cultureDish, true, 'on writes the field');
  assert.deepEqual(
    Object.keys(onDoc).sort(),
    [...Object.keys(offDoc), 'cultureDish'].sort(),
    'on adds exactly the one field, nothing else moves',
  );
  assert.equal(parseProject(JSON.parse(JSON.stringify(onDoc))).doc.cultureDish, true, 'on round-trips');
  assert.equal(parseProject(JSON.parse(JSON.stringify(offDoc))).doc.cultureDish, false, 'off round-trips as off');

  assert.equal(DOC_FIELD_CLASS.cultureDish, 'scene', 'the field is classed (projectDocument.fields law)');
  assert.ok(PROJECT_STATE_KEYS.includes('cultureDish'), 'the autosave watches the gate (projectWatch law)');
  assert.equal(standingCultureWorld(), null, 'no world stands anywhere until the shell registers one');
  ok('gate-off parity: byte-identical documents, store default off, no standing world');
}

console.log(`cultureWorld.selfcheck: OK (${checks} groups) — CULTURE Phase 0, the gate and the empty dish`);
