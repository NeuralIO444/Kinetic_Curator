// node src/engine/robot.selfcheck.mjs
// Phase 2 S6 — the robot type: rules only over S1's skeleton. Detent-exact poses (every joint a multiple
// of 45°), a mechanical settle that travels between detents over 2–3 counted frames as a pure function of
// the frame index, the 4x4x4 plan data (spine plans x chain plans x ornament sets) over the plate + rivet
// pool, and the panel-hatch engraving variant as data. Golden seed + parity throughout: the same seed
// grows the same robot, and a recorded pose sequence replays bit for bit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ROBOT_DETENT_STEP_DEG,
  ROBOT_SETTLE_FRAMES_NEAR,
  ROBOT_SETTLE_FRAMES_FAR,
  ROBOT_SPINE_PLANS,
  ROBOT_CHAIN_PLANS,
  ROBOT_ORNAMENT_SETS,
  ROBOT_PART_POOL,
  ROBOT_ENGRAVING,
  quantiseDetent,
  arcDeltaDeg,
  quantiseSkeletonPose,
  robotTargetAngles,
  createRobotPoseState,
  stepRobotPose,
  robotJointAngle,
  settleRobotSkeleton,
  robotPlanIndices,
  robotPlan,
  buildRobotSkeleton,
  buildRobotFrame,
} from './robot.js';
import { buildSkeleton, mirrorBone, fnv1a } from './skeleton.js';

// A symmetric fixture body in box units, in autoAttachPoints' order: top, right, bottom, left (as S1).
const FIXTURE = [
  { x: 50, y: 5 },
  { x: 95, y: 50 },
  { x: 50, y: 95 },
  { x: 5, y: 50 },
];
const byId = (skel, id) => skel.bones.find((b) => b.id === id);
const isDetent = (deg) => Number.isInteger(deg / ROBOT_DETENT_STEP_DEG);

// 1. The quantiser: every angle snaps to an exact detent multiple, ties break toward the positive detent,
//    and the shortest arc never exceeds a half turn.
{
  assert.equal(quantiseDetent(0), 0);
  assert.equal(quantiseDetent(44), 45);
  assert.equal(quantiseDetent(46), 45);
  assert.equal(quantiseDetent(22.5), 45, 'a tie breaks toward the positive detent');
  assert.equal(quantiseDetent(-22.5), 0, 'the same tie rule on the negative side');
  assert.equal(quantiseDetent(157.5), -180, 'the seam tie lands on the -180 detent');
  assert.equal(quantiseDetent(-170), -180);
  for (let x = -720; x <= 720; x += 7.3) {
    assert.ok(isDetent(quantiseDetent(x)), `quantiseDetent(${x}) is a detent`);
    assert.equal(quantiseDetent(quantiseDetent(x)), quantiseDetent(x), 'quantising is idempotent');
  }
  assert.equal(arcDeltaDeg(135, -135), 90, 'the shortest arc crosses the seam forward');
  assert.equal(arcDeltaDeg(-135, 135), -90);
  assert.equal(arcDeltaDeg(10, 350), -20);
  assert.equal(Math.abs(arcDeltaDeg(0, 180)), 180, 'a half turn is a half turn');
}

