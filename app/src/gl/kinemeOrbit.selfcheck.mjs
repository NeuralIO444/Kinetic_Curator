// kinemeOrbit.selfcheck.mjs — #2116 (Motion Core P4, step 2b): the orbit kineme — a piece circles on a small ring that
// passes through its home.
//
// Node: the library entry (a region AND a whole mark may take it); the CPU reference (a pinned table, the circle's radius
// and far point, the lean, the reversed sense) and the anchor law for EVERY seed-hash phase; the shader carries the same
// formula; the pack (an orbit piece carries the MARK's box side in a_brk.x — a selected region, and a region that inherits
// a whole-mark orbit; every other instance packs the zeros it always did; frozen / collapsed / reduced motion / an untagged
// mark carry none); the motion source registers and obeys the anchor law.
// Browser (when Playwright's browser is installed): the orbit rest frame is byte-identical to the frozen render (regions) and
// to the still render (a whole mark), and the pieces really leave home.
import assert from 'node:assert';
import { ASSETS } from '../data/assets/index.js';
import { KINEMES, KINEME_KINDS, KINEME_STACKS, getKineme, kinemePhase, sanitizeAssetKineme } from '../data/kinemes.js';
import { sanitizeRegionKinemes } from '../data/regionKinemes.js';
import { bakeAtlas } from './atlas.mjs';
import { packInstanceData, INSTANCE_STRIDE } from './renderer.mjs';
import { buildSceneContract } from './sceneContract.js';
import { QUAD_VS } from './shaders.mjs';
import { orbitPose, kinemePose } from '../engine/motionCore/kinemeSources.js';
import { getMotionSource } from '../engine/motionCore/index.js';

const INK = '#ffffff';
const ACC = '#ff4444';
const FLORA = 'flora_flower_01';
const flora = ASSETS.find((a) => a.id === FLORA);
const PETALS = flora.regions.filter((r) => r.color === '000000').map((r) => r.id);
const orbit = getKineme('orbit');
const OR_KIND = KINEME_KINDS.orbit;
const TAU = 6.28318530718;

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// ── the library ───────────────────────────────────────────────────────
ok('orbit is kind 7, at the spec numbers; a whole mark and a region both take it; no stack uses it', () => {
  assert.strictEqual(OR_KIND, 7);
  assert.deepStrictEqual(orbit, { id: 'orbit', kind: 'orbit', period: 4.0, amp: 0.06 });
  assert.ok(Object.isFrozen(orbit) && !orbit.regionOnly);
  assert.deepStrictEqual(sanitizeAssetKineme({ a: 'orbit' }), { a: 'orbit' }, 'a whole mark takes it');
  assert.deepStrictEqual(sanitizeRegionKinemes({ [PETALS[0]]: 'orbit' }, flora.regions), { [PETALS[0]]: 'orbit' });
  assert.deepStrictEqual(
    KINEMES.map((k) => k.id).slice(-2),
    ['scatter', 'orbit'],
    'appended last: earlier slots unmoved',
  );
  // the shader's second-member (stack) switch has no orbit branch, so a stack must not name it
  for (const st of KINEME_STACKS) assert.ok(!st.stack.includes('orbit'), `${st.id}: orbit is not stackable in v1`);
});

// ── the CPU reference ─────────────────────────────────────────────────
ok('anchor law: rest at t = 0 for every seed-hash phase (1000 of them), whatever the box, either sense', () => {
  for (const k of [orbit, { ...orbit, amp: -0.06 }]) {
    for (let i = 0; i < 1000; i++) {
      const p = orbitPose(k, 0, i / 1000, [250, 0]);
      assert.ok(p.dx === 0 && p.dy === 0, `phase ${i / 1000}: dx ${p.dx} dy ${p.dy}`);
      assert.ok(!Object.is(p.dx, -0) && !Object.is(p.dy, -0), 'rest is +0');
    }
  }
  for (let i = 0; i < 400; i++) assert.ok(Number.isInteger(kinemePhase(i, `k${i}`) * 1000));
});

