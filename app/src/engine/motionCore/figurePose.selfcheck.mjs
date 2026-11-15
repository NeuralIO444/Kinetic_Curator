// node src/engine/motionCore/figurePose.selfcheck.mjs
//
// #2119 — Motion Core P7 step 3.1: poseFigure honours bone.motion (docs/design/figures-spec.md §2, §6, §9).
// Parity first: a figure with no motion anywhere poses Object.is-equal per bone (every field, bit for bit) to
// poseRig / poseLinkage — the native evaluator's pose, untouched. Then the composition pins: a kineme bone moving
// at its part's own phase (§11 ruling 2), a native child composing locally under a foreign parent, amount 0
// holding a bone at rest, amount clamped to [0, 2] (ruling 3), a beast bar bending once per bar name (ruling 4),
// a phrase bone failing safe to its native source until P6 (#2118). And the door: buildRig bakes the record's
// motion map onto the bones it names; sanitizeRig validates the baked form and drops an invalid entry, never the
// rig. Fixtures are hand-written, in the rig adapter suite's style.
import assert from 'node:assert/strict';
import './kinemeSources.js'; // the kineme sources register on import; poseFigure resolves them through the registry
import { getMotionSource } from './index.js';
import { poseFigure, gaitSourceId } from './rigSources.js';
import { poseRig, buildRig, sanitizeRig, LOIS_GAITS } from '../creatureRig.js';
import { poseLinkage } from '../beastRig.js';
import { sanitizeMeasures } from '../beastBuilder.js';
import { wildTypeMeasures } from '../jansenMeasures.js';
import { kinemePhase } from '../../data/kinemes.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const rad = (d) => (d * Math.PI) / 180;
// per-bone Object.is parity: same fields, every value bit-identical
const boneIs = (a, b) => {
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), `${b.id}: field set`);
  for (const k of Object.keys(b)) assert.ok(Object.is(a[k], b[k]), `${b.id}.${k}: ${a[k]} !== ${b[k]}`);
};

// hand-written rigs (poseRig reads only id / role / chain / parent / x / y / angle / len)
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
const RIG_A = {
  bones: [head, limb(0, 0, 35, 70, 120, 30), limb(0, 1, 0, 0, 20, 24), limb(1, 0, 65, 70, 60, 30), limb(1, 1, 0, 0, -20, 24)],
};
const RIG_B = { bones: [head, limb(0, 0, 40, 65, 100, 28), limb(0, 1, 0, 0, 15, 22), limb(0, 2, 0, 0, -12, 14)] };
const withMotion = (rig, map) => ({
  ...rig,
  bones: rig.bones.map((b) => (map[b.id] ? { ...b, motion: map[b.id] } : b)),
});
const GAITS = Object.keys(LOIS_GAITS);
const TIMES = [0, 0.3, 1.4, 2.75, 9.1];
const wild = sanitizeMeasures(wildTypeMeasures());
const LINK = { measures: wild, phase: 0 };
const LINK8 = { measures: sanitizeMeasures({ ...wildTypeMeasures(), legCount: 8, scale: 0.8 }), phase: 0.25 };

console.log('#2119 figurePose — poseFigure honours bone.motion');

ok('parity: a motionless tree figure poses Object.is-equal per bone to poseRig, every gait × phase × time', () => {
  for (const rig of [RIG_A, RIG_B])
    for (const gait of GAITS)
      for (const phase of [0, 0.37])
        for (const t of TIMES) {
          const posed = poseFigure(rig, t, { gait, phase });
          const expected = poseRig(rig, t, LOIS_GAITS[gait], phase);
          assert.equal(posed.length, expected.length);
          expected.forEach((p, i) => boneIs(posed[i], p));
        }
  // the face path resolves through gaitFor to the same gait
  const byFace = poseFigure(RIG_A, 0.8, { face: 'BURN', phase: 0.1 });
  poseRig(RIG_A, 0.8, LOIS_GAITS.BURN, 0.1).forEach((p, i) => boneIs(byFace[i], p));
});

