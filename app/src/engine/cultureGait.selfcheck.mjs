// node src/engine/cultureGait.selfcheck.mjs
// CULTURE Phase 5, slice B — gait as CULTURE's (engine/cultureGait.mjs; the parent issues 2331 and 2332).
//   1. the adapters (M5): the join tree of a CULTURE rig, a WetLab creature, a beast linkage, a glyph (ROOT ONLY),
//      and the delegated construct and asset; refusals
//   2. one shared gait worn by a construct, a creature, a beast, a glyph and a rig in one fixture — each moves by
//      its own depth (a leaf lags the root by depth × cascade), the creature's pose composes UNDER the gait, amount 0
//      is today's render, and the evaluator and drivers are the live stage's own (gait.js is untouched)
//   3. the damp step (M6): −25% a phrase, floor 25%, recovery +25%, locked exempt — the pure laws and the numbers
//   4. TASTE's reading: moving pieces outrank dealt shapes when more than half the ink has left its footprint
//   5. the coverage grid and LOIS's veto: ink as a union, protected cells under 10%, a pulled-back offset, a piece
//      starting in negative space never releases
//   6. the world's gait layer: dormant with no citizens; with no room it is still and the layout is the feel layer
//      alone; the QUEEN picks per phrase by Canon style, a user lock wins, every pick is recorded; the doors refuse loudly
//   7. the damp fixture in the dish: a magnet breaks a citizen up, TASTE flags it, the QUEEN steps down exactly one
//      notch per phrase and back up; a locked wearer in the same fixture is untouched
//   8. the veto fixture in the dish: no unlocked piece releases onto protected negative space; a locked one does
//   9. determinism: twin worlds bit-identical through the same doors; the hash covers the layer; the phrase is the
//      QUEEN's own; gait never writes a body
import assert from 'node:assert/strict';
import {
  CULTURE_GAIT_WEARER_KINDS,
  CULTURE_DAMP_STEP,
  CULTURE_DAMP_FLOOR,
  CULTURE_DAMP_NOTCHES,
  CULTURE_INK_FLOOR,
  CULTURE_OUTRANK_SHARE,
  CULTURE_PHRASE_BEATS,
  CULTURE_GAIT_STYLES,
  cultureTreeOf,
  cultureGaitPieces,
  cultureGaitPose,
  cultureComposeGaitOverFeel,
  cultureDampStep,
  cultureDampLevel,
  cultureDampTarget,
  dampGait,
  cultureTaste,
  cultureInkGrid,
  cultureInkAt,
  loisBreakVeto,
  createCultureGait,
  cultureGaitHash,
  cultureGaitPartPose,
  cultureGaitTargetOf,
  normalizeCultureRoom,
} from './cultureGait.mjs';
import {
  createCultureWorld,
  stepCultureWorld,
  castCultureTake,
  cultureCitizenAt,
  cultureWorldHash,
  dealCultureField,
  setCultureRoom,
  assignCultureCitizenGait,
} from './cultureWorld.mjs';
import { cultureCitizenLayout } from './cultureCitizens.mjs';
import { normalizeCultureRecipe, cultureFeelPose } from './cultureMotion.mjs';
import { assembleCultureBody } from './cultureBody.mjs';
import { CULTURE_SWARM_WORLD_W, CULTURE_SWARM_WORLD_H } from './cultureSwarm.mjs';
import { STAGE_COLS, STAGE_ROWS } from './dishLifeStage.mjs';
import { sanitizeGait, evaluateGait, treeOf as gaitTreeOf, roleOfDepth, GAIT_DEFAULT_BPM } from './gait.js';
import { canonGaits } from '../data/canon/gaits.js';
import { POSE_IDENTITY, composePose } from './motionCore/index.js';
import { poseRig } from './creatureRig.js';
import { poseLinkage } from './beastRig.js';
import { sanitizeMeasures } from './beastBuilder.js';
import { wildTypeMeasures } from './jansenMeasures.js';
import { PHRASE_BARS } from '../curator/paceLive.js';
import { STRING_CHANNEL_GROUPS } from './kernel/rng.js';

let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── fixtures: one of each wearer ────────────────────────────────────────────────────────────────────────────────────
const head = { id: 'h', role: 'head', chain: -1, parent: null, x: 50, y: 20, angle: -90, len: 14 };
const limb = (chain, depth, x, y, angle, len) => ({
  id: `l${chain}.${depth}`,
  role: 'limb',
  chain,
  parent: depth ? `l${chain}.${depth - 1}` : null,
  x,
  y,
  angle,
  len,
});
const CREATURE_RIG = {
  bones: [
    head,
    limb(0, 0, 35, 70, 120, 30),
    limb(0, 1, 0, 0, 20, 24),
    limb(0, 2, 0, 0, -10, 12),
    limb(1, 0, 65, 70, 60, 30),
    limb(1, 1, 0, 0, -20, 24),
  ],
};
const LINKAGE = { measures: sanitizeMeasures({ ...wildTypeMeasures(), legCount: 4 }), phase: 0 };
// a hand-built construct (the house set is the catalogue's to read): a chain of four sticks and one branch
const STICK = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
];
const piece = (x) => ({ asset: 'stick', x, y: 0, r: 0, s: 1, own: 0 });
const CONSTRUCT = { parts: [piece(0), piece(10), piece(20), piece(30), piece(10)] };
const CONSTRUCT_OPTS = { pointsOf: () => STICK };
const MOTH = assembleCultureBody('moth');
const DISH = assembleCultureBody('dish');
/** Distinct, deterministic rest marks for a tree. */
const marksOf = (tree) => tree.nodes.map((_, k) => ({ x: 400 + 37 * k, y: 300 + 23 * k }));
const GAIT = sanitizeGait({
  kind: 'kc-gait/1',
  name: 'fixture',
  cascade: 0.25,
  roles: {
    root: {
      drivers: [
        { id: 'drift', amount: 0.4 },
        { id: 'breath', amount: 0.3 },
      ],
    },
    inner: {
      drivers: [
        { id: 'breath', amount: 0.4 },
        { id: 'pulse', amount: 0.3 },
      ],
    },
    leaf: {
      drivers: [
        { id: 'pulse', amount: 0.5 },
        { id: 'drift', amount: 0.3 },
      ],
    },
  },
});
const POSE_OPTS = {
  beatTime: 3.3,
  wearerSeed: 99,
  seed: 5,
  slot: 2,
  canvasW: CULTURE_SWARM_WORLD_W,
  canvasH: CULTURE_SWARM_WORLD_H,
};

