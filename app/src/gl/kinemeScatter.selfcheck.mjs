// kinemeScatter.selfcheck.mjs — #2116 (Motion Core P4, step 2a): the scatter kineme — regions that leave home and return.
//
// Node: the library entry and its region-only rule; the CPU reference (pinned values, the peak, the hold) and the anchor law
// for EVERY seed-hash phase (the delay form keeps a phased piece home at t = 0); the shader carries the same constants;
// the break-up vector (direction, mark box, the hashed fallback); the pack (only a scatter slot gets a vector; every other
// instance packs the zeros it always did; frozen / collapsed / reduced motion / an untagged mark carry none); the motion
// source registers and obeys the anchor law.
// Browser (when Playwright's browser is installed): the scatter rest frame is byte-identical to the frozen render, and the
// pieces really leave home inside their window.
import assert from 'node:assert';
import { ASSETS } from '../data/assets/index.js';
import {
  KINEMES,
  KINEME_KINDS,
  SCATTER_WINDOW,
  SCATTER_RIPPLE,
  getKineme,
  kinemePhase,
  sanitizeAssetKineme,
} from '../data/kinemes.js';
import { sanitizeRegionKinemes, regionKinemePhase } from '../data/regionKinemes.js';
import { bakeAtlas, comboKey } from './atlas.mjs';
import { packInstanceData, breakVector, INSTANCE_STRIDE } from './renderer.mjs';
import { buildSceneContract } from './sceneContract.js';
import { QUAD_VS } from './shaders.mjs';
import { scatterPose, kinemePose } from '../engine/motionCore/kinemeSources.js';
import { getMotionSource } from '../engine/motionCore/index.js';

const INK = '#ffffff';
const ACC = '#ff4444';
const FLORA = 'flora_flower_01';
const flora = ASSETS.find((a) => a.id === FLORA);
const PETALS = flora.regions.filter((r) => r.color === '000000').map((r) => r.id);
const CENTRE = flora.regions.find((r) => r.color === 'ff2d95').id;
const scatter = getKineme('scatter');
const SC_KIND = KINEME_KINDS.scatter;

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// ── the library ───────────────────────────────────────────────────────
ok('scatter is kind 6, region-only; a whole mark cannot take it, a region can', () => {
  assert.strictEqual(SC_KIND, 6);
  assert.deepStrictEqual(scatter, { id: 'scatter', kind: 'scatter', period: 3.2, amp: 0.18, regionOnly: true });
  assert.ok(Object.isFrozen(scatter));
  assert.strictEqual(sanitizeAssetKineme({ a: 'scatter', b: 'bob' })?.a, undefined, 'dropped on a whole mark');
  assert.deepStrictEqual(sanitizeAssetKineme({ a: 'scatter', b: 'bob' }), { b: 'bob' });
  assert.strictEqual(sanitizeAssetKineme({ a: 'scatter' }), null);
  assert.deepStrictEqual(
    sanitizeRegionKinemes({ [PETALS[0]]: 'scatter' }, flora.regions),
    { [PETALS[0]]: 'scatter' },
    'a region takes it',
  );
  assert.strictEqual(KINEMES.filter((k) => k.regionOnly).length, 1, 'only scatter is region-only');
  assert.ok(SCATTER_WINDOW + SCATTER_RIPPLE <= 1, 'the window and the ripple fit in one cycle');
});

// ── the CPU reference ─────────────────────────────────────────────────
ok('anchor law: rest at t = 0 for every seed-hash phase (1000 of them), whatever the vector', () => {
  const brk = [37.5, -12.25];
  for (let k = 0; k < 1000; k++) {
    const p = scatterPose(scatter, 0, k / 1000, brk);
    assert.ok(p.dx === 0 && p.dy === 0, `phase ${k / 1000}: dx ${p.dx} dy ${p.dy}`);
  }
  // and the shader's own inputs: every phase kinemePhase can produce is one of those 1000
  for (let i = 0; i < 400; i++) assert.ok(Number.isInteger(kinemePhase(i, `k${i}`) * 1000));
});

