// node src/engine/engraving.selfcheck.mjs
// Phase 2 S4 — the engraving finish (engine/engraveBody.mjs): body-space contour lines bound to the
// skeleton's spine. Proven here, in the material-leaf pattern (plateBody/washBody/stippleBody):
//   - the packer turns a posed skeleton's spine into the body item's own quad frame, exactly inverting
//     the vertex stage's transform, and returns null (the pre-S4 path) whenever there is nothing to engrave;
//   - the JS field mirror puts lines at multiples of `spacing` along the spine's ARC — so the field is a
//     function of the joints, and bending a joint bends the lines (the slice's whole claim);
//   - the GLSL chunk carries the same walk and the fwidth band, inlined into the quad shader behind the
//     joint-count gate, so a non-engraved instance renders the pre-S4 quad bit for bit;
//   - the instance packer appends the 16 engraving floats AFTER the #1585 params — every earlier offset
//     unmoved — and the scene contract carries `engrave` only when an item is engraved, validated;
//   - the creature builder binds the finish to the true body item only, through input.wantEngraving,
//     without touching skeleton publication (wantSkeletons' business alone);
//   - the golden frame hash pins the packed engraving data for the seed-77 fixture moth, stable across
//     runs (the pixel render itself is the browser harness's surface; this is the frame-data hash the
//     renderer uploads, byte for byte).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ENGRAVE_JOINTS, ENGRAVE_FLOATS, ENGRAVE_DEFAULTS,
  spineJointsOf, engraveDataFor, engraveFactorAt, ENGRAVE_GLSL,
} from './engraveBody.mjs';
import { buildSkeleton, transformSkeleton, fnv1a, MOTH_SKELETON_PLAN } from './skeleton.js';
import { createCreatureBuilder, MOTH, MOTH_PARTS } from './creature.js';
import { ASSETS } from '../data/assets/index.js';
import { packInstanceData } from '../gl/renderer.mjs';
import { QUAD_FS, QUAD_VS } from '../gl/shaders.mjs';
import { assertSceneContract, GL_CONTRACT_VERSION } from '../gl/sceneContract.js';

const FIXTURE = [{ x: 50, y: 5 }, { x: 95, y: 50 }, { x: 50, y: 95 }, { x: 5, y: 50 }];
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// 1. The packer: spine joints land in the item's quad frame by the exact inverse of the vertex
//    transform (world = pos + R(rot) * ((au - 50) * scale)).
{
  const skel = buildSkeleton({ seed: 77, creatureId: 'm0', attach: FIXTURE });
  const joints = spineJointsOf(skel);
  assert.ok(joints.length >= 2, 'the fixture spine has joints');
  assert.equal(joints.length, skel.bones.filter((b) => b.chain === null).length + 1, 'joints = spine bases + head tip');
  // Identity placement at the origin, unit scale: au = 50 + world.
  const item = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
  const data = engraveDataFor(skel, item);
  assert.equal(data.length, ENGRAVE_FLOATS);
  const n = Math.min(joints.length, ENGRAVE_JOINTS);
  assert.equal(data[12], n, 'count rides at [12]');
  for (let k = 0; k < n; k++) {
    assert.ok(near(data[k * 2], 50 + joints[k].x) && near(data[k * 2 + 1], 50 + joints[k].y), `joint ${k} maps by +50 at identity`);
  }
  for (let k = n; k < ENGRAVE_JOINTS; k++) {
    assert.equal(data[k * 2], data[(n - 1) * 2], `pad joint ${k} repeats the head joint x`);
    assert.equal(data[k * 2 + 1], data[(n - 1) * 2 + 1], `pad joint ${k} repeats the head joint y`);
  }
  assert.deepEqual(data.slice(13), [ENGRAVE_DEFAULTS.spacing, ENGRAVE_DEFAULTS.width, ENGRAVE_DEFAULTS.strength], 'params ride at [13..15]');
  // Scale + translation: au = 50 + (world - pos) / scale.
  const d2 = engraveDataFor(skel, { x: 10, y: 20, scaleX: 2, scaleY: 4, rotation: 0 });
  assert.ok(near(d2[0], 50 + (joints[0].x - 10) / 2) && near(d2[1], 50 + (joints[0].y - 20) / 4), 'scaled/translated joint 0');
  // Rotation 90°: R^-1 maps (dx, dy) -> (dy, -dx) in the y-down frame the packer documents.
  const d3 = engraveDataFor(skel, { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 90 });
  assert.ok(near(d3[0], 50 + joints[0].y, 1e-6) && near(d3[1], 50 - joints[0].x, 1e-6), 'rotated joint 0 follows R^-1');
  // Round-trip against the world skeleton the builder publishes: transform then pack at the same
  // placement returns the creature-local joints centred on 50.
  const world = transformSkeleton(skel, { x: 500, y: 350, scale: 2 });
  const d4 = engraveDataFor(world, { x: 500, y: 350, scaleX: 2, scaleY: 2, rotation: 0 });
  assert.ok(near(d4[0], 50 + joints[0].x) && near(d4[1], 50 + joints[0].y), 'world joints invert back to the local frame');
  // Nothing to engrave -> null -> the item carries no key and every downstream surface is pre-S4.
  assert.equal(engraveDataFor(null, item), null);
  assert.equal(engraveDataFor(skel, null), null);
  assert.equal(engraveDataFor({ bones: [] }, item), null);
  assert.equal(engraveDataFor({ bones: [{ chain: null, base: { x: 0, y: 0 }, tip: { x: 0, y: 0 } }] }, item).length, ENGRAVE_FLOATS, 'a 1-bone spine still yields 2 joints');
  assert.equal(engraveDataFor(skel, { x: 0, y: 0, scaleX: 0, scaleY: 1, rotation: 0 }), null, 'degenerate scale packs nothing');
  assert.equal(engraveDataFor(skel, { x: NaN, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }), null, 'non-finite placement packs nothing');
}