// 2. The golden robot: seed 77 draws tower + cranes with rivet-seams, 17 bones, every resting angle —
//    absolute and local — an exact detent, and the hash is pinned. Same inputs, same robot, bit for bit.
{
  const g = buildRobotSkeleton({ seed: 77, creatureId: 'r0', attach: FIXTURE });
  assert.deepEqual(g.planIndices, { spine: 2, chains: 2, ornaments: 1 }, 'the golden draw');
  assert.equal(g.plan.id, 'robot/tower+cranes');
  assert.equal(g.ornamentSet.id, 'rivet-seams');
  assert.equal(g.skeleton.bones.length, 17, 'spine 5 + (fore + hind) x 3 bones x 2 sides');
  assert.equal(g.skeleton.hash, 'c305b38a', 'the golden bone hash');
  for (const b of g.skeleton.bones) {
    assert.ok(isDetent(b.angleDeg), `${b.id} rests on a detent (${b.angleDeg})`);
    assert.ok(isDetent(b.localAngleDeg), `${b.id}'s local angle is a detent difference`);
  }
  const again = buildRobotSkeleton({ seed: 77, creatureId: 'r0', attach: FIXTURE });
  assert.deepEqual(again.skeleton.bones, g.skeleton.bones, 'two builds of the same inputs are identical');
  assert.equal(again.skeleton.hash, g.skeleton.hash);
  assert.notEqual(
    buildRobotSkeleton({ seed: 78, creatureId: 'r0', attach: FIXTURE }).skeleton.hash,
    g.skeleton.hash,
    'another seed, another robot',
  );
  assert.notEqual(
    buildRobotSkeleton({ seed: 77, creatureId: 'r1', attach: FIXTURE }).skeleton.hash,
    g.skeleton.hash,
    'the creature is half the RNG key',
  );
  // quantising an already-quantised pose changes nothing, and quantising never changes a length
  assert.deepEqual(quantiseSkeletonPose(g.skeleton).bones, g.skeleton.bones, 'the quantiser is idempotent on a robot');
  const raw = buildSkeleton({ seed: 77, creatureId: 'r0', plan: g.plan, attach: FIXTURE });
  const q = quantiseSkeletonPose(raw);
  for (const b of raw.bones) assert.equal(byId(q, b.id).length, b.length, `${b.id} keeps its length exactly`);
  // the robot's bones are S1's bones — same ids, same structure, no forked bone kind (the kill line)
  assert.deepEqual(
    q.bones.map((b) => b.id),
    raw.bones.map((b) => b.id),
    'quantised ids = built ids, in order',
  );
  assert.deepEqual(
    robotTargetAngles(raw),
    Object.fromEntries(raw.bones.filter((b) => b.side !== 'R').map((b) => [b.id, quantiseDetent(b.angleDeg)])),
    'targets are the raw angles, snapped',
  );
}

// 3. The mirror survives quantisation exactly: every right bone is mirrorBone of the posed left.
{
  const g = buildRobotSkeleton({ seed: 77, creatureId: 'r0', attach: FIXTURE });
  for (const bone of g.skeleton.bones.filter((x) => x.side === 'R')) {
    const left = byId(g.skeleton, bone.id.replace('/R/', '/L/'));
    assert.deepEqual(bone, mirrorBone(left), `${bone.id} is mirrorBone(${left.id}), bit for bit`);
    const ang = (Math.atan2(bone.uy, bone.ux) * 180) / Math.PI;
    assert.ok(Math.abs(ang - bone.angleDeg) < 1e-9, `${bone.id} direction agrees with its endpoints`);
  }
  // chains stay joined after the snap: a sequential bone still starts where its parent ended
  for (const bone of g.skeleton.bones) {
    if (!bone.parent || !bone.chain) continue;
    const parent = byId(g.skeleton, bone.parent);
    if (parent.chain === bone.chain) assert.deepEqual(bone.base, parent.tip, `${bone.id} grows out of ${bone.parent}`);
  }
}

// 4. The settle: a 45° move travels 2 frames, a 90° move travels 3 (crossing the ±180 seam on the short
//    arc), the change frame itself still shows the old angle, landing is exact, a parked target holds,
//    and the whole sequence is a pure function of the frame index — replay is bit-identical, hash pinned.
const IDX = { spine: 1, chains: 1, ornaments: 0 }; // column + arms-legs: a fore chain and a hind chain
const poseAt = (f) =>
  f < 3
    ? { foreDirDeg: 90, hindDirDeg: 135 }
    : f < 7
      ? { foreDirDeg: 45, hindDirDeg: 135 }
      : { foreDirDeg: 45, hindDirDeg: 45 };