ok('the curve: out and back over the window, a hold for the rest, the peak amp x vector', () => {
  const brk = [100, 0];
  const per = scatter.period;
  // phase 0: u = t / per; peak at u = WINDOW / 2
  const peak = scatterPose(scatter, per * (SCATTER_WINDOW / 2), 0, brk);
  assert.ok(Math.abs(peak.dx - 100 * scatter.amp) < 1e-9 && peak.dy === 0, `peak ${peak.dx}`);
  assert.ok(scatterPose(scatter, per * SCATTER_WINDOW, 0, brk).dx < 1e-9, 'back home at the end of the window');
  for (const u of [0.61, 0.8, 0.95, 0.999]) {
    assert.strictEqual(scatterPose(scatter, per * u, 0, brk).dx, 0, `hold at u = ${u}`);
  }
  // a pinned table: (t, phase) -> dx for brk [100, 0] (e = 0.5 (1 - cos(2 pi u / 0.6)), u = fract(t / 3.2 - phase * 0.4))
  const table = [
    [0.5, 0, 100 * 0.18 * (0.5 * (1 - Math.cos((2 * Math.PI * (0.5 / 3.2)) / 0.6)))],
    [1.0, 0.5, 100 * 0.18 * (0.5 * (1 - Math.cos((2 * Math.PI * (1.0 / 3.2 - 0.2)) / 0.6)))],
    [2.9, 0.25, 0],
  ];
  for (const [t, ph, want] of table) {
    assert.ok(Math.abs(scatterPose(scatter, t, ph, brk).dx - want) < 1e-9, `t ${t} phase ${ph}`);
  }
  // periodic, and a ripple: a later phase leaves later
  assert.ok(Math.abs(scatterPose(scatter, 0.7, 0.3, brk).dx - scatterPose(scatter, 0.7 + per, 0.3, brk).dx) < 1e-9);
  assert.ok(scatterPose(scatter, 0.2, 0, brk).dx > 0 && scatterPose(scatter, 0.2, 0.9, brk).dx === 0, 'ripple');
  // the vector scales it, both axes
  const v = scatterPose(scatter, 0.6, 0, [30, -40]);
  assert.ok(Math.abs(v.dx / 30 - v.dy / -40) < 1e-12, 'moves along the vector');
  assert.deepStrictEqual(kinemePose(scatter, 0.6, 0), { dx: 0, dy: 0 }, 'no vector, no motion');
});

ok('the shader carries the same constants (kind 6, window, ripple, a_brk at location 15)', () => {
  assert.ok(/layout\(location=15\) in vec2 a_brk;/.test(QUAD_VS));
  assert.ok(QUAD_VS.includes('else if (kind == 6) {'));
  assert.ok(QUAD_VS.includes(`a_inst4.w * ${SCATTER_RIPPLE});`), 'ripple literal');
  assert.ok(QUAD_VS.includes(`us < ${SCATTER_WINDOW} ?`), 'window literal');
  assert.ok(QUAD_VS.includes(`cos(6.28318530718 * us / ${SCATTER_WINDOW})`), 'window in the cosine');
  assert.ok(QUAD_VS.includes('kOff = a_brk * (km.z * es);'));
});

ok('the motion source: registered, family kineme, kineme clock, rest at t = 0, moves along node.brk', () => {
  const src = getMotionSource('kineme:scatter');
  assert.ok(src && src.family === 'kineme' && src.timeBase === 'kineme');
  const node = { key: 'p', seedOffset: 0, phase01: 0.37, brk: [10, 20] };
  const at0 = src.evaluate(node, 0);
  assert.ok(at0.dx === 0 && at0.dy === 0, 'rest for a phased node too (unlike the in-place kinds)');
  const mid = src.evaluate({ ...node, phase01: 0 }, 0.5);
  assert.ok(mid.dx > 0 && mid.dy > 0);
});