// 2. The field: lines are the level sets of spine ARC length at multiples of spacing — dark at line
//    centres mid-spine, untouched between lines, faded at both ends of the spine.
{
  const straight = [{ x: 50, y: 10 }, { x: 50, y: 50 }, { x: 50, y: 90 }]; // arc 0..80 down the middle
  const P = { spacing: 8, width: 1.5, strength: 0.55 };
  const at = (x, y, joints = straight, params = P) => engraveFactorAt({ x, y }, joints, params);
  // (Line centres sit within the mirror's fixed AA band, so they land a hair under full strength —
  // the shader's fwidth band behaves the same way; 5e-3 is the honest tolerance.)
  assert.ok(near(at(50, 10 + 16), 1 - 0.55, 5e-3), 'arc 16 = 2 spacings: line centre, full strength (end fade spent)');
  assert.ok(near(at(50, 10 + 40), 1 - 0.55, 5e-3), 'arc 40: line centre');
  assert.ok(near(at(50, 10 + 20), 1, 1e-9), 'arc 20 = 2.5 spacings: between lines, untouched');
  assert.ok(near(at(50, 10 + 44), 1, 1e-9), 'arc 44: between lines, untouched');
  // The end fade is gentle by its constants (the window runs -0.3..+0.1 spacings): at the exact joints
  // a line centre sits at ~84% fade — measurably softer than mid-spine, not erased.
  assert.ok(at(50, 10) > at(50, 10 + 40) + 0.05, `the tail end fades (factor ${at(50, 10).toFixed(3)} vs mid-spine ${at(50, 10 + 40).toFixed(3)})`);
  assert.ok(at(50, 10 + 79.9) > at(50, 10 + 40) + 0.05, 'the head end fades');
  assert.ok(near(at(50, 10 + 40, straight, { ...P, strength: 0 }), 1, 1e-9), 'strength 0 is no finish anywhere');
  assert.equal(at(50, 50, [{ x: 0, y: 0 }]), 1, 'under 2 joints: no field');
  assert.equal(at(50, 50, straight, { ...P, spacing: 0 }), 1, 'spacing 0: no field, no divide by zero');
  // The field rides the ARC along the path, not the box: a probe at the bent joint's position reads
  // its arc along the bent path (~47.2), not the straight path's 40 — different line phase entirely.
  const bentPath = [{ x: 50, y: 10 }, { x: 74, y: 50 }, { x: 50, y: 90 }];
  assert.notEqual(at(74, 50, bentPath), at(74, 50, straight), 'arc position along the path, not the box, rules the lines');
}

// 3. THE CLAIM: bend a joint and the lines bend with it. Same probe grid, straight vs bent spine —
//    the field changes around the bend and stays put far from it.
{
  const P = { spacing: 8, width: 1.5, strength: 0.55 };
  const straight = [{ x: 50, y: 10 }, { x: 50, y: 50 }, { x: 50, y: 90 }];
  const bent = [{ x: 50, y: 10 }, { x: 74, y: 50 }, { x: 50, y: 90 }]; // middle joint pushed +24 in x
  const f = (joints, x, y) => engraveFactorAt({ x, y }, joints, P);
  // Near the pushed joint the closest-point arc shifts by construction: a probe sitting on the bent
  // segment's line centre is not on the straight spine's line centre.
  let changed = 0;
  let probes = 0;
  for (let x = 30; x <= 94; x += 4) for (let y = 30; y <= 74; y += 4) {
    probes++;
    if (Math.abs(f(bent, x, y) - f(straight, x, y)) > 1e-6) changed++;
  }
  assert.ok(changed > probes / 3, `the bend moves the field (${changed}/${probes} probes changed)`);
  // Locality, stated honestly: once a joint moves, NO segment is shared (the first segment itself runs
  // to the new joint), so the only exactly-unmoved probe is the shared tail joint itself (arc 0 in both).
  assert.ok(near(f(bent, 50, 10), f(straight, 50, 10), 1e-9), 'at the shared tail joint the field agrees');
  // A point ON the bent middle joint: its arc is the first segment's length (~47.2), not 40.
  const arcAtJoint = Math.hypot(24, 40);
  assert.ok(Math.abs(arcAtJoint - 40) > 5, 'the bent arc to the joint is longer — lines past it land later');
}

