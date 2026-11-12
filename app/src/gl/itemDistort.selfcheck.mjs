// itemDistort.selfcheck.mjs — #2010 (RAY GUN P3 · THE SHARED DISTORTION CHANNEL): per-item shear / melt / tear on
// the instance, in the existing quad shaders, zero passes.
//
// Pins:
//   A  the record: contractDistort clamps, rounds, and returns null for nothing (no key); distortError is the contract's law
//   B  the contract: the key rides only on a distorted item (an undistorted contract is byte-identical); the contract
//      validator accepts a carried record and refuses a bad one
//   C  the packer: 49-float stride, [shear, melt, tear, seed] at 45..48, absent = zeros; every earlier offset unchanged
//   D  the shaders: both branches gated (0 never enters); the shear is applied in the item's own frame before rotation;
//      derivatives in uniform flow, the moved sample keeps the plain LOD (textureGrad), a mask not a branch at the cell
//      edge; every later atlas read follows the moved sample; v_dist flat; the mesh program feeds the FS zeros
//   E  cost + shed: tier 2 — the shed lands on HEAT (half strength), never on/off; the contract carries the heat only
//      while shed
//   F  real WebGL (headless Chromium; skipped only when it is not installed): an all-zero record renders the plain
//      frame byte for byte; each kind moves pixels; a distortion stays inside its own mark's neighbourhood
import assert from 'node:assert';
import { contractDistort, distortError, SHEAR_MAX } from './itemDistort.mjs';
import { packInstanceData, INSTANCE_STRIDE } from './renderer.mjs';
import { QUAD_VS, QUAD_FS, MESH_VS } from './shaders.mjs';
import { getCostTier } from './costTiers.mjs';
import {
  buildSceneContract,
  assertSceneContract,
  serializeSceneContract,
  distortHeatOf,
  DISTORT_SHED_HEAT,
} from './sceneContract.js';
import { CORPUS } from './parity/corpus.mjs';
import { resolveLayers } from '../../../studio/render.mjs';
import { getRenderCaps } from '../data/quality.js';
import { fieldFormForDeal } from '../poets/fieldForm.js';
import { mkRng } from '../engine/prng.js';

let passed = 0;
const ok = (name, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};
console.log('itemDistort.selfcheck');

// ── A · the record ──────────────────────────────────────────────────────
ok('A1 contractDistort: clamps, rounds, nothing → null', () => {
  assert.equal(contractDistort(null), null);
  assert.equal(contractDistort({}), null);
  assert.equal(contractDistort({ shear: 0, melt: 0, tear: 0, seed: 0.5 }), null, 'all zero carries no key');
  assert.equal(contractDistort({ shear: 0.0001 }), null, 'rounds to nothing');
  assert.deepStrictEqual(
    contractDistort({ shear: 0.12345, melt: 0.5, tear: 0.25, seed: 0.3333 }),
    [0.123, 0.5, 0.25, 0.333],
  );
  assert.deepStrictEqual(contractDistort({ shear: 9, melt: 2, tear: -1, seed: 5 }), [SHEAR_MAX, 1, 0, 0.999]);
  assert.deepStrictEqual(contractDistort({ shear: -0.3, melt: NaN }), [-0.3, 0, 0, 0]);
  assert.equal(contractDistort([1, 2, 3]), null, 'an array is not a record');
});

ok('A2 distortError is the contract law', () => {
  assert.equal(distortError([0.2, 0, 0, 0.5]), null);
  for (const bad of [
    null,
    [0, 0, 0],
    [0.2, 0, 0, NaN],
    [1, 0, 0, 0],
    [0, 1.1, 0, 0],
    [0, 0, -0.1, 0],
    [0.1, 0, 0, 1],
    [0, 0, 0, 0.3],
  ])
    assert.ok(distortError(bad), JSON.stringify(bad));
});

// ── B · the contract ────────────────────────────────────────────────────
const form = fieldFormForDeal({ poetId: 'teijo', pieceId: 't4' }, mkRng(1));
function contractFor(fieldForm) {
  const doc = structuredClone(CORPUS[0].doc);
  doc.layoutParams = { ...doc.layoutParams, count: 0, composition: 'raster', fieldForm };
  const caps = getRenderCaps(doc.quality || 'balanced', false);
  return buildSceneContract({ doc, resolvedLayers: resolveLayers(doc, { caps }), caps });
}
const plainC = contractFor(form);
const armedC = contractFor({ ...form, raygun: { mode: 'carson', seed: 9, wear: 1, distort: 1 } });

