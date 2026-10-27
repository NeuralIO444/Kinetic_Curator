// node src/engine/wingWarp.selfcheck.mjs
// Phase 2 S2 — BENT WINGS by full mesh warp (Matt's ruling 1: mesh warp first, ribbons are the fallback
// that was NOT taken). The proofs this suite owns:
//   1. the skinning maths: weights are a partition of unity, smooth through the joints; transforms are
//      rigid; posed == bind skins to the identity and emits NO mesh.
//   2. IDENTITY PARITY at zero bend, end to end: with the flap beat at rest, a skinning builder produces
//      the pre-S2 moth byte for byte (hash pinned from the base tree d8009ee9, where no warp exists), and
//      the live resolver's output hashes to the same pre-S2 value.
//   3. the BENT golden: at peak beat the wings (and their halos) carry real meshes — 27 vertices, 96
//      indices each — the scale marks ride the field, and the whole frame hashes to a pinned golden,
//      identical across independent runs.
//   4. gate honesty: the debug publication (input.wantSkeletons) alone never skins; skinning is the
//      builder opt the resolver makes, and at rest even it emits nothing.
//   5. the scene contract takes a warp mesh fail-closed (sanitizeMesh), and the determinism guard holds.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS } from '../data/assets/index.js';
import { createCreatureBuilder, MOTH, MOTH_PARTS } from './creature.js';
import { buildSkeleton, MOTH_SKELETON_PLAN } from './skeleton.js';
import {
  buildWingWarp,
  warpPoint,
  spanWeights,
  chainJoints,
  boneTransform,
  applyTransform,
  WARP_STATIONS,
  WARP_ROWS,
} from './wingWarp.mjs';
import { attachPointsFor } from './autoAttach.js';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { sanitizeMesh } from '../gl/sceneContract.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

const fnv = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};
const SW = ['#aa0000', '#222222', '#333333', '#444444', '#555555', '#666666'];
const PAL = { bg: '#111111', ink: '#eeeeee', swatches: SW };
const entry = () => [{ id: 'a', items: [{ x: 1, y: 1, assetId: 'x' }], palette: PAL }];
const inp = (t, over = {}) => ({
  dishPins: [{ x: 500, y: 350 }],
  dishFormed: [true],
  seed: 77,
  seedOffsets: null,
  loopTimeMs: t,
  assetAttach: {},
  ...over,
});
const FULL = MOTH.growFrames + 1;
const PEAK_MS = MOTH.flapMs / 4; // beat = flap * sin(2πt/flapMs) peaks at a quarter period

function builderRun(skinning, bentT, over = {}) {
  const b = createCreatureBuilder({ skinning });
  let e;
  for (let i = 0; i < FULL; i++) {
    e = entry();
    b.append(inp(0, over), e, ASSETS);
  }
  if (bentT != null) {
    e = entry();
    b.append(inp(bentT, over), e, ASSETS);
  }
  return { e, b };
}

