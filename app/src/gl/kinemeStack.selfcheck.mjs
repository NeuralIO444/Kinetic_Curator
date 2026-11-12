// kinemeStack.selfcheck.mjs — #2117 (Motion Core P5): kineme STACKING — a mark plays exactly two kinemes at once.
// Spec: docs/design/kineme-stacking-spec.md.
//
// Held here: the library (every stack is two distinct, plain singles; ids never collide with a single); the sanitizer and the
// document round-trip (an old document is unchanged, an unknown / region-only stack id is dropped); the contract (a stack takes
// ONE slot and carries its second member as `b`; a single kineme's entry has no `b`, so a scene with no stack builds exactly the
// pre-stacking table); a stack of one IS the single id (same entry, same instance fields, same packed floats); the CPU reference
// (the two members composed: commutative to the bit, one-ulp of the shader's multiply order, rest at t = 0 for a phase-0 node);
// the shader (the second member is gated on its kind inside the existing slot gate, the single kinds are untouched); the Motion
// Core sources `kineme:<a>+<b>`.
import assert from 'node:assert';
import {
  KINEMES,
  KINEME_KINDS,
  KINEME_STACKS,
  KINEME_TABLE_MAX,
  getKineme,
  getAssetKineme,
  kinemePhase,
  sanitizeAssetKineme,
} from '../data/kinemes.js';
import { INSTANCE_STRIDE } from './renderer.mjs';
import { buildSceneContract } from './sceneContract.js';
import { QUAD_VS } from './shaders.mjs';
import { stackPose, kinemePose, kinemeSourceId } from '../engine/motionCore/kinemeSources.js';
import { getMotionSource, composePose } from '../engine/motionCore/index.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const ulp = (x) => Math.abs(x) * 2 ** -52;

// ── the library ───────────────────────────────────────────────────────
ok('every stack is two distinct, plain singles; ids are unique and never shadow a single', () => {
  assert.strictEqual(KINEME_STACKS.length, 4);
  const ids = new Set();
  for (const st of KINEME_STACKS) {
    assert.ok(Object.isFrozen(st) && Object.isFrozen(st.stack));
    assert.strictEqual(st.stack.length, 2, `${st.id}: exactly two (three is not ordered)`);
    assert.notStrictEqual(st.stack[0], st.stack[1], `${st.id}: two distinct members`);
    for (const m of st.stack) {
      const k = getKineme(m);
      assert.ok(k, `${st.id}: member ${m} exists`);
      assert.ok(!k.regionOnly, `${st.id}: no region-only member`);
      assert.notStrictEqual(k.id, 'bend', `${st.id}: bend is a region signal`);
      assert.notStrictEqual(k.kind, 'scatter');
    }
    assert.strictEqual(st.id, st.stack.join('+'));
    assert.ok(!getKineme(st.id), `${st.id} is not a single`);
    assert.ok(!ids.has(st.id));
    ids.add(st.id);
  }
  assert.deepStrictEqual(
    KINEME_STACKS.map((s) => s.id),
    ['rock+bob', 'pulse+spin', 'pulse+blink', 'spin+bob'],
  );
  assert.strictEqual(KINEMES.length, 7, 'the single library is unchanged');
});

ok('getAssetKineme resolves a single as itself and a stack to its two records; getKineme stays single-only', () => {
  assert.strictEqual(getAssetKineme('rock'), getKineme('rock'));
  const s = getAssetKineme('rock+bob');
  assert.strictEqual(s.kind, 'stack');
  assert.deepStrictEqual(s.stack, [getKineme('rock'), getKineme('bob')]);
  assert.strictEqual(getKineme('rock+bob'), undefined, 'the region paths still refuse a stack');
  assert.strictEqual(getAssetKineme('bob+rock'), undefined);
  assert.strictEqual(getAssetKineme('nope'), undefined);
});

// ── the sanitizer and the document ────────────────────────────────────
ok('sanitizer: a stack id is kept; unknown / reversed / region-only stack ids are dropped; old docs unchanged', () => {
  assert.deepStrictEqual(sanitizeAssetKineme({ a: 'rock+bob', b: 'pulse' }), { a: 'rock+bob', b: 'pulse' });
  assert.deepStrictEqual(sanitizeAssetKineme({ a: 'bob+rock', b: 'rock+scatter', c: 'rock+rock', d: 'bob' }), {
    d: 'bob',
  });
  assert.strictEqual(sanitizeAssetKineme({ a: 'rock+bob+pulse' }), null, 'three is not a thing');
  const old = { mic_arrow: 'rock', mic_plus: 'pulse', mic_target: 'blink' };
  assert.deepStrictEqual(sanitizeAssetKineme(old), old, 'a pre-stacking document loads exactly as it did');
});