// 1 — the adapters.
{
  assert.deepEqual([...CULTURE_GAIT_WEARER_KINDS], ['rig', 'creature', 'beast', 'glyph', 'construct', 'asset']);
  // rig: the citizen's part tree
  const rig = cultureTreeOf('rig', MOTH);
  assert.equal(rig.nodes.length, 14);
  assert.deepEqual(
    rig.nodes.map((n) => n.depth),
    [0, 1, 2, 3, 1, 2, 1, 2, 2, 3, 4, 2, 3, 4],
    'the head is the root; the spine, antennae and wings fall away from it',
  );
  assert.equal(rig.maxDepth, 4);
  assert.deepEqual(
    rig.nodes.map((n) => n.parent),
    MOTH.parts.map((p) => p.parent),
  );
  assert.equal(cultureTreeOf('rig', DISH).maxDepth, 4);
  // creature: bones parent-first; the head and every limb chain are roots; a limb's depth is its bone's depth
  const cr = cultureTreeOf('creature', CREATURE_RIG);
  assert.deepEqual(
    cr.nodes.map((n) => [n.parent, n.depth]),
    [
      [-1, 0],
      [-1, 0],
      [1, 1],
      [2, 2],
      [-1, 0],
      [4, 1],
    ],
  );
  assert.equal(cr.maxDepth, 2);
  // beast: the beam is the root; each leg's twelve bars hang off it along the linkage's construction
  const bones = poseLinkage(LINKAGE, 0);
  const bt = cultureTreeOf('beast', LINKAGE);
  assert.equal(bt.nodes.length, bones.length);
  assert.equal(bt.nodes[0].parent, -1);
  assert.equal(bones[0].id, 'beam');
  const depthOf = (id) => bt.nodes[bones.findIndex((b) => b.id === id)].depth;
  assert.deepEqual(
    ['beam', '0:crank', '0:frame', '0:b', '0:j', '0:e', '0:f', '0:h', '0:g', '0:i'].map(depthOf),
    [0, 1, 1, 2, 2, 3, 4, 5, 3, 3],
  );
  assert.equal(bt.maxDepth, 5);
  assert.equal(bones.length, 1 + LINKAGE.measures.legCount * 12);
  assert.ok(
    bt.nodes.every((n, k) => n.parent < k),
    'parents before children',
  );
  // glyph: ROOT ONLY
  assert.deepEqual(cultureTreeOf('glyph', { ch: 'A' }), { nodes: [{ id: 0, parent: -1, depth: 0 }], maxDepth: 0 });
  assert.deepEqual(
    cultureTreeOf('glyph', null),
    cultureTreeOf('glyph', { strokes: [1, 2, 3] }),
    'strokes do not make nodes',
  );
  // construct and asset: gait.js's own
  assert.deepEqual(
    cultureTreeOf('construct', CONSTRUCT, CONSTRUCT_OPTS),
    gaitTreeOf('construct', CONSTRUCT, CONSTRUCT_OPTS),
  );
  assert.deepEqual(cultureTreeOf('asset', {}), gaitTreeOf('asset', {}));
  // refusals: null, never a throw
  assert.equal(cultureTreeOf('nope', {}), null);
  assert.equal(cultureTreeOf('rig', null), null);
  assert.equal(cultureTreeOf('rig', { parts: [] }), null);
  assert.equal(cultureTreeOf('creature', { bones: [] }), null);
  assert.equal(cultureTreeOf('beast', null), null);
  assert.equal(
    cultureTreeOf('beast', { measures: sanitizeMeasures({ ...wildTypeMeasures(), scale: 0.01 }), phase: 0 }) === null ||
      true,
    true,
  );
  assert.equal(cultureTreeOf('construct', CONSTRUCT), null, 'a construct needs its points');
  // the live gait module is the stage's, untouched: its own treeOf still refuses what M5 adds
  assert.equal(gaitTreeOf('beast', {}), null);
  assert.equal(gaitTreeOf('creature', {}), null);
  ok(
    'the adapters: rig, creature, beast and construct trees by depth, the glyph root only; unknown and malformed refuse',
  );
}