// 1. the skinning maths
{
  const attach = attachPointsFor(ASSETS.find((a) => a.id === MOTH_PARTS.body).svg, null);
  const skel = buildSkeleton({
    seed: 77,
    creatureId: 'm0',
    plan: MOTH_SKELETON_PLAN,
    attach,
    pose: { bodyScale: 1, wingScale: 1, foreDirDeg: 40, hindDirDeg: -30, hindAmount: 1 },
  });
  const fore = skel.bones.filter((b) => b.chain === 'fore' && b.side === 'L');
  assert.equal(fore.length, 3, 'the fore chain has three bones');
  const joints = chainJoints(fore);
  assert.equal(joints.length, 4);
  assert.equal(joints[0], 0);
  assert.equal(joints[3], 1);
  for (let s = 0; s <= 200; s++) {
    const w = spanWeights(s / 200, joints);
    assert.ok(
      w.every((x) => x >= 0),
      'weights are never negative',
    );
    assert.ok(Math.abs(w.reduce((a, x) => a + x, 0) - 1) < 1e-9, 'weights are a partition of unity');
  }
  // smooth through the joints: adjacent samples never jump
  let prev = spanWeights(0, joints);
  for (let s = 1; s <= 400; s++) {
    const w = spanWeights(s / 400, joints);
    for (let b = 0; b < 3; b++) assert.ok(Math.abs(w[b] - prev[b]) < 0.05, 'weights move smoothly');
    prev = w;
  }
  // rigid transforms: posed == ref is the identity to float dust (the stored unit vectors are trig
  // products, not exactly unit) — and buildWingWarp's no-mesh gate below is the exactness that matters
  const id = boneTransform(fore[0], fore[0]);
  for (const [got, want] of [
    [id.m00, 1],
    [id.m01, 0],
    [id.m10, 0],
    [id.m11, 1],
    [id.tx, 0],
    [id.ty, 0],
  ]) {
    assert.ok(Math.abs(got - want) < 1e-12, 'posed == ref is the identity transform');
  }
  const [qx, qy] = applyTransform(id, 12.5, -7.25);
  assert.ok(Math.abs(qx - 12.5) < 1e-9 && Math.abs(qy + 7.25) < 1e-9, 'the identity transform moves nothing');
  // a flexed chain bends: posed != bind builds a mesh, bind == posed does not
  const bent = buildSkeleton({
    seed: 77,
    creatureId: 'm0',
    plan: MOTH_SKELETON_PLAN,
    attach,
    pose: { bodyScale: 1, wingScale: 1, foreDirDeg: 40, hindDirDeg: -30, hindAmount: 1, foreFlexDeg: -4.5 },
  });
  const bentFore = bent.bones.filter((b) => b.chain === 'fore' && b.side === 'L');
  const item = { x: 500, y: 350, rotation: -40, scale: 1.7, scaleY: 1.7 };
  const wingPoints = attachPointsFor(ASSETS.find((a) => a.id === MOTH_PARTS.wing).svg, null);
  assert.equal(buildWingWarp({ item, bones: fore, refBones: fore, wingPoints }), null, 'posed == bind emits no mesh');
  const mesh = buildWingWarp({ item, bones: bentFore, refBones: fore, wingPoints });
  assert.ok(mesh, 'a flexed chain emits a mesh');
  assert.equal(mesh.pos.length, WARP_STATIONS * WARP_ROWS * 2, 'the grid is 9x3 vertices');
  assert.equal(mesh.idx.length, (WARP_STATIONS - 1) * (WARP_ROWS - 1) * 6, 'the grid is fully triangulated');
  assert.ok(
    mesh.idx.every((i) => i >= 0 && i < WARP_STATIONS * WARP_ROWS),
    'indices stay inside the grid',
  );
  assert.equal(
    warpPoint({ x: 400, y: 300, wingItem: item, bones: fore, refBones: fore, wingPoints }).dRot,
    0,
    'no flex, no mark rotation',
  );
}