// 4. The GLSL carries the same walk (parity by construction, the material-leaf pattern): the chunk is
//    inlined into the quad fragment shader, the band derives from fwidth, and the gate keeps every
//    non-engraved instance on the pre-S4 path.
{
  for (const frag of ['engraveShade', 'fwidth(dl)', 'fract(ph + 0.5)', 'bestS / spacing', '-0.3 * spacing', 'total - 0.1 * spacing']) {
    assert.ok(ENGRAVE_GLSL.includes(frag), `GLSL carries ${frag}`);
  }
  assert.ok(QUAD_FS.includes('float engraveShade('), 'the chunk is inlined in QUAD_FS');
  assert.ok(QUAD_FS.includes('if (v_engP.x > 1.5)'), 'the finish is gated on the packed joint count');
  assert.ok(QUAD_FS.includes('o.rgb *= mix(1.0, ef, clamp(o.a, 0.0, 1.0))'), 'a soft multiply weighted by the body coverage');
  for (const loc of [10, 11, 12, 13]) assert.ok(QUAD_VS.includes(`layout(location=${loc}) in vec4 a_eng`), `VS declares a_eng* at location ${loc}`);
  assert.ok(QUAD_VS.includes('v_au = au;'), 'the VS publishes the body-space position');
  // Precision posture (the kill question): no mediump in the quad programme, the field is highp float.
  assert.ok(!/mediump/.test(QUAD_FS) && !/mediump/.test(QUAD_VS), 'no mediump anywhere in the quad programme');
}

// 5. The packer: 45-float stride, every pre-S4 offset unmoved, the engraving block appended at 29..44,
//    absent reads zeros (the branch never enters).
{
  const cells = { 'a1|#000000|#000000': { u0: 0, v0: 0, u1: 0.1, v1: 0.1 } };
  const mk = (extra) => ({
    asset: 'a1', tint: '#000000', accent: '#000000', x: 1, y: 2, scaleX: 3, scaleY: 3,
    rotation: 0, opacity: 1, vx: 0, vy: 0, kineme: 0, kinemePhase: 0, ...extra,
  });
  const eng = Array.from({ length: 16 }, (_, i) => i + 0.5);
  const buf = packInstanceData([mk({ engrave: eng }), mk({})], cells);
  assert.equal(buf.length, 2 * 45, 'two instances at the 45-float stride');
  for (let k = 0; k < 16; k++) assert.equal(buf[29 + k], eng[k], `engraving float ${k} packs at ${29 + k}`);
  for (let k = 0; k < 16; k++) assert.equal(buf[45 + 29 + k], 0, `unengraved instance: engraving float ${k} is 0`);
  assert.equal(buf[0], 1, 'x unmoved at 0');
  assert.equal(buf[24], 0, 'body-code float unmoved at 24');
  assert.deepEqual([...buf.slice(25, 29)], [0, 0, 0, 0], 'matP block unmoved at 25..28 (flat body defaults)');
}