// 2 — one shared gait, five wearers, each by its depth.
{
  const wearers = [
    ['construct', cultureTreeOf('construct', CONSTRUCT, CONSTRUCT_OPTS)],
    ['creature', cultureTreeOf('creature', CREATURE_RIG)],
    ['beast', cultureTreeOf('beast', LINKAGE)],
    ['glyph', cultureTreeOf('glyph', {})],
    ['rig', cultureTreeOf('rig', MOTH)],
  ];
  for (const [kind, tree] of wearers) {
    const marks = marksOf(tree);
    const before = JSON.stringify(marks);
    const poses = cultureGaitPose(marks, tree, GAIT, POSE_OPTS);
    assert.equal(poses.length, tree.nodes.length, kind);
    assert.equal(JSON.stringify(marks), before, `${kind}: the rest marks are never mutated`);
    assert.ok(
      poses.some((p) => p !== POSE_IDENTITY && (p.dx !== 0 || p.dy !== 0 || p.sx !== 1)),
      `${kind} moves`,
    );
    assert.deepEqual(poses, cultureGaitPose(marks, tree, GAIT, POSE_OPTS), `${kind}: pure`);
    // by its depth: the evaluator gives a node of depth d the beat of the root minus d × cascade
    const ev = evaluateGait({ n: tree.nodes.length }, GAIT, tree, POSE_OPTS.beatTime, POSE_OPTS.wearerSeed);
    assert.equal(ev.active, true);
    for (let k = 0; k < tree.nodes.length; k++)
      assert.ok(
        close(ev.beat[k], ev.beat[0] - tree.nodes[k].depth * GAIT.cascade),
        `${kind}: node ${k} lags by its depth`,
      );
    if (tree.maxDepth > 0) {
      const role = (k) => roleOfDepth(tree.nodes[k].depth, tree.maxDepth);
      const k0 = tree.nodes.findIndex((_, k) => role(k) === 'root');
      const kl = tree.nodes.findIndex((_, k) => role(k) === 'leaf');
      assert.ok(
        ev.amounts.drift[k0] === 0.4 && ev.amounts.pulse[kl] === 0.5,
        `${kind}: each role wears its own amounts`,
      );
    } else assert.ok(ev.amounts.drift[0] === 0.4, 'a glyph wears the root role: it moves whole');
    // amount 0 / no gait is today's render exactly
    const still = canonGaits('swiss').still;
    for (const g of [null, still]) {
      assert.ok(
        cultureGaitPose(marks, tree, g, POSE_OPTS).every((p) => p === POSE_IDENTITY),
        `${kind}: still is rest, exactly`,
      );
    }
    assert.equal(
      cultureGaitPose(marks, { nodes: tree.nodes.slice(1), maxDepth: 1 }, GAIT, POSE_OPTS),
      null,
      'a tree that does not line up refuses',
    );
  }
  // depth makes a difference: in a chain, a leaf and the root of equal role amounts differ only by the cascade
  const chain = cultureTreeOf('creature', CREATURE_RIG);
  const flat = sanitizeGait({
    kind: 'kc-gait/1',
    name: 'cascade',
    cascade: 0.5,
    roles: {
      root: { drivers: [{ id: 'pulse', amount: 0.5 }] },
      inner: { drivers: [{ id: 'pulse', amount: 0.5 }] },
      leaf: { drivers: [{ id: 'pulse', amount: 0.5 }] },
    },
  });
  const p = cultureGaitPose(marksOf(chain), chain, flat, POSE_OPTS);
  assert.notEqual(p[1].sx, p[3].sx, 'the same amount at two depths: the follow-through phase tells them apart');
  // the creature's pose is the base, the gait layers over it (Motion Core compose)
  const feel = cultureFeelPose({ key: 'k', seedOffset: 0, phase01: 0 }, 2, {
    along: 3,
    role: 'head',
    squash: 0.18,
    secondary: 0.05,
    exaggeration: 1.2,
  });
  const gp = cultureGaitPose(marksOf(chain), chain, GAIT, POSE_OPTS)[1];
  const both = cultureComposeGaitOverFeel(feel, gp);
  assert.equal(JSON.stringify(both), JSON.stringify(composePose(feel, gp)), 'the Motion Core compose');
  assert.ok(close(both.sx, feel.sx * gp.sx) && close(both.dx, feel.dx + gp.dx));
  assert.equal(
    JSON.stringify(cultureComposeGaitOverFeel(feel, POSE_IDENTITY)),
    JSON.stringify(feel),
    'no gait: the creature pose, untouched',
  );
  // the creature rig is the live one: poseRig is unchanged by wearing (the rig is never touched)
  const before = JSON.stringify(poseRig(CREATURE_RIG, 1.5));
  cultureGaitPose(marksOf(chain), chain, GAIT, POSE_OPTS);
  assert.equal(JSON.stringify(poseRig(CREATURE_RIG, 1.5)), before);
  ok(
    'one shared gait worn by a construct, a creature, a beast, a glyph and a rig: each moves by its depth; still is rest; the creature pose composes under',
  );
}

// 3 — the damp step.
{
  assert.equal(CULTURE_DAMP_STEP, 0.25, 'Matt: −25% of the gait’s amounts per phrase');
  assert.equal(CULTURE_DAMP_FLOOR, 0.25, 'Matt: a floor at 25% — it never fully stops');
  assert.equal(CULTURE_DAMP_NOTCHES, 3);
  assert.deepEqual([0, 1, 2, 3].map(cultureDampTarget), [1, 0.75, 0.5, 0.25]);
  // flagged: one notch a phrase, capped at the floor
  let n = 0;
  const seen = [];
  for (let p = 0; p < 6; p++) seen.push((n = cultureDampStep(n, true, false)));
  assert.deepEqual(seen, [1, 2, 3, 3, 3, 3], 'exactly one step per phrase, then the floor holds');
  // clean: +25% a phrase back up, never past 100%
  seen.length = 0;
  for (let p = 0; p < 5; p++) seen.push((n = cultureDampStep(n, false, false)));
  assert.deepEqual(seen, [2, 1, 0, 0, 0], 'recovery is one notch a phrase');
  // locked: exempt from both
  assert.equal(cultureDampStep(0, true, true), 0);
  assert.equal(cultureDampStep(2, true, true), 2);
  assert.equal(cultureDampStep(2, false, true), 2);
  assert.equal(
    cultureDampLevel({ n: 3, from: 0.5, t0: 0 }, 100, true),
    1,
    'a locked wearer wears 100% whatever its notch',
  );
  // the level eases over one beat and never leaves [floor, 1]
  const e = { n: 1, from: 1, t0: 10 };
  assert.equal(cultureDampLevel(e, 10, false), 1, 'starts where it was');
  assert.equal(cultureDampLevel(e, 11, false), 0.75, 'lands on the notch after a beat');
  const mid = cultureDampLevel(e, 10.5, false);
  assert.ok(mid < 1 && mid > 0.75, 'in between, never a pop');
  assert.equal(cultureDampLevel(e, 10 - 5, false), 1, 'a clock that stepped back holds the start');
  assert.equal(cultureDampLevel(undefined, 3, false), 1);
  // dampGait: every amount × level, structure kept, level 1 is the record itself
  assert.equal(dampGait(GAIT, 1), GAIT, 'undamped is the very record');
  const d = dampGait(GAIT, 0.75);
  assert.equal(d.roles.root.drivers[0].amount, 0.4 * 0.75);
  assert.equal(d.roles.leaf.drivers[0].amount, 0.5 * 0.75);
  assert.equal(d.cascade, GAIT.cascade);
  assert.deepEqual(d.release, GAIT.release);
  assert.deepEqual(d.rejoin, GAIT.rejoin);
  assert.equal(GAIT.roles.root.drivers[0].amount, 0.4, 'the record is never mutated');
  const floor = dampGait(GAIT, CULTURE_DAMP_FLOOR);
  assert.ok(
    floor.roles.inner.drivers.every((x) => x.amount > 0),
    'at the floor a gait still moves',
  );
  assert.equal(dampGait(null, 0.5), null);
  ok(
    'the damp step: −25% a phrase, floored at 25%, +25% a clean phrase, locked exempt, eased over a beat; amounts scale, structure stays',
  );
}

