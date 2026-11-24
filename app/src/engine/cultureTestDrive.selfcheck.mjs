// node src/engine/cultureTestDrive.selfcheck.mjs
// CULTURE Phase 5, slice C — the test drives, engine side (the parent issues 2342 and 2343).
//   1. T1: every Lab plan plays each of its style's Canon default gaits on the beat; still holds, idle and performing
//      move, performing more than idle; switching gaits changes the motion; it moves with the beat count
//   2. T1: reduced motion holds still (identity poses, the strandbeest's crank at birth); the bench refuses loudly;
//      nothing is written (the candidate is untouched, no world exists)
//   3. T1: the strandbeest drives through the beast adapter and walks in place on the bench (its crank turns, its discs
//      stay put)
//   4. T2: the mood map is bounded and deterministic; neutral drives give exactly 1 and leave the gait itself
//   5. T2: each mood preview pushes its own drive high and changes how the gait plays
import assert from 'node:assert/strict';
import {
  cultureTestDrive,
  cultureMoodMultipliers,
  cultureMoodPresets,
  moodGait,
  CULTURE_MOOD_DRIVES,
  CULTURE_MOOD_DRIVERS,
  CULTURE_MOOD_MIN,
  CULTURE_MOOD_MAX,
  CULTURE_MOOD_MAP,
} from './cultureTestDrive.mjs';
import { curatorAudition, loisGate } from './cultureLab.mjs';
import { CULTURE_BODY_PLANS, CULTURE_PLAN_STRANDBEEST } from './cultureBody.mjs';
import { CULTURE_GAIT_STYLES, cultureTreeOf } from './cultureGait.mjs';
import { canonGaits, CANON_GAIT_KINDS } from '../data/canon/gaits.js';
import { standingCultureWorld } from './cultureWorld.mjs';
import { STAGE_COLS, STAGE_ROWS } from './dishLifeStage.mjs';
import { POSE_IDENTITY } from './motionCore/index.js';

let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};
const LIVE = { cols: STAGE_COLS, rows: STAGE_ROWS, gen: 0, level: new Float32Array(STAGE_COLS * STAGE_ROWS).fill(1) };
const candidate = (plan) => {
  for (let a = 0; a < 16; a++) {
    const c = curatorAudition(plan, 7, 0, a);
    if (loisGate(c, LIVE).admitted) return c;
  }
  throw new Error(`no admitted ${plan}`);
};
const motion = (r) =>
  r.nodes.reduce((s, n) => s + Math.abs(n.pose.dx) + Math.abs(n.pose.dy) + Math.abs(n.pose.sx - 1), 0);

// 1 — Canon gaits on the beat.
{
  for (const plan of CULTURE_BODY_PLANS) {
    const m = candidate(plan);
    const style = CULTURE_GAIT_STYLES[plan];
    assert.ok(canonGaits(style), `${plan} has a Canon style`);
    const amounts = {};
    for (const kind of CANON_GAIT_KINDS) {
      const r = cultureTestDrive(m, { kind, beats: 5.25 });
      assert.equal(r.style, style);
      assert.equal(r.gaitId, canonGaits(style)[kind].id, `${plan} ${kind}: the style's own Canon default`);
      amounts[kind] = motion(r);
      assert.deepEqual(r, cultureTestDrive(m, { kind, beats: 5.25 }), 'deterministic');
    }
    assert.equal(amounts.still, 0, `${plan}: still holds`);
    assert.ok(amounts.idle > 0 && amounts.performing > amounts.idle, `${plan}: performing moves more than idle`);
    const a = cultureTestDrive(m, { kind: 'idle', beats: 5.25 });
    const b = cultureTestDrive(m, { kind: 'performing', beats: 5.25 });
    assert.notDeepEqual(
      a.nodes.map((n) => n.pose),
      b.nodes.map((n) => n.pose),
      'switching gaits changes the motion',
    );
    const later = cultureTestDrive(m, { kind: 'performing', beats: 6.75 });
    assert.notDeepEqual(
      b.nodes.map((n) => n.pose),
      later.nodes.map((n) => n.pose),
      'it moves on the beat count',
    );
  }
  ok(
    'T1: every plan plays its style’s Canon still / idle / performing on the beat — still holds, switching changes the motion',
  );
}

// 2 — reduced motion, refusals, nothing written.
{
  for (const plan of CULTURE_BODY_PLANS) {
    const m = candidate(plan);
    const snap = JSON.stringify(m);
    for (const kind of CANON_GAIT_KINDS) {
      const r = cultureTestDrive(m, { kind, beats: 9.5, reducedMotion: true });
      assert.ok(
        r.nodes.every((n) => n.pose === POSE_IDENTITY),
        `${plan} ${kind}: reduced motion holds still`,
      );
    }
    if (plan === CULTURE_PLAN_STRANDBEEST) {
      const a = cultureTestDrive(m, { beats: 0, reducedMotion: true });
      const b = cultureTestDrive(m, { beats: 40, reducedMotion: true });
      assert.deepEqual(a.bones, b.bones, 'reduced motion: the crank stays at birth');
    }
    assert.equal(JSON.stringify(m), snap, 'the candidate is untouched');
  }
  const m = candidate('dish');
  assert.throws(() => cultureTestDrive(m, { kind: 'dance' }), /gait kind/);
  assert.throws(() => cultureTestDrive(m, { beats: -1 }), /beats/);
  assert.throws(() => cultureTestDrive(m, { beats: NaN }), /beats/);
  assert.throws(() => cultureTestDrive({ body: { ...m.body, plan: 'wasp' } }), /no Canon style/);
  let stillborn = null;
  for (let a = 0; a < 16 && !stillborn; a++) {
    const c = curatorAudition(CULTURE_PLAN_STRANDBEEST, 7, 0, a);
    if (loisGate(c, LIVE).faults.includes('a stillbirth: the linkage cannot assemble')) stillborn = c;
  }
  assert.ok(stillborn);
  assert.throws(() => cultureTestDrive(stillborn), /stillbirth does not drive/);
  assert.equal(standingCultureWorld(), null, 'no world exists: the bench writes no take, no bank, no stage');
  ok(
    'T1: reduced motion holds still; the bench refuses loudly (a bad kind or beat, no style, a stillbirth) and writes nothing',
  );
}