ok('the curve: a circle of radius box x amp through home; far point at half a period; the phase leans it', () => {
  const B = 250;
  const R = B * orbit.amp; // 15 scene units
  const per = orbit.period;
  // phase 0: centre at (-R, 0); the far point (half a period) is (-2R, 0)
  const far = orbitPose(orbit, per / 2, 0, [B, 0]);
  assert.ok(Math.abs(far.dx + 2 * R) < 1e-6 && Math.abs(far.dy) < 1e-6, `far ${far.dx},${far.dy}`);
  // every sample sits on the ring: |off - centre| = R, where centre = Rot(lean) * (-R, 0)
  for (const ph of [0, 0.25, 0.37, 0.999]) {
    const la = TAU * ph;
    const cx = -R * Math.cos(la);
    const cy = -R * Math.sin(la);
    for (let s = 0; s < 32; s++) {
      const p = orbitPose(orbit, (per * s) / 32, ph, [B, 0]);
      assert.ok(Math.abs(Math.hypot(p.dx - cx, p.dy - cy) - R) < 1e-6, `phase ${ph} step ${s}`);
      assert.ok(Math.hypot(p.dx, p.dy) <= 2 * R + 1e-6, 'never further than the ring is wide');
    }
  }
  // a pinned table: (t, phase) -> (dx, dy) for a 250-unit box
  const table = [
    [1.0, 0, -15, 15], // a quarter turn: (cos - 1, sin) * R
    [2.0, 0, -30, 0],
    [3.0, 0, -15, -15],
    [1.0, 0.25, -15, -15], // leaned a quarter turn: (x, y) -> (-y, x)
    [2.0, 0.5, 30, 0],
  ];
  for (const [t, ph, wx, wy] of table) {
    const p = orbitPose(orbit, t, ph, [B, 0]);
    assert.ok(Math.abs(p.dx - wx) < 1e-5 && Math.abs(p.dy - wy) < 1e-5, `t ${t} phase ${ph}: ${p.dx},${p.dy}`);
  }
  // periodic; all pieces share the cycle (the phase leans the ring, it does not delay it)
  const a = orbitPose(orbit, 0.7, 0.3, [B, 0]);
  const b = orbitPose(orbit, 0.7 + per, 0.3, [B, 0]);
  assert.ok(Math.abs(a.dx - b.dx) < 1e-9 && Math.abs(a.dy - b.dy) < 1e-9);
  assert.ok(
    Math.abs(Math.hypot(a.dx, a.dy) - Math.hypot(...Object.values(orbitPose(orbit, 0.7, 0.8, [B, 0])))) < 1e-9,
    'same distance from home at any phase',
  );
  // the box scales it; no box, no motion
  assert.ok(Math.abs(orbitPose(orbit, 1, 0, [100, 0]).dy - 6) < 1e-6);
  assert.deepStrictEqual(kinemePose(orbit, 1.3, 0.4), { dx: 0, dy: 0 });
});

ok('a negative amp circles the other way on the SAME ring (the spin convention)', () => {
  const rev = { ...orbit, amp: -0.06 };
  for (const t of [0.4, 1.0, 2.6]) {
    const p = orbitPose(orbit, t, 0, [250, 0]);
    const q = orbitPose(rev, t, 0, [250, 0]);
    assert.ok(Math.abs(p.dx - q.dx) < 1e-9 && Math.abs(p.dy + q.dy) < 1e-9, `t ${t}: mirrored across the lean axis`);
  }
});