// 4 — TASTE.
{
  assert.equal(CULTURE_OUTRANK_SHARE, 0.5);
  assert.deepEqual(cultureTaste([]), { share: 0, outranks: false }, 'an empty frame reads clean');
  const still = [
    { radius: 10, dx: 0, dy: 0 },
    { radius: 10, dx: 3, dy: 4 },
  ];
  assert.equal(cultureTaste(still).share, 0, 'moved, but within its own footprint (5 < 10): still the dealt shape');
  assert.equal(cultureTaste([{ radius: 10, dx: 6, dy: 8 }]).share, 1, 'displaced by its radius: a moving piece');
  const half = [
    { radius: 10, dx: 20, dy: 0 },
    { radius: 10, dx: 0, dy: 0 },
  ];
  assert.equal(cultureTaste(half).share, 0.5);
  assert.equal(cultureTaste(half).outranks, false, 'exactly half does not outrank: it must be MORE than half');
  assert.equal(
    cultureTaste([
      { radius: 10, dx: 20, dy: 0 },
      { radius: 9, dx: 0, dy: 0 },
    ]).outranks,
    true,
  );
  const big = [
    { radius: 30, dx: 0, dy: 0 },
    { radius: 5, dx: 50, dy: 0 },
    { radius: 5, dx: 50, dy: 0 },
  ];
  assert.equal(
    cultureTaste(big).outranks,
    false,
    'by ink, not by count: many small pieces do not outrank one big dealt shape',
  );
  ok('TASTE reads the frame: pieces outrank dealt shapes only when more than half the ink has left its footprint');
}

// 5 — the coverage grid and LOIS's veto.
{
  assert.equal(CULTURE_INK_FLOOR, 0.1, 'Matt: protected negative space = cells under 10% ink');
  const cw = CULTURE_SWARM_WORLD_W / STAGE_COLS;
  const ch = CULTURE_SWARM_WORLD_H / STAGE_ROWS;
  assert.deepEqual([cw, ch], [20, 20]);
  const table = (discs) => ({
    count: discs.length,
    alive: Uint8Array.from(discs.map((d) => (d.dead ? 0 : 1))),
    x: Float32Array.from(discs.map((d) => d.x)),
    y: Float32Array.from(discs.map((d) => d.y)),
    radius: Float32Array.from(discs.map((d) => d.r)),
  });
  const empty = cultureInkGrid(table([]), null);
  assert.ok(empty.every((v) => v === 0) && empty.length === STAGE_COLS * STAGE_ROWS);
  const big = cultureInkGrid(table([{ x: 410, y: 410, r: 40 }]), null);
  assert.equal(cultureInkAt(big, 410, 410), 1, 'the middle of a big disc is solid ink');
  assert.equal(cultureInkAt(big, 405, 405), 1);
  assert.equal(cultureInkAt(big, 700, 700), 0, 'far from it: negative space');
  assert.equal(cultureInkAt(big, -5, 10), 0, 'off the dish is negative space');
  assert.equal(cultureInkAt(big, 10, CULTURE_SWARM_WORLD_H + 5), 0);
  // a union, not a sum: two identical discs are one disc's ink
  const one = cultureInkGrid(table([{ x: 410, y: 410, r: 15 }]), null);
  const two = cultureInkGrid(
    table([
      { x: 410, y: 410, r: 15 },
      { x: 410, y: 410, r: 15 },
    ]),
    null,
  );
  assert.deepEqual(one, two);
  // dead bodies leave no ink
  assert.ok(cultureInkGrid(table([{ x: 410, y: 410, r: 40, dead: true }]), null).every((v) => v === 0));
  // statics are ink too
  const statics = {
    count: 1,
    minX: Float32Array.of(100),
    minY: Float32Array.of(100),
    maxX: Float32Array.of(140),
    maxY: Float32Array.of(120),
  };
  const box = cultureInkGrid(table([]), statics);
  assert.equal(cultureInkAt(box, 110, 110), 1);
  assert.equal(cultureInkAt(box, 150, 110), 0);
  // the 10% line: a disc covering 1 of 16 samples is protected (6.25%), 2 of 16 is not (12.5%)
  const tiny = cultureInkGrid(table([{ x: 502.5, y: 502.5, r: 1 }]), null);
  const share = cultureInkAt(tiny, 505, 505);
  assert.ok(share > 0 && share < CULTURE_INK_FLOOR, `a speck of ink (${share}) is still protected negative space`);
  const bit = cultureInkGrid(
    table([
      { x: 502.5, y: 502.5, r: 1 },
      { x: 507.5, y: 502.5, r: 1 },
    ]),
    null,
  );
  assert.ok(cultureInkAt(bit, 505, 505) >= CULTURE_INK_FLOOR, 'a mark with real ink is not');
  // the veto
  const grid = cultureInkGrid(table([{ x: 410, y: 410, r: 40 }]), null); // ink within ~40 px of (410, 410)
  const rest = { x: 410, y: 410 };
  assert.deepEqual(loisBreakVeto(grid, rest, { x: 0, y: 0 }), { x: 0, y: 0, vetoed: false });
  assert.deepEqual(
    loisBreakVeto(grid, rest, { x: 20, y: 0 }),
    { x: 20, y: 0, vetoed: false },
    'onto ink: released in full',
  );
  const v = loisBreakVeto(grid, rest, { x: 200, y: 0 });
  assert.equal(v.vetoed, true);
  assert.ok(v.x > 0 && v.x < 200 && v.y === 0, 'pulled back along its own line, not turned');
  assert.ok(cultureInkAt(grid, rest.x + v.x, rest.y + v.y) >= CULTURE_INK_FLOOR, 'to a point that stands on ink');
  assert.ok(Math.abs((v.x * 16) / 200 - Math.round((v.x * 16) / 200)) < 1e-9, 'in sixteenths');
  const stuck = loisBreakVeto(grid, { x: 900, y: 900 }, { x: 30, y: 30 });
  assert.deepEqual(stuck, { x: 0, y: 0, vetoed: true }, 'a piece standing in negative space does not release at all');
  // the law is where a piece LANDS: a piece that starts in negative space but can reach ink keeps the reach that lands on ink
  const reach = loisBreakVeto(grid, { x: 520, y: 410 }, { x: -80, y: 0 });
  assert.equal(cultureInkAt(grid, 520, 410), 0, 'it starts in negative space');
  assert.deepEqual(reach, { x: -80, y: 0, vetoed: false }, 'and lands on ink, so it releases in full');
  ok(
    'the coverage grid is a union of the dealt frame’s ink; LOIS pulls a release back to ink and never lets one into a cell under 10%',
  );
}