ok('B1 the key rides only on distorted items; an undistorted contract carries none', () => {
  assert.ok(!plainC.instances.some((i) => 'distort' in i), 'a plain poem carries no distort key');
  const field = armedC.instances.filter((i) => String(i.key).startsWith('field-'));
  const d = field.filter((i) => i.distort);
  assert.ok(d.length > 0 && d.length < field.length, `some glyphs distorted (${d.length}/${field.length})`);
  for (const i of d) assert.equal(distortError(i.distort), null);
  assert.ok(
    !armedC.instances.filter((i) => !String(i.key).startsWith('field-')).some((i) => i.distort),
    'only the producer’s items',
  );
  // the same record without the distort axis: the contract is exactly the pre-P3 contract (no key anywhere)
  const geomOnly = contractFor({ ...form, raygun: { mode: 'carson', seed: 9, wear: 1 } });
  assert.ok(!geomOnly.instances.some((i) => 'distort' in i));
  const strip = (c) => serializeSceneContract({ ...c, instances: c.instances.map(({ distort: _d, ...rest }) => rest) });
  assert.equal(
    strip(armedC),
    serializeSceneContract(geomOnly),
    'the distort axis adds the key and changes nothing else',
  );
});

ok('B2 the contract validator accepts a carried record and refuses a bad one', () => {
  assertSceneContract(armedC);
  const bad = structuredClone(armedC);
  bad.instances.find((i) => i.distort).distort = [0, 0, 0, 0.2];
  assert.throws(() => assertSceneContract(bad), /distort/);
});

// ── C · the packer ──────────────────────────────────────────────────────
ok(
  'C1 51-float stride (49 through #2010 P3, +break-up vec2 in #2116); the record at 45..48; absent packs zeros; earlier offsets unchanged',
  () => {
    assert.equal(INSTANCE_STRIDE, 51);
    const base = {
      asset: 'typ_A',
      x: 10,
      y: 20,
      scaleX: 1,
      scaleY: 1,
      rotation: 5,
      opacity: 1,
      tint: '#ff0000',
      accent: '#00ff00',
      key: 'k',
    };
    const cells = { typ_A: { u0: 0, v0: 0, u1: 0.5, v1: 0.5 } };
    const plain = packInstanceData([base], cells);
    const dist = packInstanceData([{ ...base, distort: [0.3, 0.5, 0.25, 0.75] }], cells);
    assert.equal(plain.length, 51);
    assert.deepStrictEqual([...plain.subarray(49, 51)], [0, 0], 'the #2116 break-up tail is zero for a plain instance');
    assert.deepStrictEqual([...plain.subarray(45, 49)], [0, 0, 0, 0]);
    assert.deepStrictEqual([...dist.subarray(0, 45)], [...plain.subarray(0, 45)], 'every earlier float is unchanged');
    assert.deepStrictEqual(
      [...dist.subarray(45, 49)].map((v) => Math.round(v * 1000) / 1000),
      [0.3, 0.5, 0.25, 0.75],
    );
  },
);

// ── D · the shaders ─────────────────────────────────────────────────────
ok('D1 gated branches, the shear in the item frame, the undistorted LOD, the mesh zero', () => {
  assert.ok(QUAD_VS.includes('layout(location=14) in vec4 a_dist;'));
  assert.ok(
    QUAD_VS.includes('if (a_dist.x != 0.0) c.x -= c.y * a_dist.x * u_distHeat;'),
    'shear gated, on c (pre-rotation)',
  );
  assert.ok(
    QUAD_VS.indexOf('c.x -= c.y * a_dist.x * u_distHeat') < QUAD_VS.indexOf('float th = radians(a_inst1.x + kDeg);'),
    'before rotation',
  );
  assert.ok(QUAD_FS.includes('if (v_dist.y + v_dist.z > 0.0) {'), 'melt/tear gated');
  assert.ok(QUAD_FS.includes('t = texture(u_atlas, v_uv);'), 'the undistorted path is today’s single sample');
  const main = QUAD_FS.slice(QUAD_FS.indexOf('void main() {'));
  assert.ok(
    main.indexOf('vec2 gdx = dFdx(v_uv);') < main.indexOf('if (v_dist.y + v_dist.z > 0.0)'),
    'derivatives before any branch',
  );
  assert.ok(
    QUAD_FS.includes('t = textureGrad(u_atlas, suv, gdx, gdy) * keep;'),
    'the moved sample keeps the plain LOD, masked',
  );
  const after = main.slice(main.indexOf('t = texture(u_atlas, v_uv);') + 30);
  assert.ok(!/\bv_uv\b/.test(after), 'every later atlas read and local frame reads the moved sample (suv)');
  for (const src of [QUAD_VS, MESH_VS]) assert.ok(src.includes('flat out vec4 v_dist;'));
  assert.ok(QUAD_FS.includes('flat in vec4 v_dist;'));
  assert.ok(MESH_VS.includes('v_dist = vec4(0.0);'), 'mesh draws carry a zero record into the shared FS');
});