ok('the shader carries the same formula (kind 7, the mark box, the half-angle rest form, the lean, the sense)', () => {
  assert.ok(QUAD_VS.includes('else if (kind == 7) {'));
  for (const line of [
    'float ob = a_brk.x > 0.0 ? a_brk.x : 100.0 * max(abs(a_inst0.z), abs(a_inst0.w));',
    'float ot = 6.28318530718 * fract(u_kinemeTime / per);',
    'float oh = sin(0.5 * ot);',
    'vec2 oc = vec2(-2.0 * oh * oh, (km.z < 0.0 ? -1.0 : 1.0) * sin(ot));',
    'float ol = 6.28318530718 * a_inst4.w;',
    'kOff = (ob * abs(km.z)) * vec2(oc.x * lc - oc.y * ls, oc.x * ls + oc.y * lc);',
  ])
    assert.ok(QUAD_VS.includes(line), line);
  // inside the slot gate, after scatter, before the stack's second member: a still instance never enters
  const gate = QUAD_VS.indexOf('if (a_inst4.z > 0.5) {');
  const k6 = QUAD_VS.indexOf('else if (kind == 6) {');
  const k7 = QUAD_VS.indexOf('else if (kind == 7) {');
  const kb = QUAD_VS.indexOf('vec3 kb = u_kinemeB[');
  assert.ok(gate > 0 && gate < k6 && k6 < k7 && k7 < kb);
  // the single paths before it are untouched
  for (const line of ['else if (kind == 5) kOff = vec2(0.0, km.z * wav);', 'kOff = a_brk * (km.z * es);'])
    assert.ok(QUAD_VS.includes(line), line);
});

ok(
  'the motion source: registered, family kineme, kineme clock, rest at t = 0 for a phased node, reads node.brk',
  () => {
    const src = getMotionSource('kineme:orbit');
    assert.ok(src && src.family === 'kineme' && src.timeBase === 'kineme');
    const node = { key: 'p', seedOffset: 0, phase01: 0.37, brk: [250, 0] };
    const at0 = src.evaluate(node, 0);
    assert.ok(at0.dx === 0 && at0.dy === 0);
    assert.deepStrictEqual(src.evaluate(node, 1.1), orbitPose(orbit, 1.1, 0.37, [250, 0]));
  },
);

// ── the contract and the pack ─────────────────────────────────────────
const item = (assetId, key) => ({
  assetId,
  x: 500,
  y: 350,
  scale: 2.5,
  rotation: 0,
  color: '#ffffff',
  accent: '#ff4444',
  alpha: 100,
  key,
  seedOffset: 0,
});
const contract = (doc, items) =>
  buildSceneContract({ doc: { seed: 1, ...doc }, resolvedLayers: [{ id: 'L', isFx: false, items }] });
const NONE = Object.fromEntries(flora.regions.map((r) => [r.id, null]));
const only = { regionKinemes: { [FLORA]: { ...NONE, ...Object.fromEntries(PETALS.map((p) => [p, 'orbit'])) } } };
const frameOf = (c) => ({ motionTime: 0, shed: false, regions: c.regionAnim || null, kinemes: c.kinemes || null });
const tails = (packed) => {
  const out = [];
  for (let i = 0; i < packed.length / INSTANCE_STRIDE; i++)
    out.push([...packed.subarray(i * INSTANCE_STRIDE + 49, (i + 1) * INSTANCE_STRIDE)]);
  return out;
};

ok('contract: orbit joins the shared table as kind 7; instances are unmoved', () => {
  const c = contract({ ...only, kinemeTime: 0 }, [item(FLORA, 'a')]);
  const slot = c.kinemes.findIndex((k) => k.kind === OR_KIND) + 1;
  assert.ok(slot > 0);
  assert.deepStrictEqual(c.kinemes[slot - 1], { kind: 7, period: 4.0, amp: 0.06 });
  for (const p of PETALS) assert.strictEqual(c.regionAnim.assets[FLORA][p], slot);
  const bare = contract({ regionKinemes: { [FLORA]: NONE } }, [item(FLORA, 'a')]);
  assert.deepStrictEqual(c.instances, bare.instances, 'placements unchanged');
  assert.ok(c.kinemes.length <= 16);
});