// 3 — the strandbeest on the bench.
{
  const m = candidate(CULTURE_PLAN_STRANDBEEST);
  const a = cultureTestDrive(m, { kind: 'still', beats: 0 });
  const b = cultureTestDrive(m, { kind: 'still', beats: 1 });
  assert.equal(a.nodes.length, cultureTreeOf('beast', m.body.linkage).nodes.length, 'through the beast adapter');
  assert.equal(a.bones.length, a.nodes.length);
  assert.deepEqual(a.bones[0], b.bones[0], 'the beam stays put: it walks in place');
  assert.notDeepEqual(a.bones.slice(1), b.bones.slice(1), 'the legs crank on the beat');
  ok('T1: the strandbeest drives through the beast adapter, walking in place on the bench');
}

// 4 — the mood map.
{
  assert.deepEqual(cultureMoodMultipliers(), { breath: 1, pulse: 1, drift: 1 });
  assert.deepEqual(cultureMoodMultipliers({ approval: 1, crowding: 1, strain: 1, boredom: 1 }), {
    breath: 1,
    pulse: 1,
    drift: 1,
  });
  const g = canonGaits('organic').performing;
  assert.equal(moodGait(g, cultureMoodMultipliers({})), g, 'neutral leaves the gait itself');
  const vals = [0.25, 0.5, 0.8, 1, 1.3, 2];
  for (const a of vals)
    for (const c of vals)
      for (const s of vals)
        for (const b of vals) {
          const m = cultureMoodMultipliers({ approval: a, crowding: c, strain: s, boredom: b });
          for (const k of CULTURE_MOOD_DRIVERS)
            assert.ok(m[k] >= CULTURE_MOOD_MIN && m[k] <= CULTURE_MOOD_MAX, `${k} bounded`);
          assert.deepEqual(m, cultureMoodMultipliers({ approval: a, crowding: c, strain: s, boredom: b }));
        }
  // the deviation is clamped to [−1, 1]: any gain at ½ or below reads as −1 (½ and the gene's floor ¼ are the same mood)
  for (const d of CULTURE_MOOD_DRIVES) {
    assert.deepEqual(cultureMoodMultipliers({ [d]: 0.25 }), cultureMoodMultipliers({ [d]: 0.5 }), `${d}: ¼ reads as ½`);
    assert.deepEqual(
      cultureMoodMultipliers({ [d]: 0.3 }),
      cultureMoodMultipliers({ [d]: 0.5 }),
      `${d}: 0.3 reads as ½`,
    );
  }
  // out-of-gene values are held in the gene's range; junk reads as the norm
  assert.deepEqual(cultureMoodMultipliers({ strain: 99 }), cultureMoodMultipliers({ strain: 2 }));
  assert.deepEqual(cultureMoodMultipliers({ strain: 'x' }), { breath: 1, pulse: 1, drift: 1 });
  for (const k of CULTURE_MOOD_DRIVERS)
    assert.deepEqual(
      Object.keys(CULTURE_MOOD_MAP[k]).sort(),
      [...CULTURE_MOOD_DRIVES].sort(),
      'every drive documented',
    );
  // moodGait scales each driver by its own multiplier
  const m = cultureMoodMultipliers({ boredom: 2 });
  const mg = moodGait(g, m);
  for (const [role, r] of Object.entries(g.roles))
    r.drivers.forEach((d, i) => assert.ok(Math.abs(mg.roles[role].drivers[i].amount - d.amount * m[d.id]) < 1e-12));
  ok(
    'T2: the mood map is bounded and deterministic, documented per drive; neutral drives give exactly 1 and the gait itself',
  );
}

// 5 — the mood previews.
{
  const presets = cultureMoodPresets();
  assert.deepEqual(Object.keys(presets), [...CULTURE_MOOD_DRIVES]);
  const m = candidate('moth');
  const base = cultureTestDrive(m, { kind: 'performing', beats: 3.5 });
  for (const d of CULTURE_MOOD_DRIVES) {
    assert.equal(presets[d][d], 2, `${d} pushed to the gene's ceiling`);
    for (const e of CULTURE_MOOD_DRIVES) if (e !== d) assert.equal(presets[d][e], 1);
    const mood = cultureMoodMultipliers(presets[d]);
    assert.ok(
      CULTURE_MOOD_DRIVERS.some((k) => mood[k] !== 1),
      `${d} changes a driver`,
    );
    const r = cultureTestDrive(m, { kind: 'performing', beats: 3.5, mood: presets[d] });
    assert.notDeepEqual(
      r.nodes.map((n) => n.pose),
      base.nodes.map((n) => n.pose),
      `${d} high changes how the gait plays`,
    );
  }
  assert.deepEqual(
    cultureTestDrive(m, { kind: 'performing', beats: 3.5, mood: { approval: 1 } }),
    base,
    'a neutral mood plays the gait unchanged',
  );
  ok('T2: each preview pushes its own drive high and changes how the gait plays; a neutral mood plays it unchanged');
}

console.log(`cultureTestDrive.selfcheck: ${checks}/5 groups OK`);