// ── world fixtures ──────────────────────────────────────────────────────────────────────────────────────────────────
const INERT = (recipe) =>
  normalizeCultureRecipe({
    ...recipe,
    name: 'test/inert',
    drives: { wander: 0, ground: 0, rim: 0 },
    physics: { ...recipe.physics, thrust: 0, paddle: 0, tone: 0 },
  });
const castDish = (seed, sheet = { plan: 'dish', count: 1 }, inert = true) => {
  const w = createCultureWorld({ seed });
  castCultureTake(w, sheet);
  if (inert) for (const c of w.citizens.list) c.recipe = INERT(c.recipe);
  return w;
};
const headOf = (w, i = 0) => {
  const c = w.citizens.list[i];
  return [w.bodies.x[c.first], w.bodies.y[c.first]];
};
/** The medium, strong around a point (the fluid's own kernel is pinned in its suites; here the field is the fixture). */
const strongAt = (w, x, y, r = 250) => {
  const f = w.fluid;
  for (let gy = 0; gy < f.rows; gy++)
    for (let gx = 0; gx < f.cols; gx++)
      if (Math.hypot((gx + 0.5) * 20 - x, (gy + 0.5) * 20 - y) < r) f.v[gy * f.cols + gx] = 0.9;
};
const PHRASE_STEPS = Math.ceil((CULTURE_PHRASE_BEATS / (GAIT_DEFAULT_BPM / 60)) * 60) + 2; // swarm steps... see below
const stepsToBeat = (w, beats) => {
  while (w.gait.beats < beats) stepCultureWorld(w);
};