// 2. IDENTITY PARITY at zero bend — the rest item stream, pinned. (Originally pinned from the pre-S2
// tree (d8009ee9): cc3976da / c9a243c9. Re-based at the S3 publish integration, 2026-10-17: S3 replaced
// the Poisson scale marks with the feather fan, so the stream's surface children changed — the new
// plumage is pinned by featherFan.selfcheck. The warp mechanism is untouched by S3: wingWarp.mjs is
// not in S3's diff and section 1 above proves it unchanged.)
// (Re-pinned 2026-10-19 for #1183, Matt's ruling: the two RESOLVER pins only. The slice added the
// weatherAir layout param, so the resolver's hashed output gained exactly one key (weatherAir: 0,
// dial off). Proven before re-pinning: branch resolver output minus that key is byte-identical to
// the base tree's output, and the builder pins did not move — no behaviour changed.)
// (Re-pinned again 2026-10-19 for #1694 S3, Matt's ruling: the two RESOLVER pins only. S3 made the
// creature count a BUILD layout param (creatures: 0), so the hashed output gained exactly one more
// key — the same mechanism as #1183. Proven before re-pinning: with the creatures key stripped from
// the shared defaults this whole suite reproduces the pins above exactly, and the builder pins did
// not move — no behaviour changed.)
// (Re-pinned 2026-10-20 for #1574, Matt's publish re-record ruling: the two RESOLVER pins only.
// P1 made travel a layout-param family (transport / transportLeash / transportFlow, defaults
// still/112/0.8); Q2 added no layout keys (its travelIpadClass is a machine key). The hashed
// resolver output gained exactly those keys at their parity defaults. Proven before re-pinning:
// with the three travel keys stripped from the shared defaults (scratch tree), this suite's
// resolver runs reproduce dc0897fb / 017f6b2a exactly, and the builder pins did not move —
// no behaviour changed.)
// (Re-pinned 2026-10-20 for #1575, under the same publish re-record ruling: the two RESOLVER
// pins only. P2 completed the travel family (transportPath / transportSpeed /
// transportRadius, defaults orbit/1/140); Q4 added no keys (its leash mechanism reads a
// key P1 already owned). The hashed resolver output gained exactly those three keys at
// their parity defaults. Proven before re-pinning: with all six travel keys stripped
// from the shared defaults (scratch tree), this suite's resolver runs reproduce
// dc0897fb / 017f6b2a exactly (the pre-#1574 pins), and the builder pins did not move —
// no behaviour changed.)
// (Re-pinned 2026-10-20 for #1576, under the same publish re-record ruling: the two RESOLVER
// pins only. P3 completed the travel amounts (transportSurge / transportParallax, both
// default 0 — inert at parity); Q3 added no keys (its surgeTrigger is recorded input data
// stamped by the live loop, not a layout param). The hashed resolver output gained exactly
// those two keys at their parity defaults. Proven before re-pinning: with all eight travel
// keys stripped from the shared defaults (scratch tree), this suite's resolver runs
// reproduce dc0897fb / 017f6b2a exactly (the pre-#1574 pins), and the builder pins did not
// move — no behaviour changed.)
const REST_BUILDER = '1dc2d9bb';
const REST_RESOLVER = 'dfb2915f'; // re-based at the S3 integration (was c9a243c9 — see the note below);
// re-pinned 2026-10-19 for #1183 (was 7d901919 — see the note below);
// re-pinned 2026-10-19 for #1694 S3 (was 9f0043e7 — see the note below);
// re-pinned 2026-10-20 for #1574 (was dc0897fb — see the note above)
// re-pinned 2026-10-20 for #1575 (was 41d885e1 — see the note above)
// re-pinned 2026-10-20 for #1576 (was 248580c4 — see the note above)
{
  const on = builderRun(true, null);
  const off = builderRun(false, null);
  assert.equal(fnv(JSON.stringify(off.e)), REST_BUILDER, 'the plain builder is the pinned moth');
  assert.equal(fnv(JSON.stringify(on.e)), REST_BUILDER, 'skinning at rest is the pinned moth, byte for byte');
  assert.ok(
    on.e[0].items.every((i) => !('mesh' in i)),
    'no mesh rides any item at rest',
  );
  assert.ok(on.b.lastSkeletons()[0], 'skinning is a standing skeleton consumer: the frame skeleton exists at rest');
  assert.deepEqual(off.b.lastSkeletons(), [null], 'no consumer still means no skeleton (the S1 gate)');
}