const q4 = (v) => Math.round(v * 10000) / 10000;
function runSequence(frames = 12) {
  let state = createRobotPoseState();
  const lines = [];
  const track = [];
  for (let f = 0; f < frames; f++) {
    const r = buildRobotFrame(
      state,
      { seed: 77, creatureId: 'r0', attach: FIXTURE, pose: poseAt(f), planIndices: IDX },
      f,
    );
    state = r.state;
    assert.equal(
      byId(r.skeleton, 'fore/L/0').angleDeg,
      r.angles['fore/L/0'],
      'the posed skeleton carries the settled angle',
    );
    assert.equal(robotJointAngle(state, 'fore/L/0', f), r.angles['fore/L/0'], 'the state reads the same angle back');
    lines.push(
      Object.keys(r.angles)
        .sort()
        .map((id) => `${id}=${q4(r.angles[id])}`)
        .join(','),
    );
    track.push({ fore: r.angles['fore/L/0'], hind: r.angles['hind/L/0'] });
  }
  return { seq: lines.join(';'), track };
}
{
  const { seq, track } = runSequence();
  assert.equal(fnv1a(seq).toString(16).padStart(8, '0'), '34dd44c0', 'the golden pose-sequence hash');
  // fore: target changes at frame 3 (-180 -> -135, one detent step, NEAR frames)
  assert.equal(ROBOT_SETTLE_FRAMES_NEAR, 2);
  assert.equal(track[3].fore, -180, 'the change frame still shows the old angle');
  assert.equal(track[4].fore, -157.5, 'halfway through a 2-frame settle');
  assert.equal(track[5].fore, -135, 'landed exactly, 2 frames after the change');
  // hind: target changes at frame 7 (135 -> -135, a 90° arc across the seam, FAR frames)
  assert.equal(ROBOT_SETTLE_FRAMES_FAR, 3);
  assert.equal(track[7].hind, 135, 'the change frame still shows the old angle');
  assert.equal(track[8].hind, 165, 'travelling the short arc');
  assert.equal(track[9].hind, -165, 'across the seam, still travelling');
  assert.equal(track[10].hind, -135, 'landed exactly, 3 frames after the change');
  assert.equal(track[11].hind, -135, 'a parked target holds its detent — no drift, no oscillation');
  // mid-travel the bones are honestly between detents; at rest they are all on detents
  const rest = buildRobotFrame(
    createRobotPoseState(),
    { seed: 77, creatureId: 'r0', attach: FIXTURE, pose: poseAt(0), planIndices: IDX },
    0,
  );
  for (const b of rest.skeleton.bones) assert.ok(isDetent(b.angleDeg), `${b.id} is born on its detent`);
  // replay: the same target sequence from a fresh state reproduces the sequence bit for bit
  assert.equal(runSequence().seq, seq, 'replay is identical');
  // stepRobotPose is pure: stepping does not mutate the state it was given
  const s0 = createRobotPoseState();
  const s1 = stepRobotPose(s0, { 'fore/L/0': -135 }, 0);
  assert.deepEqual(s0, { joints: {} }, 'the input state is untouched');
  assert.equal(robotJointAngle(s1, 'fore/L/0', 0), -135, 'a joint is born settled on its first target');
  assert.equal(robotJointAngle(s1, 'nope', 0), null, 'an unknown joint reads null');
}

// 5. A mid-travel retarget re-segments from where the joint stands — no teleport, no restart from the
//    old detent — and lands on the ruled frame count for the remaining distance.
{
  let state = createRobotPoseState();
  const angles = [];
  const poseFlip = (f) => ({ foreDirDeg: f < 3 ? 90 : f === 3 ? 45 : 90, hindDirDeg: 135 });
  for (let f = 0; f < 7; f++) {
    const r = buildRobotFrame(
      state,
      { seed: 77, creatureId: 'r0', attach: FIXTURE, pose: poseFlip(f), planIndices: IDX },
      f,
    );
    state = r.state;
    angles.push(r.angles['fore/L/0']);
  }
  assert.deepEqual(
    angles,
    [-180, -180, -180, -180, -157.5, -168.75, -180],
    'out at frame 3, called back at frame 4 from mid-travel (-157.5), home in 2 frames for the 22.5° left',
  );
}