// ── the break-up vector ───────────────────────────────────────────────
ok('breakVector: unit direction x mark box, rotated by the mark; the hashed fallback is never random', () => {
  const it = { scaleX: 2.5, scaleY: 2.5 };
  const box = 250;
  const [x, y] = breakVector(30, 0, 1, 0, it, 0.3); // no rotation, pivot to the right of centre
  assert.ok(Math.abs(x - box) < 1e-9 && Math.abs(y) < 1e-12, `${x},${y}`);
  const th = Math.PI / 2; // a quarter turn, y-down: +x -> +y
  const [rx, ry] = breakVector(30, 0, Math.cos(th), Math.sin(th), it, 0.3);
  assert.ok(Math.abs(rx) < 1e-9 && Math.abs(ry - box) < 1e-9, 'rotated with the mark');
  assert.ok(
    Math.abs(Math.hypot(...breakVector(7, -9, 1, 0, { scaleX: 1, scaleY: 2 }, 0)) - 200) < 1e-9,
    'box = 100 x the larger scale',
  );
  // a pivot on the centre has no direction: the hashed angle, same every time
  const a = breakVector(0.2, -0.3, 1, 0, it, 0.25);
  assert.deepStrictEqual(a, breakVector(0.2, -0.3, 1, 0, it, 0.25));
  assert.ok(Math.abs(a[0] - Math.cos(Math.PI / 2) * box) < 1e-9 && Math.abs(a[1] - box) < 1e-9, 'angle = 2 pi phase');
});

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
const SCAT = { [FLORA]: Object.fromEntries(PETALS.map((p) => [p, 'scatter'])) };
const KEEP = Object.fromEntries(flora.regions.filter((r) => !PETALS.includes(r.id)).map((r) => [r.id, null]));
const only = { regionKinemes: { [FLORA]: { ...SCAT[FLORA], ...KEEP } } }; // petals scatter; the flower's other defaults are cleared

ok('contract: scatter joins the shared table as kind 6; instances are unmoved', () => {
  const c = contract({ ...only, kinemeTime: 0 }, [item(FLORA, 'a')]);
  const slot = c.kinemes.findIndex((k) => k.kind === SC_KIND) + 1;
  assert.ok(slot > 0, 'the table has a scatter slot');
  assert.deepStrictEqual(c.kinemes[slot - 1], { kind: 6, period: 3.2, amp: 0.18 });
  for (const p of PETALS) assert.strictEqual(c.regionAnim.assets[FLORA][p], slot);
  const bare = contract({ regionKinemes: { [FLORA]: Object.fromEntries(flora.regions.map((r) => [r.id, null])) } }, [
    item(FLORA, 'a'),
  ]);
  assert.deepStrictEqual(c.instances, bare.instances, 'placements unchanged');
  assert.ok(c.kinemes.length <= 16);
});

const atlas = bakeAtlas([{ asset: FLORA, ink: INK, accent: ACC }]);
const cellsObj = Object.fromEntries(atlas.cells);
const base = comboKey(FLORA, INK, ACC);

ok('pack: only a scatter slot gets a vector, and it is the mark-centre -> region direction x the box', () => {
  const c = contract({ ...only, kinemeTime: 0 }, [item(FLORA, 'a')]);
  const inst = { ...c.instances[0], rotation: 30 };
  const frame = { motionTime: 0, shed: false, regions: c.regionAnim, kinemes: c.kinemes };
  const packed = packInstanceData([inst], cellsObj, 1, frame);
  const th = (30 * Math.PI) / 180;
  const co = Math.cos(th);
  const si = Math.sin(th);
  assert.deepStrictEqual([...packed.subarray(49, 51)], [0, 0], 'the remainder carries none');
  flora.regions.forEach((r, i) => {
    const o = (i + 1) * INSTANCE_STRIDE;
    const g = atlas.cells.get(`${base}#r:${r.id}`).geo;
    const tail = [...packed.subarray(o + 49, o + 51)];
    if (!PETALS.includes(r.id)) return assert.deepStrictEqual(tail, [0, 0], `${r.id}: not a scatter region`);
    const lx = (g.px - 50) * inst.scaleX;
    const ly = (g.py - 50) * inst.scaleY;
    const [wx, wy] = breakVector(lx, ly, co, si, inst, regionKinemePhase(FLORA, r.id));
    assert.ok(
      Math.abs(tail[0] - Math.fround(wx)) < 1e-3 && Math.abs(tail[1] - Math.fround(wy)) < 1e-3,
      `${r.id}: ${tail} vs ${wx},${wy}`,
    );
    assert.ok(Math.abs(Math.hypot(...tail) - 100 * inst.scaleX) < 1e-2, `${r.id}: length = the mark box`);
  });
});

