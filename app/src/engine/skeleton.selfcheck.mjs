// node src/engine/skeleton.selfcheck.mjs
// Phase 2 S1 — the skeleton: pure bone construction under every creature. Deterministic bones, an exact
// mirror, a stable hash, H/L markers from the attach points, and the creature builder publishing the frame's
// skeletons without the drawn moth changing at all.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ASSETS } from '../data/assets/index.js';
import {
  buildSkeleton,
  mirrorBone,
  resolveMarkers,
  skeletonHash,
  transformSkeleton,
  MOTH_SKELETON_PLAN,
} from './skeleton.js';
import { createCreatureBuilder, MOTH, pointToward } from './creature.js';
import { FAN_COUNTS } from './featherFan.js';
import { autoAttachPoints } from './autoAttach.js';

// A symmetric fixture body in box units, in autoAttachPoints' order: top, right, bottom, left.
const FIXTURE = [
  { x: 50, y: 5 },
  { x: 95, y: 50 },
  { x: 50, y: 95 },
  { x: 5, y: 50 },
];
const build = (over = {}) => buildSkeleton({ seed: 77, creatureId: 'm0', attach: FIXTURE, ...over });
const byId = (skel, id) => skel.bones.find((b) => b.id === id);

// 1. Determinism: the same (seed, creature, plan, attach, pose) grows the same bones, bit for bit, and the
//    hash follows. Another seed or another trait grows a different frame.
{
  const a = build();
  const b = build();
  assert.deepEqual(b.bones, a.bones, 'two builds of the same inputs are identical');
  assert.equal(b.hash, a.hash);
  assert.match(a.hash, /^[0-9a-f]{8}$/, 'the bone hash is an 8-hex FNV-1a');
  assert.equal(skeletonHash(a), a.hash, 'the exported hash agrees with the build');
  assert.notEqual(build({ seed: 78 }).hash, a.hash, 'another seed, another frame');
  assert.notEqual(build({ pose: { wingScale: 1.2 } }).hash, a.hash, 'a trait moves the bones');
  assert.notEqual(build({ creatureId: 'm1' }).hash, a.hash, 'the creature is half the RNG key');
}

// 2. Shape: a 4-segment spine, two 3-bone chains per side — and the right side is the left, mirrored exactly.
{
  const skel = build();
  assert.equal(skel.bones.length, 4 + 2 * 3 * 2, 'spine 4 + (fore + hind) x 3 bones x 2 sides');
  for (const bone of skel.bones.filter((x) => x.side === 'R')) {
    const left = byId(skel, bone.id.replace('/R/', '/L/'));
    assert.ok(left, `${bone.id} has a left source`);
    assert.deepEqual(bone, mirrorBone(left), `${bone.id} is mirrorBone(${left.id}), bit for bit`);
    // the mirror is geometrically true, not just self-consistent: the stored direction re-derives from atan2
    const ang = (Math.atan2(bone.uy, bone.ux) * 180) / Math.PI;
    assert.ok(Math.abs(ang - bone.angleDeg) < 1e-9, `${bone.id} direction agrees with its endpoints`);
    assert.equal(bone.length, left.length, 'a mirrored bone keeps its length exactly');
  }
  for (const bone of skel.bones.filter((x) => x.side === 'C')) {
    assert.equal(bone.base.x, 0, 'the spine rides the axis');
    assert.equal(bone.tip.x, 0, 'the spine rides the axis');
  }
  // chains are continuous: each bone after the root starts where its parent ended (a chain's ROOT starts
  // at its attach point instead — it is parented to the nearest spine joint for posing, not grown from it)
  for (const bone of skel.bones) {
    if (!bone.parent || !bone.chain) continue;
    const parent = byId(skel, bone.parent);
    if (parent.chain === bone.chain) assert.deepEqual(bone.base, parent.tip, `${bone.id} grows out of ${bone.parent}`);
  }
}