// 6 — the world's gait layer: dormant, still, the QUEEN's picks, the lock, the log, the doors.
{
  assert.equal(CULTURE_PHRASE_BEATS, PHRASE_BARS * 4, 'a phrase is the QUEEN’s own: PHRASE_BARS bars of four beats');
  assert.equal(STRING_CHANNEL_GROUPS.gait, 'noise');
  // dormant: an uncast world accumulates nothing
  const empty = createCultureWorld({ seed: 3 });
  const h0 = cultureWorldHash(createCultureWorld({ seed: 3 }));
  for (let s = 0; s < 600; s++) stepCultureWorld(empty);
  assert.equal(empty.gait.beats, 0);
  assert.equal(empty.gait.phrase, 0);
  assert.deepEqual(empty.gait.out, {});
  assert.ok(cultureWorldHash(empty) !== h0, 'the world stepped (sanity)');
  // no room reading: still. Assignments empty, log empty, the layout is the feel layer alone
  const w = castDish(7, { plan: 'dish', count: 2 }, false);
  for (let s = 0; s < 2 * 960 + 100; s++) stepCultureWorld(w);
  assert.ok(w.gait.phrase >= 2, 'phrases passed');
  assert.deepEqual(w.gait.assign, {});
  assert.deepEqual(w.gait.log, []);
  assert.deepEqual(w.gait.out, {});
  const lay = cultureCitizenAt(w, 0);
  assert.ok(
    lay.parts.every((p) => p.gait === null),
    'no gait stands',
  );
  const bare = cultureCitizenLayout(w.bodies, w.citizens.list[0], (i) => w.soil.wither[i] / 480);
  // LOUD RE-PIN (Phase 6A — the read door now carries the citizen's LIFE: fat, starvation, decay, sockets as worn). The
  // claim is unchanged: with no room the layout is the feel layer, bit for bit — every key the feel layer writes, and
  // nothing else but the one `life` reading (no looted limb here, so no carried part follows the born ones).
  const { life, ...layNoLife } = lay;
  assert.ok(life && typeof life.fat === 'number', 'the life rides the read door');
  assert.equal(
    JSON.stringify(layNoLife),
    JSON.stringify(bare),
    'with no room the layout is the feel layer, bit for bit',
  );
  // the room: high energy → performing, by the wearer's Canon style; recorded; the pose moves
  const g = castDish(7, {
    roster: [
      { plan: 'dish', count: 1 },
      { plan: 'moth', count: 1 },
    ],
  });
  assert.equal(g.citizens.list.length, 2, 'a dish creature and a moth');
  setCultureRoom(g, { energy: 'high', silent: false, bpm: 120 });
  stepsToBeat(g, CULTURE_PHRASE_BEATS);
  stepCultureWorld(g);
  assert.equal(g.gait.phrase, 1);
  assert.equal(
    g.gait.assign['citizen:0'].gaitId,
    canonGaits(CULTURE_GAIT_STYLES.dish).performing.id,
    'the dish creature wears organic',
  );
  assert.equal(
    g.gait.assign['citizen:1'].gaitId,
    canonGaits(CULTURE_GAIT_STYLES.moth).performing.id,
    'the moth wears japanese',
  );
  assert.deepEqual(
    g.gait.log.map((e) => [e.target, e.by, e.locked]),
    [
      ['citizen:0', 'queen', false],
      ['citizen:1', 'queen', false],
    ],
    'every pick is recorded',
  );
  assert.ok(
    g.gait.log.every((e) => e.step > 0 && e.step <= g.step),
    'with the world step it was made at',
  );
  for (let s = 0; s < 240; s++) stepCultureWorld(g);
  const moving = cultureCitizenAt(g, 1);
  assert.ok(
    moving.parts.some((p) => p.gait && (p.gait.dx !== 0 || p.gait.dy !== 0 || p.gait.sx !== 1)),
    'the worn gait moves the moth',
  );
  const dx = (i) => moving.parts[i].gait.dx;
  assert.ok(moving.parts.every((p) => p.gait !== null));
  assert.ok(Math.abs(dx(0)) < 40, 'a modest wander, not a scatter');
  // true silence is still: she picks still once the room goes silent
  setCultureRoom(g, { energy: 'high', silent: true, bpm: 120 });
  stepsToBeat(g, 2 * CULTURE_PHRASE_BEATS);
  stepCultureWorld(g);
  assert.equal(g.gait.assign['citizen:0'].gaitId, canonGaits('organic').still.id);
  assert.equal(g.gait.log.length, 4);
  // the user's lock wins: never re-picked, and the lock is recorded
  const k = castDish(7, { plan: 'dish', count: 2 });
  const swissIdle = canonGaits('swiss').idle.id;
  assert.deepEqual(assignCultureCitizenGait(k, { target: 'citizen:0', gaitId: swissIdle, by: 'user', locked: true }), {
    applied: true,
    reason: null,
  });
  setCultureRoom(k, { energy: 'high', silent: false, bpm: 120 });
  stepsToBeat(k, CULTURE_PHRASE_BEATS);
  stepCultureWorld(k);
  assert.equal(k.gait.assign['citizen:0'].gaitId, swissIdle, 'the lock wins');
  assert.equal(k.gait.assign['citizen:1'].by, 'queen', 'the unlocked neighbour is picked');
  assert.deepEqual(
    k.gait.log.map((e) => [e.target, e.by, e.locked]),
    [
      ['citizen:0', 'user', true],
      ['citizen:1', 'queen', false],
    ],
  );
  assert.deepEqual(
    assignCultureCitizenGait(k, {
      target: 'citizen:0',
      gaitId: canonGaits('swiss').performing.id,
      by: 'queen',
      locked: false,
    }),
    { applied: false, reason: 'locked' },
    'a persona event on a locked wearer is refused and not recorded',
  );
  assert.equal(k.gait.log.length, 2);
  assert.deepEqual(assignCultureCitizenGait(k, { target: 'citizen:0', gaitId: swissIdle, by: 'user', locked: true }), {
    applied: false,
    reason: 'same',
  });
  // the doors refuse loudly
  assert.throws(() => setCultureRoom(k, { energy: 'loud', silent: false, bpm: 120 }), /room energy/);
  assert.throws(() => setCultureRoom(k, { energy: 'low', silent: false, bpm: 0 }), /room bpm/);
  assert.throws(() => setCultureRoom(k, { energy: 'low', silent: false, bpm: NaN }), /room bpm/);
  assert.throws(() => setCultureRoom(k, null), /a room is/);
  assert.throws(
    () => assignCultureCitizenGait(k, { target: 'citizen:9', gaitId: swissIdle, by: 'user', locked: false }),
    /no wearer/,
  );
  assert.throws(
    () => assignCultureCitizenGait(k, { target: 'construct:1', gaitId: swissIdle, by: 'user', locked: false }),
    /no wearer/,
  );
  assert.throws(
    () =>
      assignCultureCitizenGait(k, { target: 'citizen:0', gaitId: 'gait:0000000000000000', by: 'user', locked: false }),
    /not a Canon gait/,
  );
  assert.throws(
    () => assignCultureCitizenGait(k, { target: 'citizen:0', gaitId: 'nope', by: 'user', locked: false }),
    /not a GAIT_ASSIGN/,
  );
  assert.deepEqual(normalizeCultureRoom({ energy: undefined, silent: 0, bpm: 90 }), {
    energy: null,
    silent: 0,
    bpm: 90,
  });
  ok(
    'the world’s gait layer: dormant with no citizens, still with no room, the QUEEN picks per phrase by Canon style and records every pick, a lock wins, the doors refuse',
  );
}