ok('pack: a non-scatter scene packs exactly what it did; frozen / collapsed / reduced motion carry no vector', () => {
  const rock = contract(
    { regionKinemes: { [FLORA]: Object.fromEntries(PETALS.map((p) => [p, 'rock'])) }, kinemeTime: 0 },
    [item(FLORA, 'a')],
  );
  const rp = packInstanceData([rock.instances[0]], cellsObj, 1, {
    motionTime: 0,
    shed: false,
    regions: rock.regionAnim,
    kinemes: rock.kinemes,
  });
  for (let i = 0; i < rp.length / INSTANCE_STRIDE; i++) {
    assert.deepStrictEqual(
      [...rp.subarray(i * INSTANCE_STRIDE + 49, (i + 1) * INSTANCE_STRIDE)],
      [0, 0],
      `instance ${i}`,
    );
  }
  for (const gov of [{ perfTier1: true, quality: 'performance' }, { reducedMotion: true }]) {
    const c = contract({ ...only, ...gov, kinemeTime: 0 }, [item(FLORA, 'a')]);
    assert.strictEqual(c.regionAnim.budget, 0, 'budget 0');
    const p = packInstanceData([c.instances[0]], cellsObj, 1, {
      motionTime: 0,
      shed: false,
      regions: c.regionAnim,
      kinemes: c.kinemes,
    });
    for (let i = 0; i < p.length / INSTANCE_STRIDE; i++) {
      assert.deepStrictEqual(
        [...p.subarray(i * INSTANCE_STRIDE + 49, (i + 1) * INSTANCE_STRIDE)],
        [0, 0],
        `${JSON.stringify(gov)}: instance ${i}`,
      );
    }
  }
  const collapsed = contract({ ...only, perfTier1: true, quality: 'performance', assetThin: true, kinemeTime: 0 }, [
    item(FLORA, 'a'),
  ]);
  const bare = packInstanceData([collapsed.instances[0]], cellsObj);
  assert.deepStrictEqual(
    packInstanceData([collapsed.instances[0]], cellsObj, 1, {
      motionTime: 0,
      shed: false,
      regions: { ...collapsed.regionAnim, shed: true },
      kinemes: collapsed.kinemes,
    }),
    bare,
    'collapse is the single quad, byte for byte',
  );
  assert.strictEqual(bare.length, INSTANCE_STRIDE);
});

ok('an untagged mark is untouched: no regionAnim, no vector, no extra instance', () => {
  const geo = 'geo_tri_01';
  const c = contract({ regionKinemes: { [geo]: { nope: 'scatter' } }, kinemeTime: 0 }, [item(geo, 'a')]);
  assert.ok(!('regionAnim' in c));
  assert.ok(!c.kinemes || !c.kinemes.some((k) => k.kind === SC_KIND));
  const a2 = bakeAtlas([{ asset: geo, ink: INK, accent: ACC }]);
  const p = packInstanceData([c.instances[0]], Object.fromEntries(a2.cells), 1, {
    motionTime: 0,
    shed: false,
    regions: null,
    kinemes: c.kinemes || null,
  });
  assert.strictEqual(p.length, INSTANCE_STRIDE);
  assert.deepStrictEqual([...p.subarray(49, 51)], [0, 0]);
});

// ── GPU: real WebGL2 through the parity driver ────────────────────────
async function runBrowserTests() {
  const { renderViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  try {
    const shot = async (doc) =>
      (await renderViaGL(contract(doc, [item(FLORA, 'solo')]), { width: 400, height: 280, bg: '#000000' })).pixels;
    const diffPx = (a, b) => {
      let k = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) k++;
      }
      return k;
    };
    const rest = await shot({ ...only, kinemeTime: 0 });
    const frozen = await shot({ ...only, kinemeTime: 0, perfTier1: true, quality: 'performance' });
    assert.strictEqual(Buffer.compare(rest, frozen), 0, 'scatter at t = 0 is byte-identical to the frozen render');
    // t = 1.0 s puts a phase-0 petal at u = 0.31 (out) — the exact window varies by petal, but some must have left
    const out = await shot({ ...only, kinemeTime: 1.0 });
    const moved = diffPx(rest, out);
    assert.ok(moved > 200, `pieces left home: ${moved} px changed`);
    const back = await shot({ ...only, kinemeTime: 3.2 * 3 });
    assert.ok(diffPx(rest, back) < moved, 'later in the cycle fewer pieces are out than at the peak');
    console.log(`kinemeScatter GPU: OK — ${moved} px moved at t = 1.0 s; rest == frozen`);
  } finally {
    await closeGlDriver();
  }
}
try {
  await runBrowserTests();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) {
    console.log('  [skip] browser scatter tests: Playwright browser not installed in this environment');
  } else {
    throw e;
  }
}
console.log(`kinemeScatter.selfcheck: ${n} ok`);
