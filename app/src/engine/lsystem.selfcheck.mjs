// node src/engine/lsystem.selfcheck.mjs
// Phase 2 S7 — the L-system growth: a skeleton generator variant. The skeleton IS the tree — golden seeds
// grow identical trees, sprouting is a counted-frame pose that replays identically, and Tighten's prune
// is a pose of the grown structure, never a mutation of it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  LSYSTEM_CAPS,
  LSYSTEM_RULE_SETS,
  SPROUT_FRAMES,
  buildTreeSkeleton,
  expandLSystem,
  growTreeSkeleton,
  poseTreeSkeleton,
  pruneTreeSkeleton,
  sproutAmount,
} from './lsystem.js';
import { buildSkeleton, skeletonHash, transformSkeleton } from './skeleton.js';

const build = (over = {}) => buildTreeSkeleton({ seed: 77, creatureId: 't0', ruleSet: 'canopy', ...over });
const byId = (skel, id) => skel.bones.find((b) => b.id === id);

// 1. Determinism and the golden seeds: the same (seed, creature, grammar) grows the same tree, bit for
//    bit, and the pinned hashes are the parity contract — a deliberate grammar change re-pins them here.
{
  const a = build();
  const b = build();
  assert.deepEqual(b.bones, a.bones, 'two grows of the same inputs are identical');
  assert.equal(b.hash, a.hash);
  assert.equal(skeletonHash(a), a.hash, "the tree hash is skeletonHash — S1's discipline, literally");
  // GOLDEN (seed 77, creature t0), measured on this implementation:
  assert.equal(a.hash, '83e330fb', 'golden: canopy');
  assert.equal(a.bones.length, 242, 'golden: canopy bone count');
  assert.equal(build({ ruleSet: 'fern' }).hash, 'ad8ec527', 'golden: fern');
  assert.equal(build({ ruleSet: 'spire' }).hash, '0317a960', 'golden: spire');
  assert.equal(
    buildTreeSkeleton({ seed: 77, creatureId: 't0' }).hash,
    '0317a960',
    "golden: the seed's own pick (spire)",
  );
  assert.equal(build({ seed: 7 }).hash, '581da44e', 'golden: canopy, seed 7');
  assert.notEqual(build({ seed: 78 }).hash, a.hash, 'another seed, another tree');
  assert.notEqual(build({ creatureId: 't1' }).hash, a.hash, 'the creature is half the RNG key');
  assert.notEqual(build({ pose: { angleDeg: 24 } }).hash, a.hash, 'a pose override moves the tree');
}

// 2. Shape: a tree bone is indistinguishable in shape from a moth bone (same key set), the skeleton object
//    carries S1's fields, parents precede children, and every bone grows out of its parent's tip.
{
  const mothBoneKeys = Object.keys(buildSkeleton({ seed: 1, creatureId: 'm0' }).bones[0]).sort();
  const skel = build();
  for (const bone of skel.bones)
    assert.deepEqual(Object.keys(bone).sort(), mothBoneKeys, `${bone.id} has the moth bone's shape`);
  for (const key of ['plan', 'creatureId', 'bones', 'headBone', 'hash'])
    assert.ok(key in skel, `skeleton carries ${key}`);
  assert.equal(skel.plan, 'lsystem:canopy');
  const seen = new Map();
  for (const bone of skel.bones) {
    if (bone.parent) {
      const parent = seen.get(bone.parent);
      assert.ok(parent, `${bone.id}'s parent ${bone.parent} precedes it`);
      assert.deepEqual(bone.base, parent.tip, `${bone.id} grows out of ${bone.parent}'s tip`);
    }
    seen.set(bone.id, bone);
  }
  // the trunk is continuous and rides the axis; the last trunk bone is the head and carries the only H
  const trunk = skel.bones.filter((x) => x.chain === null);
  assert.ok(trunk.length >= 2, 'a trunk grew');
  for (const bone of trunk) assert.equal(bone.base.x, bone.tip.x, 'trunk bones ride the axis');
  assert.equal(skel.headBone, trunk[trunk.length - 1].id);
  assert.equal(byId(skel, skel.headBone).marker, 'H');
  assert.equal(skel.bones.filter((x) => x.marker === 'H').length, 1, 'exactly one head');
  // every chain root — and only a chain root — carries the L
  for (const bone of skel.bones) {
    const isRoot = bone.chain !== null && bone.id.endsWith('/0');
    assert.equal(bone.marker === 'L', isRoot, `${bone.id}: L marks chain roots only`);
    if (bone.chain !== null) assert.equal(bone.role, 'limb');
  }
}