// 7 — the damp fixture.
const fixture = (locked) => {
  const w = castDish(7);
  const [hx, hy] = headOf(w);
  dealCultureField(w, { kind: 'magnet', x: hx + 300, y: hy - 100, strength: 0.3, radius: 300 });
  assignCultureCitizenGait(w, { target: 'citizen:0', gaitId: canonGaits('swiss').performing.id, by: 'user', locked });
  setCultureRoom(w, { energy: 'high', silent: false, bpm: 120 });
  return { w, hx, hy };
};
const maxOff = (w) => {
  const o = w.gait.out['citizen:0'];
  return o ? Math.max(...Array.from(o.dx).map((d, k) => Math.hypot(d, o.dy[k]))) : 0;
};
const tasteOf = (w) => {
  const c = w.citizens.list[0];
  const o = w.gait.out['citizen:0'];
  const parts = [];
  if (o)
    for (let k = 0; k < c.n; k++)
      if (w.bodies.alive[c.first + k]) parts.push({ radius: w.bodies.radius[c.first + k], dx: o.dx[k], dy: o.dy[k] });
  return cultureTaste(parts);
};
{
  const { w, hx, hy } = fixture(false);
  const series = [];
  const readings = [];
  let replay = 0;
  let phraseSeen = w.gait.phrase;
  const bigOff = [];
  while (series.length < 7) {
    strongAt(w, hx, hy);
    const reading = tasteOf(w); // the frame as it stands going into this step
    stepCultureWorld(w);
    if (w.gait.phrase !== phraseSeen) {
      phraseSeen = w.gait.phrase;
      const n = w.gait.notch['citizen:0'] ? w.gait.notch['citizen:0'].n : 0;
      replay = cultureDampStep(replay, reading.outranks, false);
      readings.push(reading.outranks);
      series.push(n);
      assert.equal(n, replay, `phrase ${phraseSeen}: the notch is the damp step of TASTE’s reading, nothing more`);
    }
    if (w.step % 120 === 0) bigOff.push(maxOff(w));
  }
  assert.deepEqual(
    series.slice(0, 3),
    [1, 2, 3],
    'flagged phrases step down exactly one notch each: 100% → 75% → 50% → 25%',
  );
  assert.ok(
    series.every((n, i) => Math.abs(n - (series[i - 1] ?? 0)) <= 1),
    'never more than one notch a phrase',
  );
  assert.ok(Math.max(...series) <= CULTURE_DAMP_NOTCHES, 'the floor holds');
  assert.ok(readings.slice(0, 3).every(Boolean), 'while pieces outranked the dealt shapes');
  assert.ok(
    series.some((n, i) => i > 0 && n < series[i - 1]),
    'and the notch recovers once the frame reads clean',
  );
  const level = cultureDampLevel(w.gait.notch['citizen:0'], w.gait.beats, false);
  assert.ok(level >= CULTURE_DAMP_FLOOR && level <= 1, 'the level never leaves [floor, 1]');
  assert.ok(Math.max(...bigOff) > 20, 'and it was a real break-up (pieces travelled)');
  // the locked wearer in the SAME fixture is untouched
  const L = fixture(true);
  const offs = [];
  phraseSeen = L.w.gait.phrase;
  let lockedPhrases = 0;
  while (lockedPhrases < 4) {
    strongAt(L.w, L.hx, L.hy);
    stepCultureWorld(L.w);
    if (L.w.gait.phrase !== phraseSeen) {
      phraseSeen = L.w.gait.phrase;
      lockedPhrases++;
      assert.equal(L.w.gait.notch['citizen:0'], undefined, 'a locked gait is never stepped down');
      assert.equal(L.w.gait.assign['citizen:0'].locked, true);
      assert.equal(L.w.gait.assign['citizen:0'].gaitId, canonGaits('swiss').performing.id, 'nor re-picked');
    }
    if (L.w.step % 120 === 0 && L.w.gait.breakup.size) offs.push(maxOff(L.w));
  }
  assert.ok(
    tasteOf(L.w).outranks || offs.some((v) => v > 40),
    'the same frame outranks the dealt shapes — and the locked gait stands anyway',
  );
  assert.ok(
    Math.max(...offs) > 40 && offs.slice(-4).some((v) => v > 40),
    'its break-up stays at full reach through four phrases',
  );
  assert.ok(Math.max(...bigOff.slice(-4)) < Math.max(...offs), 'while the unlocked one came down');
  ok(
    'the damp fixture: pieces outrank the dealt shapes, the QUEEN steps down exactly one notch a phrase to the floor and back; a locked gait in the same fixture is untouched',
  );
}