// 3. the BENT golden — peak beat, pinned hash, real meshes, plumage riding its wing rigidly
const BENT_BUILDER = 'd245251e'; // re-based at the S3 integration (was f28c4bd5 — see section 2's note)
const BENT_RESOLVER = '981bdefe'; // re-based at the S3 integration (was 8e0c1b0f — see section 2's note);
// re-pinned 2026-10-19 for #1183 (was 03421894 — see section 2's note);
// re-pinned 2026-10-19 for #1694 S3 (was 7b1c87a6 — see section 2's note);
// re-pinned 2026-10-20 for #1574 (was 017f6b2a — see section 2's note)
// re-pinned 2026-10-20 for #1575 (was 0287999c — see section 2's note)
// re-pinned 2026-10-20 for #1576 (was 9b978ad7 — see section 2's note)
{
  const run1 = builderRun(true, PEAK_MS);
  const run2 = builderRun(true, PEAK_MS);
  assert.equal(fnv(JSON.stringify(run1.e)), BENT_BUILDER, 'the bent frame hashes to the pinned golden');
  assert.equal(fnv(JSON.stringify(run2.e)), BENT_BUILDER, 'and an independent run reproduces it exactly');
  const items = run1.e[0].items.filter((i) => i._creature);
  const meshed = items.filter((i) => i.mesh);
  assert.equal(meshed.length, 4, 'two wings and their two halos carry meshes at peak beat');
  assert.ok(
    meshed.every((i) => i.assetId === MOTH_PARTS.wing),
    'only wing items mesh',
  );
  for (const m of meshed) {
    assert.equal(m.mesh.pos.length, WARP_STATIONS * WARP_ROWS * 2);
    assert.equal(m.mesh.idx.length, (WARP_STATIONS - 1) * (WARP_ROWS - 1) * 6);
  }
  // the bend is real: mesh vertices leave the unbent quad's corners by whole pixels, tips most
  const flat = builderRun(true, null).e[0].items.filter((i) => i._creature);
  const rest = new Map(flat.map((i) => [i.key, i]));
  let maxMove = 0;
  for (const m of meshed) {
    const r = rest.get(m.key);
    for (let v = 0; v < m.mesh.pos.length; v += 2) {
      maxMove = Math.max(maxMove, Math.abs(m.mesh.pos[v] - r.x) + Math.abs(m.mesh.pos[v + 1] - r.y));
    }
  }
  assert.ok(maxMove > 5, `the warp actually moves the surface (${maxMove.toFixed(1)}px of travel)`);
  // S3 seam: the loose scale marks this block used to chase are gone. The plumage is laid out on the
  // bind pose's bones and is NOT displaced by the warp field — it rides its wing rigidly, pinned here:
  // every fan part's position in its own wing's frame is identical at rest and at peak beat. (If the
  // fan should one day bend with the wing, this is the assertion that changes.)
  const fanItems = items.filter((i) => /fan(plate|feather|leaf|chevron)/.test(i.key));
  assert.ok(fanItems.length > 0, 'the bent frame carries fan plumage');
  const restByKey = new Map(flat.map((i) => [i.key, i]));
  const localIn = (fan, wing) => {
    const a = (-wing.rotation * Math.PI) / 180;
    const dx = fan.x - wing.x,
      dy = fan.y - wing.y;
    return [(dx * Math.cos(a) - dy * Math.sin(a)) / wing.scale, (dx * Math.sin(a) + dy * Math.cos(a)) / wing.scaleY];
  };
  for (const fan of fanItems) {
    const seg = ['wingL', 'wingR', 'hindL', 'hindR'].find((s) => fan.key.includes(s));
    const wing = items.find((i) => i.assetId === MOTH_PARTS.wing && i.key.includes(seg) && !i.key.includes('halo'));
    const restFan = restByKey.get(fan.key);
    const restWing = restByKey.get(wing.key);
    const [bx, by] = localIn(fan, wing);
    const [rx, ry] = localIn(restFan, restWing);
    assert.ok(
      Math.abs(bx - rx) < 1e-6 && Math.abs(by - ry) < 1e-6,
      `fan part ${fan.key} rides its wing rigidly (no warp displacement)`,
    );
  }
  // mirror honesty: the left mesh is the right mesh reflected about the body's x, vertex for vertex
  const body = items.find((i) => i.assetId === MOTH_PARTS.body);
  const L = meshed.find((i) => i.key.includes('wingL') && !i.key.includes('halo'));
  const R = meshed.find((i) => i.key.includes('wingR') && !i.key.includes('halo'));
  const q = (arr) => arr.map((v) => Math.round(v * 1e4) / 1e4).sort((a, b) => a - b);
  const mirrored = [];
  for (let v = 0; v < L.mesh.pos.length; v += 2) mirrored.push(2 * body.x - L.mesh.pos[v], L.mesh.pos[v + 1]);
  assert.deepEqual(q(mirrored), q(R.mesh.pos), 'the bent wings stay mirror images');
}