ok('parity: a motionless linkage poses Object.is-equal per bone to poseLinkage (drive and crank pass through)', () => {
  for (const l of [LINK, LINK8])
    for (const drive of [1, 1.5])
      for (const t of TIMES) {
        const posed = poseFigure(l, t, { drive });
        const expected = poseLinkage(l, t, drive);
        assert.equal(posed.length, expected.length);
        expected.forEach((p, i) => boneIs(posed[i], p));
      }
  const crank = { a: 0.3, b: 0.9 };
  poseLinkage(LINK, 2.2, 1, crank).forEach((p, i) => boneIs(poseFigure(LINK, 2.2, { crank })[i], p));
  // a motion map of native entries only is still the native pose, untouched
  poseLinkage(LINK8, 1.3).forEach((p, i) =>
    boneIs(poseFigure(LINK8, 1.3, { motion: { frame: { source: 'linkage', amount: 2 } } })[i], p),
  );
});

ok('§3(a): a kineme head rocks at its part phase — rest joint, rest + source dRot, the rest of the figure native', () => {
  const rig = withMotion(RIG_A, { h: { source: 'kineme:rock' } });
  const opts = { gait: 'NOD', phase: 0.2, seedOffset: 5, tileKey: 'tile-x' };
  const rock = getMotionSource('kineme:rock');
  const ph = kinemePhase(5, 'tile-x#h');
  let maxDev = 0;
  for (const t of [0.4, 1.1, 2.3, 3.7]) {
    const posed = poseFigure(rig, t, opts);
    const native = poseRig(rig, t, LOIS_GAITS.NOD, 0.2);
    const rest = poseRig(rig, 0, LOIS_GAITS.NOD, 0.2);
    posed.forEach((p, i) => {
      if (p.id !== 'h') boneIs(p, native[i]); // only the head left the native pass
    });
    const d = rock.evaluate({ key: 'h', seedOffset: 5, phase01: ph }, t, {});
    assert.ok(near(posed[0].angle, rest[0].angle + d.dRot), `head angle = rest + rock dRot at t=${t}`);
    assert.ok(Object.is(posed[0].x, rest[0].x) && Object.is(posed[0].y, rest[0].y), 'rock offsets nothing: the joint is the rest joint');
    assert.ok(
      near(posed[0].tx, posed[0].x + Math.cos(rad(posed[0].angle)) * posed[0].len) &&
        near(posed[0].ty, posed[0].y + Math.sin(rad(posed[0].angle)) * posed[0].len),
      'the tip follows the composed angle',
    );
    maxDev = Math.max(maxDev, Math.abs(posed[0].angle - native[0].angle));
  }
  assert.ok(maxDev > 1, `the head really rocks (max deviation from the native pose ${maxDev.toFixed(2)}°)`);
  // amount multiplies the source's local delta
  const rig2 = withMotion(RIG_A, { h: { source: 'kineme:rock', amount: 2 } });
  const rest = poseRig(RIG_A, 0, LOIS_GAITS.NOD, 0.2);
  const d = rock.evaluate({ key: 'h', seedOffset: 5, phase01: ph }, 1.1, {});
  assert.ok(near(poseFigure(rig2, 1.1, opts)[0].angle, rest[0].angle + 2 * d.dRot), 'amount 2 doubles the rock');
});

ok('composition: a foreign root moves by its source; its native children compose locally from its posed tip', () => {
  const rig = withMotion(RIG_B, { 'l0.0': { source: 'kineme:bob' } });
  const opts = { gait: 'NOD', phase: 0.15, seedOffset: 4, tileKey: 'fig' };
  const bob = getMotionSource('kineme:bob');
  const gaitSrc = getMotionSource(gaitSourceId('NOD'));
  let maxDy = 0;
  for (const t of [0.5, 1.9, 4.2]) {
    const posed = poseFigure(rig, t, opts);
    const by = new Map(posed.map((p) => [p.id, p]));
    const rest = new Map(poseRig(rig, 0, LOIS_GAITS.NOD, 0.15).map((p) => [p.id, p]));
    const d = bob.evaluate({ key: 'l0.0', seedOffset: 4, phase01: kinemePhase(4, 'fig#l0.0') }, t, {});
    const root = by.get('l0.0');
    const rRoot = rest.get('l0.0');
    assert.ok(near(root.x, rRoot.x + (d.dx || 0)) && near(root.y, rRoot.y + (d.dy || 0)), 'root joint = rest joint + bob offset');
    assert.ok(near(root.angle, rRoot.angle + (d.dRot || 0)), 'bob rotates nothing: the root keeps its rest angle');
    maxDy = Math.max(maxDy, Math.abs(d.dy || 0));
    const c1 = by.get('l0.1');
    assert.ok(Object.is(c1.x, root.tx) && Object.is(c1.y, root.ty), "the child's joint IS the parent's posed tip");
    const dC = gaitSrc.evaluate({ key: 'l0.1' }, t, { rig, phase: 0.15 });
    const dP = gaitSrc.evaluate({ key: 'l0.0' }, t, { rig, phase: 0.15 });
    const expected = root.angle + (rest.get('l0.1').angle - rRoot.angle) + (dC.dRot - dP.dRot);
    assert.ok(near(c1.angle, expected), 'child angle = parent posed + rest local + local gait delta');
    const c2 = by.get('l0.2');
    assert.ok(Object.is(c2.x, c1.tx) && Object.is(c2.y, c1.ty), 'the subtree follows the composed chain');
    boneIs(by.get('h'), poseRig(rig, t, LOIS_GAITS.NOD, 0.15).find((p) => p.id === 'h'));
  }
  assert.ok(maxDy > 0.5, `the root really bobs (max |dy| ${maxDy.toFixed(2)})`);
});