// 3. Markers: the first point is H (the head bone ends exactly on it); every chain root carries L. A point
//    that carries a role beats the default — the wet lab's future H/L roles plug in here unchanged.
{
  assert.deepEqual(resolveMarkers(FIXTURE), { head: 0, limbs: [1, 2, 3] });
  const skel = build();
  assert.equal(skel.headBone, 'spine/3');
  const head = byId(skel, skel.headBone);
  assert.equal(head.marker, 'H');
  assert.deepEqual(head.tip, { x: 0, y: -45 }, 'the head bone ends on the top point');
  assert.equal(skel.bones.filter((b) => b.marker === 'L').length, 4, 'fore + hind roots, both sides');
  assert.deepEqual(byId(skel, 'fore/L/0').base, { x: -45, y: 0 }, 'the fore chain roots on the left point');
  assert.deepEqual(byId(skel, 'fore/R/0').base, { x: 45, y: 0 }, 'and its mirror on the right point');

  const roled = [
    { x: 50, y: 95, role: 'H' },
    { x: 95, y: 50, role: 'L' },
    { x: 50, y: 5 },
  ];
  assert.deepEqual(resolveMarkers(roled), { head: 0, limbs: [1, 2] });
  const skel2 = buildSkeleton({ seed: 77, creatureId: 'm0', attach: roled });
  assert.deepEqual(
    byId(skel2, skel2.headBone).tip,
    { x: 0, y: 45 },
    'a role-H at the bottom makes the bottom the head',
  );
}

// 4. The skeleton describes the moth that is actually drawn: its fore roots are the recipe's own wing joins
//    (pointToward on the real body asset's attach points).
{
  const bodyPts = autoAttachPoints(ASSETS.find((a) => a.id === 'org_pod_02').svg);
  const skel = buildSkeleton({ seed: 77, creatureId: 'm0', attach: bodyPts });
  assert.deepEqual(byId(skel, 'fore/L/0').base, pointToward(bodyPts, 'left'), 'left fore root = the left attach point');
  assert.deepEqual(
    byId(skel, 'fore/R/0').base,
    pointToward(bodyPts, 'right'),
    'right fore root = the right attach point',
  );
}

// 5. Plans are data: any number of chains grows (every marked L a plan roots at), hind chains follow the
//    pair amount, and a chainless plan is a spine alone.
{
  const trio = {
    id: 'trio',
    spineSegments: 3,
    hindAlong: 0.45,
    chains: [
      { id: 'a', root: 'side', dirDeg: 40, sweepDeg: 5, totalLen: 60, lenFrac: [0.5, 0.3, 0.2] },
      { id: 'b', root: 'hind', dirDeg: 100, sweepDeg: 5, totalLen: 60, lenFrac: [0.5, 0.3, 0.2] },
      { id: 'c', root: 'side', dirDeg: 70, sweepDeg: 5, totalLen: 60, lenFrac: [0.5, 0.3, 0.2] },
    ],
  };
  assert.equal(buildSkeleton({ seed: 1, creatureId: 'x', plan: trio, attach: FIXTURE }).bones.length, 3 + 3 * 3 * 2);
  assert.equal(build({ pose: { hindAmount: 0 } }).bones.length, 4 + 3 * 2, 'no hind pair, no hind bones');
  const spineOnly = buildSkeleton({
    seed: 1,
    creatureId: 'x',
    plan: { id: 's', spineSegments: 5, chains: [] },
    attach: FIXTURE,
  });
  assert.equal(spineOnly.bones.length, 5, "a 5-segment spine, at the top of the brief's range");
  assert.equal(
    buildSkeleton({ seed: 1, creatureId: 'x', attach: [] }).bones.length,
    16,
    'no points: the box extremes still grow a frame',
  );
  assert.equal(buildSkeleton({ seed: 1, creatureId: 'x', attach: null }).hash.length, 8);
}