// 6. The 4x4x4 data: four bodies, four limb plans, four hand sets — detent directions, no sweep, chain
//    fractions summing to the whole chain; ornament pieces name pool parts that exist; the pool and the
//    engraving variant are the shapes the later slices consume.
{
  assert.equal(ROBOT_SPINE_PLANS.length, 4, 'four spine plans');
  assert.equal(ROBOT_CHAIN_PLANS.length, 4, 'four chain plans');
  assert.equal(ROBOT_ORNAMENT_SETS.length, 4, 'four ornament sets');
  const poolIds = new Set(ROBOT_PART_POOL.map((p) => p.id));
  assert.equal(poolIds.size, ROBOT_PART_POOL.length, 'pool ids are unique');
  for (const p of ROBOT_PART_POOL) {
    assert.ok(['plate', 'strut', 'rivet'].includes(p.kind), `${p.id} is a plate, a strut or a rivet`);
    assert.ok(p.w > 0 && p.h > 0, `${p.id} has a size`);
  }
  for (const cp of ROBOT_CHAIN_PLANS) {
    for (const spec of cp.chains) {
      assert.ok(isDetent(spec.dirDeg), `${cp.id}/${spec.id} direction sits on a detent`);
      assert.equal(spec.sweepDeg, 0, `${cp.id}/${spec.id} does not curve`);
      assert.ok(
        Math.abs(spec.lenFrac.reduce((a, b) => a + b, 0) - 1) < 1e-9,
        `${cp.id}/${spec.id} fractions sum to the chain`,
      );
    }
  }
  for (const os of ROBOT_ORNAMENT_SETS) {
    for (const piece of os.pieces) {
      assert.ok(poolIds.has(piece.part), `${os.id} dresses with ${piece.part}, which is in the pool`);
      assert.ok(['joint', 'root', 'tip', 'midbone'].includes(piece.on), `${os.id}'s anchor is in the vocabulary`);
    }
  }
  assert.equal(ROBOT_ENGRAVING.variant, 'panel-hatch', 'the engraving family keys on this variant flag');
  assert.ok(isDetent(ROBOT_ENGRAVING.hatchDeg) && isDetent(ROBOT_ENGRAVING.crossDeg), 'hatch runs sit on detents too');
  // the plan composer + the seeded draw
  assert.equal(robotPlan(1, 1).id, 'robot/column+arms-legs');
  assert.deepEqual(robotPlan(99, -3), robotPlan(3, 0), 'plan indices clamp into range');
  for (let s = 0; s < 50; s++) {
    const idx = robotPlanIndices(s, `r${s % 5}`);
    assert.ok(
      idx.spine >= 0 && idx.spine < 4 && idx.chains >= 0 && idx.chains < 4 && idx.ornaments >= 0 && idx.ornaments < 4,
      'draws land in range',
    );
    assert.deepEqual(robotPlanIndices(s, `r${s % 5}`), idx, 'the draw is deterministic');
  }
  // settleRobotSkeleton agrees with buildRobotFrame's plumbing on a single frame
  const one = settleRobotSkeleton(
    createRobotPoseState(),
    buildSkeleton({ seed: 77, creatureId: 'r0', plan: robotPlan(1, 1), attach: FIXTURE, pose: poseAt(0) }),
    0,
  );
  for (const b of one.skeleton.bones) assert.ok(isDetent(b.angleDeg), 'a single settled frame is all detents');
}

// 7. The determinism guard, in mathRandomGuard's pattern — and the no-fork line, read off the source:
//    robot.js builds on skeleton.js's builder; it does not re-implement one.
{
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'robot.js'), 'utf8');
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const code = noBlock
    .split('\n')
    .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
    .join('\n');
  for (const banned of ['Math.random', 'Date.now', 'performance.now']) {
    assert.ok(
      !code.includes(banned),
      `robot.js must not use ${banned} — seeded kernel channels and counted frames only`,
    );
  }
  assert.ok(
    code.includes("from './skeleton.js'") && code.includes('buildSkeleton'),
    "robot.js parameterises S1's builder — no engine fork",
  );
}

console.log('robot.selfcheck: OK (detents, golden hash, mirror, settle 2-3 frames, replay, 4x4x4 data, guard)');