ok('amount 0 holds a bone at its rest local pose — kineme and native alike', () => {
  const rigK = withMotion(RIG_A, { h: { source: 'kineme:rock', amount: 0 } });
  const restA = poseRig(RIG_A, 0, LOIS_GAITS.NOD, 0.2);
  for (const t of TIMES) assert.deepEqual(poseFigure(rigK, t, { gait: 'NOD', phase: 0.2 })[0], restA[0]);
  const rigG = withMotion(RIG_B, { 'l0.1': { source: 'gait', amount: 0 } });
  const restB = new Map(poseRig(RIG_B, 0, LOIS_GAITS.NOD, 0.15).map((p) => [p.id, p]));
  for (const t of [0.6, 2.1]) {
    const posed = poseFigure(rigG, t, { gait: 'NOD', phase: 0.15 });
    const by = new Map(posed.map((p) => [p.id, p]));
    boneIs(by.get('l0.0'), poseRig(RIG_B, t, LOIS_GAITS.NOD, 0.15).find((p) => p.id === 'l0.0')); // the parent stays native
    const c1 = by.get('l0.1');
    assert.ok(Object.is(c1.x, by.get('l0.0').tx) && Object.is(c1.y, by.get('l0.0').ty), 'joint rides the parent tip');
    assert.ok(
      near(c1.angle, by.get('l0.0').angle + (restB.get('l0.1').angle - restB.get('l0.0').angle)),
      'angle = parent posed + rest local + 0',
    );
    assert.ok(Object.is(by.get('l0.2').x, c1.tx) && Object.is(by.get('l0.2').y, c1.ty), 'the child follows');
  }
});

ok('amount clamps to [0, 2] at pose time too (a raw figure that never saw the door)', () => {
  const hi = withMotion(RIG_A, { h: { source: 'kineme:rock', amount: 5 } });
  const hi2 = withMotion(RIG_A, { h: { source: 'kineme:rock', amount: 2 } });
  const lo = withMotion(RIG_A, { h: { source: 'kineme:rock', amount: -3 } });
  const lo0 = withMotion(RIG_A, { h: { source: 'kineme:rock', amount: 0 } });
  const opts = { gait: 'NOD', phase: 0.2, seedOffset: 3, tileKey: 'clamp' };
  for (const t of [0.7, 2.9]) {
    assert.deepEqual(poseFigure(hi, t, opts), poseFigure(hi2, t, opts), 'amount 5 poses as amount 2');
    assert.deepEqual(poseFigure(lo, t, opts), poseFigure(lo0, t, opts), 'amount −3 poses as amount 0');
  }
});