ok('document round-trip: a stack id survives JSON save / load and re-sanitising', () => {
  const doc = { assetKineme: { mic_arrow: 'pulse+spin', mic_plus: 'blink' } };
  const back = JSON.parse(JSON.stringify(doc));
  assert.deepStrictEqual(sanitizeAssetKineme(back.assetKineme), doc.assetKineme);
  assert.deepStrictEqual(sanitizeAssetKineme(sanitizeAssetKineme(back.assetKineme)), doc.assetKineme);
});

// ── the contract and the pack ─────────────────────────────────────────
const item = (assetId, key, seedOffset = 0) => ({
  assetId,
  x: 500,
  y: 350,
  scale: 2,
  rotation: 0,
  color: '#ffffff',
  accent: '#ff4444',
  alpha: 100,
  key,
  seedOffset,
});
const contract = (assetKineme, items) =>
  buildSceneContract({
    doc: { seed: 1, kinemeTime: 0, assetKineme },
    resolvedLayers: [{ id: 'L', isFx: false, items }],
  });
const ARROW = 'mic_arrow';
const PLUS = 'mic_plus';
const entry = (id) => {
  const k = getKineme(id);
  return { kind: KINEME_KINDS[k.kind], period: k.period, amp: k.amp };
};

ok('contract: a stack takes ONE slot, first member on the entry, second as `b`; a single has no `b`', () => {
  const c = contract({ [ARROW]: 'rock+bob' }, [item(ARROW, 'a')]);
  assert.strictEqual(c.kinemes.length, 1);
  assert.deepStrictEqual(c.kinemes[0], { ...entry('rock'), b: entry('bob') });
  assert.strictEqual(c.instances[0].kineme, 1);
  assert.strictEqual(c.instances[0].kinemePhase, kinemePhase(c.instances[0].seedOffset, 'a'), 'one phase per mark');
  const one = contract({ [ARROW]: 'rock' }, [item(ARROW, 'a')]);
  assert.deepStrictEqual(one.kinemes, [entry('rock')], 'a single: exactly the pre-stacking entry');
  assert.ok(!JSON.stringify(one).includes('"b":'), 'a scene with no stack carries no second member anywhere');
});

ok('contract: marks with the same stack share its slot; a stack and a single are different slots', () => {
  const c = contract({ [ARROW]: 'pulse+spin', [PLUS]: 'pulse' }, [
    item(ARROW, 'a', 1),
    item(ARROW, 'b', 2),
    item(PLUS, 'c', 3),
  ]);
  assert.strictEqual(c.kinemes.length, 2, 'two entries for three marks');
  assert.strictEqual(c.instances[0].kineme, c.instances[1].kineme);
  assert.notStrictEqual(c.instances[0].kineme, c.instances[2].kineme);
  assert.ok(c.kinemes.length <= KINEME_TABLE_MAX);
});

ok('a stack of one IS the single id: same table entry and instance fields; the instance buffer did not grow', () => {
  const stackless = contract({ [ARROW]: 'rock' }, [item(ARROW, 'a', 5)]);
  const again = contract(sanitizeAssetKineme({ [ARROW]: 'rock' }), [item(ARROW, 'a', 5)]);
  assert.deepStrictEqual(again, stackless);
  assert.strictEqual(INSTANCE_STRIDE, 51, 'the instance buffer did not grow (spec option B)');
});

// ── the CPU reference ─────────────────────────────────────────────────
const R = getKineme('rock');
const B = getKineme('bob');
const P = getKineme('pulse');
const S = getKineme('spin');
const BL = getKineme('blink');

ok('stackPose: the two members composed, pinned against hand values', () => {
  const t = 0.6;
  const ph = 0.25;
  const rock = 18 * Math.sin(((0.6 / 2.4 + 0.25) % 1) * 6.28318530718);
  const bob = 6 * Math.sin(((0.6 / 3.0 + 0.25) % 1) * 6.28318530718);
  const p = stackPose(R, B, t, ph);
  assert.ok(Math.abs(p.dRot - rock) < 1e-12 && Math.abs(p.dy - bob) < 1e-12, `${p.dRot} ${p.dy}`);
  assert.strictEqual(p.dx, 0);
  assert.strictEqual(p.sx, 1);
  // pulse+blink: scale from the pulse, visibility from the blink
  const pb = stackPose(P, BL, 0.7, 0.1);
  assert.strictEqual(pb.sx, kinemePose(P, 0.7, 0.1).sx);
  assert.strictEqual(pb.dAlpha, kinemePose(BL, 0.7, 0.1).dAlpha);
});