const atlas = bakeAtlas([{ asset: FLORA, ink: INK, accent: ACC }]);
const cellsObj = Object.fromEntries(atlas.cells);

ok('pack: a selected orbit region carries (mark box, 0) — rotation-free, the larger scale; nothing else does', () => {
  const c = contract({ ...only, kinemeTime: 0 }, [item(FLORA, 'a')]);
  const inst = { ...c.instances[0], rotation: 30 };
  const t = tails(packInstanceData([inst], cellsObj, 1, frameOf(c)));
  assert.deepStrictEqual(t[0], [0, 0], 'the remainder carries none (it has the mark scale already)');
  flora.regions.forEach((r, i) => {
    assert.deepStrictEqual(t[i + 1], PETALS.includes(r.id) ? [100 * inst.scaleX, 0] : [0, 0], r.id);
  });
  const wide = tails(packInstanceData([{ ...inst, scaleX: 1.5, scaleY: -3 }], cellsObj, 1, frameOf(c)));
  assert.deepStrictEqual(
    wide[1 + flora.regions.findIndex((r) => r.id === PETALS[0])],
    [300, 0],
    'box = 100 x the larger |scale|',
  );
});

ok('pack: a whole-mark orbit packs no vector on a plain mark, and its regions inherit the mark box', () => {
  // an untagged mark: the shader reads the quad's own scale
  const geo = 'geo_tri_01';
  const cg = contract({ assetKineme: { [geo]: 'orbit' }, kinemeTime: 0 }, [item(geo, 'a')]);
  assert.deepStrictEqual(cg.kinemes, [{ kind: 7, period: 4.0, amp: 0.06 }]);
  assert.ok(cg.instances[0].kineme === 1 && !('regionAnim' in cg));
  const a2 = bakeAtlas([{ asset: geo, ink: INK, accent: ACC }]);
  const pg = packInstanceData([cg.instances[0]], Object.fromEntries(a2.cells), 1, frameOf(cg));
  assert.strictEqual(pg.length, INSTANCE_STRIDE);
  assert.deepStrictEqual(tails(pg), [[0, 0]]);
  // a tagged mark whose regions rock while the MARK orbits: unselected regions inherit the orbit and the mark's box, so
  // every piece draws the same circle (the mark moves as one body)
  const keepOne = { ...NONE, [PETALS[0]]: 'rock' };
  const c = contract({ assetKineme: { [FLORA]: 'orbit' }, regionKinemes: { [FLORA]: keepOne }, kinemeTime: 0 }, [
    item(FLORA, 'a'),
  ]);
  const oslot = c.kinemes.findIndex((k) => k.kind === OR_KIND) + 1;
  const frozen = { ...c.regionAnim, assets: { [FLORA]: { [PETALS[0]]: 0 } } }; // the governor dropped the region
  const t = tails(packInstanceData([c.instances[0]], cellsObj, 1, { ...frameOf(c), regions: frozen }));
  assert.strictEqual(c.instances[0].kineme, oslot);
  assert.deepStrictEqual(t[0], [0, 0]);
  for (let i = 1; i < t.length; i++) assert.deepStrictEqual(t[i], [250, 0], `region ${i} inherits the mark box`);
});

