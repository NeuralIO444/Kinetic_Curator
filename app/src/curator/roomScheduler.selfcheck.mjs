// roomScheduler.selfcheck.mjs — every room resolves, silence is neutral (#1145).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { LOIS_FACES } from './loisFace.js';
import { DAVIS_STATES } from './davisState.js';
import { roomFor } from './directorsMatrix.js';
import { wildnessForDavis } from './dice.js';
import {
  scheduleRoom, noteRoom, getRoomSchedule, resetRoomSchedule, applyPhaseClamp,
  TEMP_BASELINE, TEMP_AGREEMENT, TEMP_CLASH, TEMP_FULL_BURN, TEMP_MIN, TEMP_MAX,
} from './roomScheduler.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

ok('all 20 rooms resolve inside bounds, and the verdict is the matrix\'s', () => {
  let count = 0;
  for (const lois of Object.keys(LOIS_FACES)) {
    for (const davis of Object.keys(DAVIS_STATES)) {
      const row = scheduleRoom(lois, davis);
      const talk = roomFor(lois, davis);
      assert.equal(row.room, true, `${lois} x ${davis}`);
      assert.equal(row.verdict, talk.verdict);
      assert.ok(row.temperature >= TEMP_MIN && row.temperature <= TEMP_MAX);
      assert.ok(row.kinFreedom >= 0 && row.kinFreedom <= 1);
      assert.equal(row.queenBias, 0, 'Queen column stays neutral until #1139/#1140');
      assert.ok([-1, 0, 1].includes(row.weightShift));
      count++;
    }
  }
  assert.equal(count, 20);
});

ok('the separable law: LOIS sets temp, Davis sets KIN, three overrides', () => {
  assert.equal(scheduleRoom('NOD', 'BLOOM').verdict, 'AGREEMENT');
  assert.equal(scheduleRoom('NOD', 'BLOOM').temperature, TEMP_AGREEMENT);
  assert.equal(scheduleRoom('NOD', 'BLOOM').weightShift, -1);
  assert.ok(scheduleRoom('NOD', 'BLOOM').kinFreedom <= wildnessForDavis('FLOW'));

  assert.equal(scheduleRoom('BURN', 'FLOW').verdict, 'FULL BURN');
  assert.equal(scheduleRoom('BURN', 'FLOW').temperature, TEMP_FULL_BURN);
  assert.equal(scheduleRoom('BURN', 'FLOW').kinFreedom, 1);
  assert.equal(scheduleRoom('BURN', 'FLOW').weightShift, 1);

  for (const davis of ['FLOW', 'SEEDLING', 'UGLY', 'STUCK']) {
    const row = scheduleRoom('NOD', davis);
    assert.equal(row.verdict, 'THE CLASH');
    assert.equal(row.temperature, TEMP_CLASH);
  }

  for (const davis of Object.keys(DAVIS_STATES)) {
    const vibe = scheduleRoom('VIBE', davis);
    assert.equal(vibe.verdict, 'THE ROOM');
    assert.equal(vibe.temperature, TEMP_BASELINE);
    assert.equal(vibe.weightShift, 0);
    assert.equal(vibe.kinFreedom, wildnessForDavis(davis));
    assert.equal(scheduleRoom('AWAY', davis).verdict, 'DAVIS ALONE');
    assert.equal(scheduleRoom('AWAY', davis).frozenWeights, true);
    assert.equal(scheduleRoom('AWAY', davis).weightShift, 0);
    assert.equal(scheduleRoom('AWAY', davis).temperature, TEMP_BASELINE);
  }
  // FULL BURN is one cell. BURN x STUCK is a working room, not a peak.
  assert.equal(scheduleRoom('BURN', 'STUCK').verdict, 'THE ROOM');
  assert.notEqual(scheduleRoom('BURN', 'STUCK').temperature, TEMP_FULL_BURN);
});

ok('STUCK with nobody pointing suggests a re-roll; NOD x STUCK does not', () => {
  assert.equal(scheduleRoom('VIBE', 'STUCK').suggestReroll, true);
  assert.equal(scheduleRoom('BURN', 'STUCK').suggestReroll, true);
  assert.equal(scheduleRoom('AWAY', 'STUCK').suggestReroll, true);
  assert.equal(scheduleRoom('NOD', 'STUCK').suggestReroll, false);
  assert.equal(scheduleRoom('VIBE', 'FLOW').suggestReroll, false);
});

ok('silence is neutral: no state, junk, and a reset all sit on the baseline', () => {
  for (const row of [scheduleRoom(null, 'FLOW'), scheduleRoom('NOD', null), scheduleRoom(), scheduleRoom('LEAN', 'FLOW')]) {
    assert.equal(row.room, false);
    assert.equal(row.temperature, TEMP_BASELINE);
    assert.equal(row.queenBias, 0);
    assert.equal(row.suggestReroll, false);
    assert.equal(row.weightShift, 0);
  }
  noteRoom('BURN', 'FLOW');
  assert.equal(getRoomSchedule().temperature, TEMP_FULL_BURN);
  resetRoomSchedule();
  assert.equal(getRoomSchedule().room, false);
  assert.equal(getRoomSchedule().temperature, TEMP_BASELINE);
});

ok('#1144 precedence: REFINE caps the room, EXPLORE does not, no phase tracker is invented', () => {
  const burn = scheduleRoom('BURN', 'FLOW');
  assert.equal(applyPhaseClamp(burn, 'REFINE').temperature, TEMP_AGREEMENT);
  assert.equal(applyPhaseClamp(burn, 'EXPLORE').temperature, TEMP_FULL_BURN);
  assert.equal(applyPhaseClamp(burn, undefined).temperature, TEMP_FULL_BURN);
});

ok('the strip stays a readout: the duel does not import the scheduler', () => {
  const duel = readFileSync(new URL('../panels/directors/DirectorsDuel.jsx', import.meta.url), 'utf8');
  assert.equal(duel.includes('roomScheduler'), false);
  assert.match(duel, /READOUT ONLY/);
});

console.log(`roomScheduler.selfcheck: ${n} checks passed`);