ok('order of the two entries does not matter, to the bit', () => {
  for (const [a, b] of [
    [R, B],
    [P, S],
    [P, BL],
    [S, B],
  ]) {
    for (let k = 0; k < 50; k++) {
      const t = k * 0.173;
      const ph = (k * 7) / 1000;
      assert.deepStrictEqual(stackPose(a, b, t, ph), stackPose(b, a, t, ph));
    }
  }
});

ok('the shader multiplies the scale twice; composePose forms the product first: within one ulp, never more', () => {
  for (let k = 0; k < 200; k++) {
    const t = k * 0.0931;
    const ph = k / 200;
    const sa = kinemePose(P, t, ph).sx;
    const sb = kinemePose(getKineme('pulse'), t * 1.3, ph).sx; // a second pulse-shaped scale
    const shader = 1 * sa * sb; // c = 1 -> (c * sa) * sb
    const compose = composePose({ sx: sa }, { sx: sb }).sx;
    assert.ok(Math.abs(shader - compose) <= ulp(compose), `${k}: ${shader} vs ${compose}`);
  }
});

ok('anchor law: every starter stack is exactly rest at t = 0 for a phase-0 node', () => {
  for (const st of KINEME_STACKS) {
    const [a, b] = st.stack.map(getKineme);
    const p = stackPose(a, b, 0, 0);
    assert.deepStrictEqual(
      { ...p },
      { dx: 0, dy: 0, dRot: 0, sx: 1, sy: 1, dAlpha: 0 },
      `${st.id} is not at rest at t = 0 (phase 0)`,
    );
  }
});

// ── the shader ────────────────────────────────────────────────────────
ok('shader: the second member is gated on its kind INSIDE the slot gate; the single kinds are untouched', () => {
  assert.ok(QUAD_VS.includes('uniform vec3 u_kinemeB[16];'));
  const gate = QUAD_VS.indexOf('if (a_inst4.z > 0.5) {');
  const b = QUAD_VS.indexOf('vec3 kb = u_kinemeB[int(a_inst4.z + 0.5) - 1];');
  const gateB = QUAD_VS.indexOf('if (kb.x > 0.5) {');
  const spec = QUAD_VS.indexOf('float specColour = 0.0;');
  assert.ok(
    gate > 0 && gate < b && b < gateB && gateB < spec,
    'B reads inside the slot gate, behind its own kind gate',
  );
  for (const line of [
    'if (kind == 1) kDeg = (km.z < 0.0 ? -ph : ph) * 360.0;',
    'else if (kind == 2) kDeg = km.z * wav;',
    'else if (kind == 3) c *= 1.0 + km.z * wav;',
    'else if (kind == 4) kVis = ph < km.z ? 1.0 : 0.0;',
    'else if (kind == 5) kOff = vec2(0.0, km.z * wav);',
  ])
    assert.ok(QUAD_VS.includes(line), `single path intact: ${line}`);
  // the combine rule: rotations and offsets add, scale and visibility multiply (commutative -> order-free)
  for (const frag of ['kDeg += ', 'c *= 1.0 + kb.z * wavB', 'kVis *= ', 'kOff += vec2(0.0, kb.z * wavB)'])
    assert.ok(QUAD_VS.includes(frag), `stack combine: ${frag}`);
  // the shader's phase for B is the mark's own phase (one per mark), with B's own period
  assert.ok(QUAD_VS.includes('fract(u_kinemeTime / max(kb.y, 1e-3) + a_inst4.w)'));
});

// ── Motion Core ───────────────────────────────────────────────────────
ok('Motion Core: every stack registers as kineme:<a>+<b>, evaluates as stackPose, and rests at t = 0', () => {
  for (const st of KINEME_STACKS) {
    const src = getMotionSource(kinemeSourceId(st.id));
    assert.ok(src, st.id);
    assert.strictEqual(src.id, `kineme:${st.id}`);
    assert.strictEqual(src.family, 'kineme');
    assert.strictEqual(src.timeBase, 'kineme');
    assert.strictEqual(src.costTier, 'motionCore/kineme-stack');
    const [a, b] = st.stack.map(getKineme);
    const node = { phase01: 0.37 };
    assert.deepStrictEqual(
      { ...src.evaluate(node, 1.234) },
      { ...composePose(kinemePose(a, 1.234, 0.37), kinemePose(b, 1.234, 0.37)) },
    );
    assert.deepStrictEqual({ ...src.evaluate({ phase01: 0 }, 0) }, { dx: 0, dy: 0, dRot: 0, sx: 1, sy: 1, dAlpha: 0 });
  }
});

console.log(`kinemeStack.selfcheck: ${n} ok`);