// 6. The contract: `engrave` validates when present; a scene without it is untouched by the new rule.
{
  const scene = (engrave) => ({
    version: GL_CONTRACT_VERSION, canvas: { w: 100, h: 100 },
    layers: [{ id: 'a', type: 'content' }], textRuns: [], fxWraps: [], shed: { fxLayerIds: [] },
    instances: [{
      key: 'i0', layer: 'a', x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
      ...(engrave ? { engrave } : {}),
    }],
  });
  const good = engraveDataFor(buildSkeleton({ seed: 77, creatureId: 'm0', attach: FIXTURE }), { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
  assertSceneContract(scene(good)); // must not throw
  assertSceneContract(scene(null)); // absent: the pre-S4 shape, valid
  assert.throws(() => assertSceneContract(scene([1, 2, 3])), /engrave must be 16 finite numbers/);
  assert.throws(() => assertSceneContract(scene(good.map((v, i) => (i === 12 ? 1 : v)))), /joint count must be in \[2, 6\]/);
  assert.throws(() => assertSceneContract(scene(good.map((v, i) => (i === 13 ? 0 : v)))), /spacing must be > 0/);
}

// 7. The builder wiring: wantEngraving binds the finish to the true body item only; the drawn moth is
//    the same 58 items (S3's feather fan set the census — creature.selfcheck pins it; engraving adds
//    and removes none); skeleton PUBLICATION still answers only to wantSkeletons.
{
  const PAL = { bg: '#111111', ink: '#eeeeee', swatches: ['#aa0000', '#222222'] };
  const entry = () => [{ id: 'a', items: [{ x: 1, y: 1, assetId: 'x' }], palette: PAL }];
  const input = (over = {}) => ({
    dishPins: [{ x: 500, y: 350 }], dishFormed: [true], seed: 77, seedOffsets: null, loopTimeMs: 0, assetAttach: {}, ...over,
  });
  const grow = (over) => {
    const b = createCreatureBuilder();
    let e;
    for (let i = 0; i < MOTH.growFrames + 1; i++) { e = entry(); b.append(input(over), e, ASSETS); }
    return { b, items: e[0].items.filter((it) => it._creature) };
  };
  const on = grow({ wantEngraving: true });
  assert.equal(on.items.length, 58, 'engraving on: the drawn moth is unchanged');
  // TWO items carry the body asset: the halo underlay (drawn by the halo loop) and the true body
  // stamp. The finish rides the stamp only — exactly one engraved item in the whole creature.
  const bodies = on.items.filter((it) => it.engrave !== undefined);
  assert.equal(bodies.length, 1, 'exactly one item is engraved');
  assert.equal(bodies[0].assetId, MOTH_PARTS.body, 'and it is the body stamp, not its halo underlay');
  assert.ok(Array.isArray(bodies[0].engrave) && bodies[0].engrave.length === ENGRAVE_FLOATS, 'the body item carries the 16 engraving floats');
  assert.ok(bodies[0].engrave[12] >= 2 && bodies[0].engrave[12] <= 6, `joint count in range (${bodies[0].engrave[12]})`);
  assert.ok(bodies[0].engrave[13] > 0, 'spacing positive');
  assert.deepEqual(on.b.lastSkeletons(), [null], 'wantEngraving builds bones for the finish but publishes none');
  const off = grow({});
  assert.equal(off.items.length, 58, 'engraving off: the drawn moth is unchanged');
  assert.ok(off.items.every((it) => it.engrave === undefined), 'flag off: no item carries engraving — the pre-S4 items, exactly');
  // Determinism: a second builder on the same input packs the identical engraving data.
  const again = grow({ wantEngraving: true });
  assert.deepEqual(
    again.items.find((it) => it.engrave !== undefined).engrave,
    bodies[0].engrave,
    'same seed, same engraving data',
  );
  // THE GOLDEN: the seed-77 fixture moth's packed engraving, FNV-1a over the 1e-4-quantised floats.
  const canon = bodies[0].engrave.map((v) => Math.round(v * 1e4)).join(',');
  const hash = fnv1a(canon).toString(16).padStart(8, '0');
  assert.equal(hash, '59289882', `golden frame hash (measured ${hash})`);
}

// 8. Cost, measured on this machine (print-only; the registry figure is the sandbox estimate this
//    bench feeds): the pack for the 4-creature cap, per frame.
{
  const skel = transformSkeleton(buildSkeleton({ seed: 77, creatureId: 'm0', plan: MOTH_SKELETON_PLAN, attach: FIXTURE }), { x: 500, y: 350, scale: 2 });
  const item = { x: 500, y: 350, scaleX: 2, scaleY: 2, rotation: 10 };
  const frames = 2000;
  const t0 = performance.now();
  for (let f = 0; f < frames; f++) for (let c = 0; c < 4; c++) engraveDataFor(skel, item);
  const perFrameMs = (performance.now() - t0) / frames;
  console.log(`  [bench] engraveDataFor x4 creatures: ${perFrameMs.toFixed(4)} ms/frame CPU (sandbox node, print-only)`);
  assert.ok(perFrameMs < 2.0, 'the CPU pack for 4 creatures sits far inside the 2.0 ms frame budget');
}

// 9. The determinism guard, in mathRandomGuard's pattern: engraveBody.mjs carries no banned clocks or
//    unseeded chance in its code (comments stripped first, exactly as the guard strips them).
{
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'engraveBody.mjs'), 'utf8');
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const code = noBlock.split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
  for (const banned of ['Math.random', 'Date.now', 'performance.now']) {
    assert.ok(!code.includes(banned), `engraveBody.mjs must not use ${banned} — the finish is a pure function of the posed skeleton`);
  }
}

console.log('engraving.selfcheck: OK (packer inverse, arc field, bend claim, GLSL parity, stride, contract, builder wiring + golden, bench, guard)');