// 6. Placement: transformSkeleton moves the frame without bending it.
{
  const skel = build();
  assert.deepEqual(transformSkeleton(skel, {}).bones, skel.bones, 'the identity transform is exact');
  const moved = transformSkeleton(skel, { x: 500, y: 350, scale: 2 });
  assert.deepEqual(moved.bones[0].base, { x: 500, y: 350 + 90 }, 'the tail lands on the pin, scaled');
  assert.ok(Math.abs(moved.bones[0].length - skel.bones[0].length * 2) < 1e-9, 'lengths scale');
  assert.notEqual(moved.hash, skel.hash);
}

// 7. The builder publishes the frame's skeletons — and the moth it draws is the moth of
//    creature.selfcheck (50 creature items at full growth since S3 grew the feather fans on the
//    wings' bones — S1 drew 26 — no hind pair without the crowd's word).
{
  const FAN_PER_WING = FAN_COUNTS.fore.plate + FAN_COUNTS.fore.feather + FAN_COUNTS.fore.leaf + FAN_COUNTS.fore.chevron;
  const PAL = { bg: '#111111', ink: '#eeeeee', swatches: ['#aa0000', '#222222'] };
  const entry = () => [{ id: 'a', items: [{ x: 1, y: 1, assetId: 'x' }], palette: PAL }];
  const input = (over = {}) => ({
    dishPins: [{ x: 500, y: 350 }],
    dishFormed: [true],
    seed: 77,
    seedOffsets: null,
    loopTimeMs: 0,
    assetAttach: {},
    ...over,
  });
  const b = createCreatureBuilder();
  let e;
  for (let i = 0; i < MOTH.growFrames + 1; i++) {
    e = entry();
    b.append(input({ wantSkeletons: true }), e, ASSETS);
  }
  assert.equal(
    e[0].items.filter((it) => it._creature).length,
    3 + 1 + 2 + 2 * FAN_PER_WING,
    'the drawn moth: halos + body + wings + fans',
  );
  const skels = b.lastSkeletons();
  assert.equal(skels.length, 1);
  assert.equal(skels[0].bones.length, 10, 'one pair grown in: spine + fore chains only');
  assert.ok(
    skels[0].bones.every((bn) => Number.isFinite(bn.base.x + bn.base.y + bn.tip.x + bn.tip.y)),
    'world bones are finite',
  );
  const head = skels[0].bones.find((bn) => bn.marker === 'H');
  assert.ok(Math.hypot(head.tip.x - 500, head.tip.y - 350) < 100, 'the head stands over the pin');
  assert.match(skels[0].hash, /^[0-9a-f]{8}$/);
  b.append(input({ dishFormed: [false] }), entry(), ASSETS);
  assert.deepEqual(b.lastSkeletons(), [], 'nothing formed, nothing published');
  // The gate (Matt's 2026-10-16 tech check on PR #1653): no consumer asking (no wantSkeletons) →
  // nothing PUBLISHED, and the drawn moth is the same moth the gate-on run drew. The gate still
  // governs publication; since S3 the fan grows on the bones, so the builder builds them either
  // way — the fan is the always-on consumer S1 anticipated (S3's staging report records the change).
  const b2 = createCreatureBuilder();
  let e2;
  for (let i = 0; i < MOTH.growFrames + 1; i++) {
    e2 = entry();
    b2.append(input(), e2, ASSETS);
  }
  assert.equal(
    e2[0].items.filter((it) => it._creature).length,
    3 + 1 + 2 + 2 * FAN_PER_WING,
    'gate off: the drawn moth is whole',
  );
  assert.deepEqual(b2.lastSkeletons(), [null], 'gate off: no skeleton is published');
}

// 8. The determinism guard, in mathRandomGuard's pattern: skeleton.js carries none of the banned clocks or
//    unseeded chance in its code (comments stripped first, exactly as the guard strips them).
{
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'skeleton.js'), 'utf8');
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const code = noBlock
    .split('\n')
    .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
    .join('\n');
  for (const banned of ['Math.random', 'Date.now', 'performance.now']) {
    assert.ok(!code.includes(banned), `skeleton.js must not use ${banned} — seeded kernel channels only`);
  }
}

console.log('skeleton.selfcheck: OK (determinism, mirror, hash, markers, plans, builder wiring, guard)');