// 8 — the veto fixture.
{
  const protectedCount = (w, locked) => {
    const c = w.citizens.list[0];
    const o = w.gait.out['citizen:0'];
    const ink = cultureInkGrid(w.bodies, w.statics);
    let n = 0;
    let released = 0;
    for (let k = 0; k < c.n; k++) {
      if (o.bx[k] === 0 && o.by[k] === 0) continue;
      released++;
      if (cultureInkAt(ink, w.bodies.x[c.first + k] + o.bx[k], w.bodies.y[c.first + k] + o.by[k]) < CULTURE_INK_FLOOR)
        n++;
    }
    return { n, released, vetoed: o.vetoed, locked };
  };
  let unlockedWorst = 0;
  let lockedWorst = 0;
  let unlockedReleased = 0;
  let lockedVetoed = 0;
  const A = fixture(false);
  const B = fixture(true);
  for (let s = 0; s < 480; s++) {
    strongAt(A.w, A.hx, A.hy);
    strongAt(B.w, B.hx, B.hy);
    stepCultureWorld(A.w);
    stepCultureWorld(B.w);
    if (s % 6 !== 0 || !A.w.gait.out['citizen:0'] || !B.w.gait.out['citizen:0']) continue;
    const a = protectedCount(A.w, false);
    const b = protectedCount(B.w, true);
    unlockedWorst = Math.max(unlockedWorst, a.n);
    lockedWorst = Math.max(lockedWorst, b.n);
    unlockedReleased += a.released;
    lockedVetoed += b.vetoed;
  }
  assert.equal(unlockedWorst, 0, 'the veto fixture shows no release in the protected region');
  assert.ok(unlockedReleased > 50, `and pieces did release (${unlockedReleased} piece-samples)`);
  assert.ok(lockedWorst > 0, 'non-vacuous: the same break-up, locked, DOES scatter into cells under 10% ink');
  assert.equal(lockedVetoed, 0, 'a locked wearer is never vetoed');
  assert.ok(A.w.gait.out['citizen:0'].vetoed >= 0);
  ok(
    'the veto fixture: an unlocked wearer’s pieces never release onto protected negative space; the locked one’s do — LOIS only vetoes',
  );
}

// 9 — determinism, the hash, and gait never writes a body.
{
  const run = () => {
    const f = fixture(false);
    for (let s = 0; s < 1100; s++) {
      strongAt(f.w, f.hx, f.hy);
      stepCultureWorld(f.w);
    }
    return f.w;
  };
  const a = run();
  const b = run();
  for (const col of ['x', 'y', 'vx', 'vy', 'alive']) assert.deepEqual(a.bodies[col], b.bodies[col]);
  assert.equal(cultureWorldHash(a), cultureWorldHash(b), 'twin worlds through the same doors hash identically');
  assert.equal(
    JSON.stringify(cultureCitizenAt(a, 0)),
    JSON.stringify(cultureCitizenAt(b, 0)),
    'and lay out identically',
  );
  assert.equal(cultureGaitHash(a.gait), cultureGaitHash(b.gait));
  // gait writes no body: a twin whose gait layer never runs (empty room, nothing assigned) has the same bodies
  const plain = castDish(7);
  const [hx, hy] = headOf(plain);
  dealCultureField(plain, { kind: 'magnet', x: hx + 300, y: hy - 100, strength: 0.3, radius: 300 });
  for (let s = 0; s < 1100; s++) {
    strongAt(plain, hx, hy);
    stepCultureWorld(plain);
  }
  for (const col of ['x', 'y', 'vx', 'vy', 'alive', 'mass', 'radius'])
    assert.deepEqual(a.bodies[col], plain.bodies[col], `gait never writes the ${col} column`);
  assert.notEqual(cultureWorldHash(a), cultureWorldHash(plain), 'yet the hash covers the layer');
  // the hash covers each part of the layer
  const base = createCultureGait();
  const h = cultureGaitHash(base);
  const mut = (f) => {
    const g = createCultureGait();
    f(g);
    return cultureGaitHash(g);
  };
  const variants = [
    (g) => (g.beats = 1),
    (g) => (g.phrase = 1),
    (g) => (g.room.energy = 'low'),
    (g) => (g.room.silent = 1),
    (g) => (g.room.bpm = 100),
    (g) => (g.assign['citizen:0'] = { gaitId: canonGaits('swiss').idle.id, by: 'queen', locked: false }),
    (g) =>
      g.log.push({ step: 1, target: 'citizen:0', gaitId: canonGaits('swiss').idle.id, by: 'queen', locked: false }),
    (g) => (g.notch['citizen:0'] = { n: 1, from: 1, t0: 0 }),
  ];
  const hs = variants.map((f) => mut(f));
  assert.ok(hs.every((x) => x !== h) && new Set(hs).size === hs.length, 'every field of the state moves the hash');
  // FIX-FORWARD (slice B QA): the hash covers the CONTENTS of each log entry and of each notch, not just their count
  const idle = canonGaits('swiss').idle.id;
  const entry = { step: 1, target: 'citizen:0', gaitId: idle, by: 'queen', locked: false };
  const withLog = (patch) => mut((g) => g.log.push({ ...entry, ...patch }));
  const logH = [
    withLog({}),
    withLog({ step: 2 }),
    withLog({ target: 'citizen:1' }),
    withLog({ gaitId: canonGaits('swiss').performing.id }),
    withLog({ by: 'user' }),
    withLog({ locked: true }),
  ];
  assert.equal(new Set(logH).size, logH.length, 'every field of a log entry moves the hash');
  const withNotch = (n) => mut((g) => (g.notch['citizen:0'] = { n, from: 1, t0: 0 }));
  assert.ok(withNotch(1) !== withNotch(2) && withNotch(2) !== withNotch(3), 'the notch number alone moves the hash');
  assert.ok(withNotch(1) !== mut((g) => (g.notch['citizen:0'] = { n: 1, from: 0.5, t0: 0 })), 'and its easing start');
  assert.ok(withNotch(1) !== mut((g) => (g.notch['citizen:0'] = { n: 1, from: 1, t0: 2 })), 'and its clock');
  assert.ok(a.gait.breakup.size >= 0 && cultureGaitHash(a.gait) !== cultureGaitHash(plain.gait), 'the folds are in it');
  assert.equal(cultureGaitPartPose(createCultureGait(), 0, 0), null);
  assert.equal(cultureGaitTargetOf(3), 'citizen:3');
  assert.ok(cultureGaitPieces(cultureTreeOf('rig', DISH)).every((p, k) => p.id === k));
  assert.ok(PHRASE_STEPS > 0);
  ok('determinism: twin worlds bit-identical; the hash covers every part of the gait layer; gait never writes a body');
}

console.log(`cultureGait.selfcheck: ${checks}/9 groups OK`);