ok('pack: a non-orbit scene packs exactly what it did; frozen / collapsed / reduced motion carry no vector', () => {
  const rock = contract(
    { regionKinemes: { [FLORA]: { ...NONE, ...Object.fromEntries(PETALS.map((p) => [p, 'rock'])) } }, kinemeTime: 0 },
    [item(FLORA, 'a')],
  );
  for (const t of tails(packInstanceData([rock.instances[0]], cellsObj, 1, frameOf(rock))))
    assert.deepStrictEqual(t, [0, 0]);
  for (const gov of [{ perfTier1: true, quality: 'performance' }, { reducedMotion: true }]) {
    const c = contract({ ...only, ...gov, kinemeTime: 0 }, [item(FLORA, 'a')]);
    assert.strictEqual(c.regionAnim.budget, 0, 'budget 0');
    for (const t of tails(packInstanceData([c.instances[0]], cellsObj, 1, frameOf(c))))
      assert.deepStrictEqual(t, [0, 0], JSON.stringify(gov));
  }
  const collapsed = contract({ ...only, perfTier1: true, quality: 'performance', assetThin: true, kinemeTime: 0 }, [
    item(FLORA, 'a'),
  ]);
  const bare = packInstanceData([collapsed.instances[0]], cellsObj);
  assert.deepStrictEqual(
    packInstanceData([collapsed.instances[0]], cellsObj, 1, {
      ...frameOf(collapsed),
      regions: { ...collapsed.regionAnim, shed: true },
    }),
    bare,
    'collapse is the single quad, byte for byte',
  );
  assert.strictEqual(bare.length, INSTANCE_STRIDE);
});

ok('an untagged mark with a region assignment is untouched: no regionAnim, no vector, no extra instance', () => {
  const geo = 'geo_tri_01';
  const c = contract({ regionKinemes: { [geo]: { nope: 'orbit' } }, kinemeTime: 0 }, [item(geo, 'a')]);
  assert.ok(!('regionAnim' in c));
  assert.ok(!c.kinemes || !c.kinemes.some((k) => k.kind === OR_KIND));
  const a2 = bakeAtlas([{ asset: geo, ink: INK, accent: ACC }]);
  const p = packInstanceData([c.instances[0]], Object.fromEntries(a2.cells), 1, frameOf(c));
  assert.strictEqual(p.length, INSTANCE_STRIDE);
  assert.deepStrictEqual(tails(p), [[0, 0]]);
});

// ── GPU: real WebGL2 through the parity driver ────────────────────────
async function runBrowserTests() {
  const { renderViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  try {
    const shot = async (doc, asset = FLORA) =>
      (await renderViaGL(contract(doc, [item(asset, 'solo')]), { width: 400, height: 280, bg: '#000000' })).pixels;
    const diffPx = (a, b) => {
      let k = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) k++;
      }
      return k;
    };
    // regions
    const rest = await shot({ ...only, kinemeTime: 0 });
    const frozen = await shot({ ...only, kinemeTime: 0, perfTier1: true, quality: 'performance' });
    assert.strictEqual(Buffer.compare(rest, frozen), 0, 'orbit at t = 0 is byte-identical to the frozen render');
    const out = await shot({ ...only, kinemeTime: 2.0 }); // half a period: every piece at its far point
    const moved = diffPx(rest, out);
    assert.ok(moved > 200, `pieces left home: ${moved} px changed`);
    const again = await shot({ ...only, kinemeTime: 4.0 * 3 }); // whole periods: home again
    assert.ok(diffPx(rest, again) < moved / 4, 'back home after whole periods');
    // a whole mark
    const geo = 'geo_tri_01';
    const still = await shot({ kinemeTime: 0 }, geo);
    const mark0 = await shot({ assetKineme: { [geo]: 'orbit' }, kinemeTime: 0 }, geo);
    assert.strictEqual(Buffer.compare(still, mark0), 0, 'a whole-mark orbit at t = 0 is byte-identical to the still');
    const mark2 = await shot({ assetKineme: { [geo]: 'orbit' }, kinemeTime: 2.0 }, geo);
    assert.ok(diffPx(still, mark2) > 200, 'the whole mark leaves home');
    console.log(`kinemeOrbit GPU: OK — ${moved} px moved at t = 2.0 s; rest == frozen; whole-mark rest == still`);
  } finally {
    await closeGlDriver();
  }
}
try {
  await runBrowserTests();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) {
    console.log('  [skip] browser orbit tests: Playwright browser not installed in this environment');
  } else {
    throw e;
  }
}
console.log(`kinemeOrbit.selfcheck: ${n} ok`);