// 4. gate honesty — the debug publication alone never skins, at any beat
{
  const pub = builderRun(false, PEAK_MS, { wantSkeletons: true });
  const plain = builderRun(false, PEAK_MS);
  assert.equal(fnv(JSON.stringify(pub.e)), fnv(JSON.stringify(plain.e)), 'wantSkeletons changes no item');
  assert.ok(
    pub.e[0].items.every((i) => !('mesh' in i)),
    'publication alone emits no mesh',
  );
  assert.ok(pub.b.lastSkeletons()[0], 'but the skeleton is published (the overlay has something to draw)');
}

// 5. the contract takes the mesh fail-closed, and the resolver pins hold end to end
{
  const { e } = builderRun(true, PEAK_MS);
  const raw = e[0].items.find((i) => i.mesh).mesh;
  const clean = sanitizeMesh(raw);
  assert.ok(clean, 'a builder mesh passes the contract');
  assert.deepEqual(clean.idx, raw.idx, 'indices ride through');
  assert.equal(clean.pos.length, raw.pos.length);
  assert.equal(sanitizeMesh(null), null);
  assert.equal(
    sanitizeMesh({ pos: [0, 0, 1, 1], uv: [0, 0, 1, 1], idx: [0, 1, 9] }),
    null,
    'an index past the grid is dropped',
  );
  assert.equal(
    sanitizeMesh({ pos: [0, 0, 1, Number.NaN], uv: [0, 0, 1, 1], idx: [0, 1, 2] }),
    null,
    'a non-finite vertex is dropped',
  );
  assert.equal(
    sanitizeMesh({ pos: new Array(300).fill(0), uv: new Array(300).fill(0), idx: [0, 1, 2] }),
    null,
    'an oversized mesh is dropped',
  );

  const base = {
    canvasW: 1000,
    canvasH: 700,
    layers: [{ id: 'a', name: 'a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
    activeLayerId: 'a',
    layerSnapshots: {},
    seed: 1234,
    seedOffsets: null,
    paletteId: 'bone',
    paletteOverrides: null,
    userPalettes: [],
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 60, particleCount: 60 },
    caGrid: null,
    enabledAssets: null,
    assetWeightOverrides: {},
    customAssets: [],
    quality: 'balanced',
    lockedParams: {},
    batchPaused: false,
    focusSwap: false,
    loopTimeMs: 0,
    dtSec: 1 / 60,
    perfClampOverride: null,
    perfTier1: false,
    assetThin: false,
    slowRender: false,
    scaleMul: 1,
    alphaBoost: 0,
    effectiveScale: [0.5, 1.5],
    effectiveAlpha: [20, 100],
    phraseWrapGen: 0,
    attractor: null,
    dishPins: [{ x: 500, y: 350 }],
    dishFormed: [true],
    assetAttach: {},
  };
  const resolverRun = (t) => {
    const r = createLiveResolver();
    let out;
    for (let i = 0; i < FULL; i++) out = r.resolveLayers({ ...base, loopTimeMs: 0 });
    if (t != null) out = r.resolveLayers({ ...base, loopTimeMs: t });
    r.dispose();
    return out;
  };
  const restOut = resolverRun(null);
  assert.equal(fnv(JSON.stringify(restOut)), REST_RESOLVER, 'the resolver at rest is the pinned output, byte for byte');
  const bentOut = resolverRun(PEAK_MS);
  assert.equal(fnv(JSON.stringify(bentOut)), BENT_RESOLVER, 'the resolver bent frame hashes to its golden');
  assert.equal(
    bentOut.flatMap((x) => x.items || []).filter((i) => i.mesh).length,
    4,
    'the meshes survive the resolver',
  );
}

// 6. the determinism guard, in mathRandomGuard's pattern: no banned clocks or unseeded chance in the warp
{
  const here = dirname(fileURLToPath(import.meta.url));
  for (const file of ['wingWarp.mjs']) {
    const src = readFileSync(join(here, file), 'utf8');
    const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
    const code = noBlock
      .split('\n')
      .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
      .join('\n');
    for (const banned of ['Math.random', 'Date.now', 'performance.now']) {
      assert.ok(!code.includes(banned), `${file} must not use ${banned} — seeded kernel channels only`);
    }
  }
}

console.log('wingWarp.selfcheck: OK (weights, identity parity at rest, bent golden, gate honesty, contract, guard)');