// 3. Mirror discipline where the rules call for it: the paired grammars branch in +/- pairs from the
//    on-axis trunk, so every left chain root has a right root that is its mirror image. Fern alternates
//    single fronds — its rules do not call for pairs, and no mirror is asserted for it.
{
  for (const setId of ['canopy', 'spire']) {
    const skel = build({ ruleSet: setId });
    const roots = skel.bones.filter((x) => x.marker === 'L');
    const left = roots.filter((x) => x.side === 'L');
    const right = roots.filter((x) => x.side === 'R');
    assert.equal(left.length, right.length, `${setId}: paired roots balance`);
    assert.ok(left.length > 0, `${setId}: pairs grew`);
    for (const l of left) {
      const mirror = right.find(
        (r) =>
          Math.abs(r.base.x + l.base.x) < 1e-9 &&
          Math.abs(r.base.y - l.base.y) < 1e-9 &&
          Math.abs(r.tip.x + l.tip.x) < 1e-9 &&
          Math.abs(r.tip.y - l.tip.y) < 1e-9 &&
          r.length === l.length,
      );
      assert.ok(mirror, `${setId}: ${l.id} has an exact mirror root`);
    }
  }
  assert.equal(LSYSTEM_RULE_SETS.find((s) => s.id === 'fern').paired, false, 'fern claims no pairs');
}

// 4. Bounded and total: hostile grammars truncate deterministically instead of hanging or throwing.
{
  const doubler = { id: 'doubler', axiom: 'X', rules: { X: 'XXXXXXXXXXXX' } };
  assert.equal(
    expandLSystem(doubler, LSYSTEM_CAPS.generations).length,
    LSYSTEM_CAPS.stringLength,
    'expansion slices at the cap',
  );
  const thicket = buildTreeSkeleton({
    seed: 1,
    creatureId: 'e',
    ruleSet: { id: 'thicket', axiom: 'F', rules: { F: 'FF[+F][-F]' } },
    pose: { generations: 99 },
  });
  assert.equal(thicket.bones.length, LSYSTEM_CAPS.bones, 'the turtle stops at the bone cap');
  const vanished = buildTreeSkeleton({
    seed: 1,
    creatureId: 'e',
    ruleSet: { id: 'void', axiom: 'X', rules: { X: '' } },
  });
  assert.equal(vanished.bones.length, 0, 'a grammar that erases itself grows nothing — and returns');
  assert.equal(vanished.headBone, null);
  const lopsided = buildTreeSkeleton({ seed: 1, creatureId: 'e', ruleSet: { id: 'lop', axiom: 'F]F[', rules: {} } });
  assert.equal(lopsided.bones.length, 2, 'unbalanced brackets are ignored, never fatal');
}

// 5. Sprouting (ruling 4): the amount is a pure function of the counted frame index, and the sprout
//    sequence — posed at counted frames — hashes identically on an independent regrow.
{
  assert.equal(SPROUT_FRAMES, 120);
  assert.equal(sproutAmount(0), 0);
  assert.equal(sproutAmount(SPROUT_FRAMES), 1);
  assert.equal(sproutAmount(SPROUT_FRAMES * 10), 1, 'the amount saturates; frames past full growth change nothing');
  assert.equal(sproutAmount(-5), 0, 'frames before the birth are the seed');
  let prev = -1;
  for (let f = 0; f <= SPROUT_FRAMES; f += 7) {
    const a = sproutAmount(f);
    assert.ok(a >= prev, 'the amount never retreats');
    prev = a;
  }

  const frames = [0, 15, 30, 60, 120, 300];
  const GOLDEN_SPROUT = ['e3ab9562', '0ff03aa3', '08320552', '1eeb773e', '83e330fb', '83e330fb'];
  const seqA = frames.map((f) => growTreeSkeleton(build(), sproutAmount(f)).hash);
  const seqB = frames.map((f) => growTreeSkeleton(build(), sproutAmount(f)).hash);
  assert.deepEqual(seqA, GOLDEN_SPROUT, 'golden: the sprout sequence at counted frames');
  assert.deepEqual(seqB, seqA, 'an independent regrow sprouts identically');

  const skel = build();
  assert.ok(
    growTreeSkeleton(skel, 0).bones.every((x) => x.length === 0),
    'amount 0: nothing has length yet',
  );
  assert.equal(growTreeSkeleton(skel, 1).hash, skel.hash, 'amount 1: the grown tree itself');
  const quarter = growTreeSkeleton(skel, 0.25);
  assert.ok(Math.abs(quarter.bones[0].length - skel.bones[0].length) < 1e-9, 'the first bone completes first');
  assert.equal(quarter.bones[quarter.bones.length - 1].length, 0, 'the last bone has not started at quarter growth');
}