ok('ruling 4: a beast bar source bends the bar itself, evaluated once per bar name — every leg in step', () => {
  const opts = { motion: { frame: { source: 'kineme:bob' } }, seedOffset: 2, tileKey: 'beast' };
  const bob = getMotionSource('kineme:bob');
  const ph = kinemePhase(2, 'beast#frame');
  let maxDy = 0;
  for (const t of [0.7, 2.2, 3.9]) {
    const posed = poseFigure(LINK8, t, opts);
    const base = poseLinkage(LINK8, t);
    const d = bob.evaluate({ key: 'frame', seedOffset: 2, phase01: ph }, t, {});
    const dys = [];
    posed.forEach((p, i) => {
      if (p.name !== 'frame') return boneIs(p, base[i]); // every other bar is poseLinkage's own
      assert.ok(near(p.y - base[i].y, d.dy) && near(p.x - base[i].x, d.dx || 0), 'the bar takes the single delta');
      assert.ok(Object.is(p.angle, base[i].angle), 'bob does not rotate the bar');
      dys.push(p.y - base[i].y);
    });
    assert.equal(dys.length, 8, 'one frame bar per leg');
    assert.ok(dys.every((v) => near(v, dys[0], 1e-12)), 'all eight legs bend by the same delta — one evaluate per name');
    maxDy = Math.max(maxDy, Math.abs(d.dy));
  }
  assert.ok(maxDy > 0.5, `the bar really bends (max |dy| ${maxDy.toFixed(2)})`);
  // rotation, amount, and the beam as a name of its own
  const rock = getMotionSource('kineme:rock');
  const phR = kinemePhase(2, 'beast#frame');
  const t = 1.6;
  const base = poseLinkage(LINK8, t);
  const dR = rock.evaluate({ key: 'frame', seedOffset: 2, phase01: phR }, t, {});
  poseFigure(LINK8, t, { motion: { frame: { source: 'kineme:rock', amount: 2 } }, seedOffset: 2, tileKey: 'beast' }).forEach(
    (p, i) => {
      if (p.name !== 'frame') return boneIs(p, base[i]);
      assert.ok(near(p.angle, base[i].angle + 2 * dR.dRot), 'the bar rotates by amount × dRot');
    },
  );
  poseFigure(LINK8, t, { motion: { beam: { source: 'kineme:bob' } }, seedOffset: 2, tileKey: 'beast' }).forEach((p, i) => {
    if (p.name !== 'beam') return boneIs(p, base[i]);
    const dB = bob.evaluate({ key: 'beam', seedOffset: 2, phase01: kinemePhase(2, 'beast#beam') }, t, {});
    assert.ok(near(p.y - base[i].y, dB.dy), 'the beam bends under its own name');
  });
  // a phrase bar fails safe to the native pose until P6 registers phrase sources
  poseLinkage(LINK8, t).forEach((p, i) =>
    boneIs(poseFigure(LINK8, t, { motion: { frame: { source: 'phrase:hook' } } })[i], p),
  );
});

ok('a phrase bone fails safe to its native source until P6 — entry and amount alike wait (§2, ruling 8)', () => {
  const rig = withMotion(RIG_A, { h: { source: 'phrase:verse1', amount: 2 } });
  for (const t of [0.5, 1.8, 3.3])
    poseRig(rig, t, LOIS_GAITS.NOD, 0.2).forEach((p, i) => boneIs(poseFigure(rig, t, { gait: 'NOD', phase: 0.2 })[i], p));
});

ok('the door: buildRig bakes the record motion map onto the bones it names', () => {
  const rig = buildRig({
    body: 'geo_circle_01',
    head: { x: 50, y: 6 },
    limbs: [
      { x: 12, y: 70 },
      { x: 88, y: 70 },
    ],
    joints: [],
    motion: {
      h: { source: 'kineme:rock' },
      'l0.0': { source: 'kineme:bob', amount: 0.5 },
      'l9.9': { source: 'kineme:rock' }, // names no built bone: rides nowhere
    },
  });
  const byId = new Map(rig.bones.map((b) => [b.id, b]));
  assert.deepEqual(byId.get('h').motion, { source: 'kineme:rock' });
  assert.deepEqual(byId.get('l0.0').motion, { source: 'kineme:bob', amount: 0.5 });
  assert.ok(!('motion' in byId.get('l1.0')), 'an unnamed bone carries no motion field');
});