// ── E · cost ────────────────────────────────────────────────────────────
ok('E1 tier 2; the shed lowers heat, never to zero; the contract carries it only while shed', () => {
  const t = getCostTier('gl/distort-channel');
  assert.ok(t, 'registered');
  assert.equal(t.tier, 2);
  assert.equal(distortHeatOf({}), 1);
  assert.equal(distortHeatOf({ perfTier1: true, quality: 'balanced' }), 1, 'tier 1 alone keeps full heat');
  assert.equal(distortHeatOf({ perfTier1: true, quality: 'performance' }), DISTORT_SHED_HEAT);
  assert.ok(DISTORT_SHED_HEAT > 0 && DISTORT_SHED_HEAT < 1);
  assert.ok(!('distortHeat' in armedC), 'full heat carries no key (the hash holds)');
  assert.ok(
    QUAD_FS.includes('float dmelt = v_dist.y * u_distHeat;') && QUAD_VS.includes('a_dist.x * u_distHeat'),
    'the heat scales; the gate stays on the record',
  );
  const shed = { ...structuredClone(armedC), distortHeat: DISTORT_SHED_HEAT };
  assertSceneContract(shed);
  assert.throws(() => assertSceneContract({ ...shed, distortHeat: 0 }), /distortHeat/);
  assert.throws(() => assertSceneContract({ ...shed, distortHeat: 1 }), /distortHeat/);
});

// ── F · real WebGL ──────────────────────────────────────────────────────
let browser = true;
try {
  const { renderViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  const W = 500;
  const H = 350;
  const render = async (c) => (await renderViaGL(c, { width: W, height: H })).pixels;
  const withField = (d) => {
    const c = structuredClone(plainC);
    for (const it of c.instances)
      if (String(it.key).startsWith('field-')) {
        if (d) it.distort = d;
      }
    return c;
  };
  const plainPx = await render(plainC);
  const zeroC = structuredClone(plainC);
  // an all-zero record can't ride the contract (the validator refuses it) — but a packer handed one must still draw
  // the plain frame: pack it directly through renderViaGL's path by stamping zeros the validator never sees
  for (const it of zeroC.instances) if (String(it.key).startsWith('field-')) it.distort = [0, 0, 0, 0.5];
  const zeroPx = await render(zeroC);
  ok('F1 an all-zero record renders the plain frame byte for byte', () => {
    assert.ok(Buffer.from(zeroPx).equals(Buffer.from(plainPx)));
  });
  const diff = (a, b) => {
    let n = 0;
    for (let i = 0; i < a.length; i += 4)
      if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++;
    return n;
  };
  const kinds = { shear: [0.5, 0, 0, 0.3], melt: [0, 1, 0, 0.3], tear: [0, 0, 0.6, 0.3] };
  const moved = {};
  for (const [k, d] of Object.entries(kinds)) moved[k] = diff(plainPx, await render(withField(d)));
  ok('F2 each kind moves pixels', () => {
    for (const [k, n] of Object.entries(moved)) assert.ok(n > 200, `${k} moved ${n} px`);
  });
  const halfTear = diff(plainPx, await render({ ...withField(kinds.tear), distortHeat: DISTORT_SHED_HEAT }));
  ok('F2b the shed lands on heat: half heat still distorts, and less than full', () => {
    assert.ok(halfTear > 100 && halfTear < moved.tear, `half heat moved ${halfTear} px (full ${moved.tear})`);
  });
  const xs = plainC.instances.filter((i) => String(i.key).startsWith('field-'));
  const pad = Math.max(...xs.map((i) => Math.abs(i.scaleY))) * 100;
  const box = {
    x0: (Math.min(...xs.map((i) => i.x)) - pad) * (W / plainC.canvas.w),
    x1: (Math.max(...xs.map((i) => i.x)) + pad) * (W / plainC.canvas.w),
    y0: (Math.min(...xs.map((i) => i.y)) - pad) * (H / plainC.canvas.h),
    y1: (Math.max(...xs.map((i) => i.y)) + pad) * (H / plainC.canvas.h),
  };
  const outside = [];
  for (const d of Object.values(kinds)) {
    const px = await render(withField(d));
    let n = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1) continue;
        const i = (y * W + x) * 4;
        if (
          Math.abs(px[i] - plainPx[i]) + Math.abs(px[i + 1] - plainPx[i + 1]) + Math.abs(px[i + 2] - plainPx[i + 2]) >
          30
        )
          n++;
      }
    outside.push(n);
  }
  ok('F3 a distortion stays near its mark: far from the poem the distorted frames match the plain frame', () => {
    for (const n of outside) assert.equal(n, 0, `${n} px changed outside the poem's neighbourhood`);
  });
  await closeGlDriver();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) {
    browser = false;
    console.log('  SKIP browser render checks: headless Chromium not installed');
  } else throw e;
}

console.log(`itemDistort.selfcheck: ok (${passed} checks${browser ? '' : ', GL skipped'})`);