// 6. Prune is a pose (the Tighten rule): the grown structure is never mutated — its hash is band-invariant
//    — while the posed copy sheds branch length monotonically, twigs first, the trunk never.
{
  const skel = build();
  const snapshot = JSON.stringify(skel);
  const bands = [0, 0.25, 0.5, 0.75, 1];
  const branchTotals = bands.map((band) =>
    pruneTreeSkeleton(skel, band)
      .bones.filter((x) => x.chain !== null)
      .reduce((sum, x) => sum + x.length, 0),
  );
  const trunkTotals = bands.map((band) =>
    pruneTreeSkeleton(skel, band)
      .bones.filter((x) => x.chain === null)
      .reduce((sum, x) => sum + x.length, 0),
  );
  for (let i = 1; i < bands.length; i++)
    assert.ok(branchTotals[i] < branchTotals[i - 1], 'branch length only ever sheds as band rises');
  for (const t of trunkTotals) assert.equal(t, trunkTotals[0], 'the trunk is never pruned');
  assert.equal(pruneTreeSkeleton(skel, 0).hash, skel.hash, 'band 0 is the grown tree');
  assert.equal(JSON.stringify(skel), snapshot, 'posing never mutates the grown tree');
  assert.equal(skel.hash, '83e330fb', 'the grown hash is band-invariant');
  // generation depth, re-derived here from the parent chain: the deepest twigs collapse at full Tighten,
  // the first-generation roots only shorten
  const byIdMap = new Map(skel.bones.map((x) => [x.id, x]));
  const depthOf = (bone) => {
    let d = 0;
    let cur = bone;
    while (cur.parent) {
      const p = byIdMap.get(cur.parent);
      if (p.chain !== cur.chain) d++;
      cur = p;
    }
    return d;
  };
  const maxDepth = Math.max(...skel.bones.map(depthOf));
  const pruned = pruneTreeSkeleton(skel, 1);
  for (const bone of pruned.bones) {
    if (bone.chain === null) continue;
    if (depthOf(bone) === maxDepth) assert.ok(bone.length < 1e-9, 'the outermost twigs collapse at full Tighten');
    if (depthOf(bone) === 1)
      assert.ok(bone.length > 0.25 * byIdMap.get(bone.id).length, 'first-generation limbs shorten, they do not vanish');
  }
  // growth and prune compose in one pose, identically to posing twice
  assert.equal(
    poseTreeSkeleton(skel, { growth: 0.5, band: 0.5 }).hash,
    pruneTreeSkeleton(growTreeSkeleton(skel, 0.5), 0.5).hash,
    'one composed pose == grow, then prune',
  );
}

// 7. The tree plugs into S1's placement unchanged: transformSkeleton moves it like any skeleton.
{
  const skel = build();
  const moved = transformSkeleton(skel, { x: 500, y: 350, scale: 2 });
  assert.ok(
    moved.bones.every((x) => Number.isFinite(x.base.x + x.tip.y)),
    'placed bones are finite',
  );
  assert.deepEqual(moved.bones[0].base, { x: 500, y: 350 + 100 }, 'the root lands on the pin, scaled');
  assert.notEqual(moved.hash, skel.hash);
}

// 8. The determinism guard, in skeleton.selfcheck's pattern: lsystem.js carries no banned clocks or
//    unseeded chance in its code (comments stripped first, exactly as the guard strips them).
{
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'lsystem.js'), 'utf8');
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const code = noBlock
    .split('\n')
    .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
    .join('\n');
  for (const banned of ['Math.random', 'Date.now', 'performance.now']) {
    assert.ok(!code.includes(banned), `lsystem.js must not use ${banned} — seeded kernel channels only`);
  }
}

console.log(
  'lsystem.selfcheck: OK (determinism + goldens, shape, mirror discipline, caps, sprout, prune-as-pose, placement, guard)',
);