ok('the door: sanitizeRig validates baked motion — invalid entries dropped, never the rig; amount clamped', () => {
  const bone = (id, extra = {}) => ({
    id,
    role: id === 'h' ? 'head' : 'limb',
    chain: id === 'h' ? -1 : 0,
    parent: null,
    x: 50,
    y: 50,
    angle: 0,
    len: 10,
    ...extra,
  });
  const clean = sanitizeRig({
    body: 'geo_circle_01',
    bones: [
      bone('h', { motion: { source: 'kineme:rock', amount: 7 } }),
      bone('l0.0', { motion: { source: 'kineme:rock+bob' } }),
      bone('l0.1', { parent: 'l0.0', motion: { source: 'phrase:verse1' } }),
      bone('l1.0', { chain: 1, motion: { source: 'kineme:nope' } }),
      bone('l1.1', { chain: 1, parent: 'l1.0', motion: { source: 'linkage' } }),
      bone('l2.0', { chain: 2, motion: { source: 'kineme:rock', amount: 'x' } }),
      bone('l2.1', { chain: 2, parent: 'l2.0', motion: { source: 'gait', amount: -2 } }),
      bone('l3.0', { chain: 3, motion: { source: 'kineme:Rock' } }),
    ],
  });
  assert.equal(clean.bones.length, 8, 'every bone survives');
  const byId = new Map(clean.bones.map((b) => [b.id, b]));
  assert.deepEqual(byId.get('h').motion, { source: 'kineme:rock', amount: 2 }, 'amount clamped to 2');
  assert.deepEqual(byId.get('l0.0').motion, { source: 'kineme:rock+bob' }, 'a P5 stack id is a lawful kineme id');
  assert.deepEqual(byId.get('l0.1').motion, { source: 'phrase:verse1' }, 'a phrase entry is lawful from 3.1 (ruling 8)');
  assert.ok(!('motion' in byId.get('l1.0')), 'an unknown kineme id is dropped');
  assert.ok(!('motion' in byId.get('l1.1')), "the other skeleton's native is dropped");
  assert.ok(!('motion' in byId.get('l2.0')), 'a non-finite amount drops the entry');
  assert.deepEqual(byId.get('l2.1').motion, { source: 'gait', amount: 0 }, 'an explicit native clamps to 0');
  assert.ok(!('motion' in byId.get('l3.0')), 'an out-of-grammar source is dropped');
  // a motionless rig sanitizes to exactly the legacy bone shape
  const plain = sanitizeRig({ body: 'geo_circle_01', bones: [bone('h'), bone('l0.0')] });
  for (const b of plain.bones)
    assert.deepEqual(Object.keys(b).sort(), ['angle', 'chain', 'id', 'len', 'parent', 'role', 'x', 'y']);
});

ok('the door: a beast motion map rides the rig, keyed by bar name; a motionless beast gains no key', () => {
  const clean = sanitizeRig({
    body: '',
    linkage: { measures: wild, phase: 0 },
    motion: {
      frame: { source: 'kineme:bob' },
      beam: { source: 'kineme:rock', amount: 9 },
      crank: { source: 'gait' },
      hip: { source: 'kineme:rock' },
      b: { source: 'kineme:nope' },
    },
  });
  assert.deepEqual(clean.motion, {
    frame: { source: 'kineme:bob' },
    beam: { source: 'kineme:rock', amount: 2 },
  });
  const plain = sanitizeRig({ body: '', linkage: { measures: wild, phase: 0 } });
  assert.ok(!('motion' in plain), 'no motion key on a motionless beast');
});

ok('anchor law: a kineme bone at phase 0 is exactly at rest at t = 0', () => {
  let tk = null;
  for (let k = 0; k < 100000 && tk === null; k++) if (kinemePhase(0, `tk${k}#h`) === 0) tk = `tk${k}`;
  assert.ok(tk, 'a phase-0 tile key exists in the search window');
  const rig = withMotion(RIG_A, { h: { source: 'kineme:rock' } });
  const posed = poseFigure(rig, 0, { gait: 'NOD', seedOffset: 0, tileKey: tk });
  assert.deepEqual(posed[0], poseRig(rig, 0, LOIS_GAITS.NOD, 0)[0], 'the rocking head is at rest at t = 0');
});

ok('determinism: the same figure, time and opts pose identically twice — and the motion is not vacuous', () => {
  const rig = withMotion(RIG_B, {
    h: { source: 'kineme:rock' },
    'l0.0': { source: 'kineme:bob' },
    'l0.1': { source: 'gait', amount: 0.5 },
  });
  const opts = { gait: 'BURN', phase: 0.3, seedOffset: 7, tileKey: 'det' };
  assert.deepEqual(poseFigure(rig, 1.9, opts), poseFigure(rig, 1.9, opts));
  const native = poseRig(rig, 1.9, LOIS_GAITS.BURN, 0.3);
  assert.ok(
    poseFigure(rig, 1.9, opts).some((p, i) => !near(p.angle, native[i].angle, 1e-6) || !near(p.x, native[i].x, 1e-6)),
    'the mixed figure poses off its native pose somewhere',
  );
});

console.log(`figurePose.selfcheck: ${n} groups passed`);
