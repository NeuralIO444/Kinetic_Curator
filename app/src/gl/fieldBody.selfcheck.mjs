// fieldBody.selfcheck.mjs — FERROFLUID #2178: the GPU field-body channel, end to end in GL.
//
// The channel's law is pinned in Node by engine/dishFluidChannel.selfcheck.mjs (the seat
// model FIELD_VS is transcribed from). This suite proves the transcription on real GL,
// through the parity harness (gl/parity/glDriver.mjs — the same renderer the app runs):
//
//   - a contract carrying the descriptor + the density ferried out of band renders the
//     pooled body: the magnet's disc changes wholesale, far more than the frame at large;
//   - the render is deterministic: the same contract + density renders byte-identical
//     twice (the seating is a pure function of seed, density and vocabulary);
//   - the channel fails closed, three ways: budget 0, a descriptor with no density
//     payload, and no descriptor at all each render the frame the pre-channel renderer
//     would have produced (byte-identical up to the atlas layout's 1-LSB rounding —
//     the harness bakes a larger atlas when the vocabulary combos join, which can move
//     an edge sample by one level; the body's own diff is three orders larger);
//   - the descriptor's seat on the contract: present only when the doc carries it, in
//     the sanitized shape, and the contract hash story untouched (the descriptor is not
//     part of the hashed resolver output — liveResolve.dishFluid pins that side).
//
// Browser section skipped when no Playwright browser is present (the house pattern).
import assert from 'node:assert/strict';
import { buildSceneContract } from './sceneContract.js';
import { createFluid, stepFluid, fluidDensity, sanitizeMagnets } from '../engine/dishFluid.mjs';
import { fieldBodyScaleBase, fieldBodySeatModel, packFieldDensity } from '../engine/dishFluidChannel.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const okAsync = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};

console.log('fieldBody — the GPU field-body channel in GL (#2178)');

const W = 640;
const H = 440;
const item = (assetId, x, y, scale = 1) => ({
  assetId,
  x,
  y,
  scale,
  rotation: 0,
  color: '#8a8f98',
  accent: '#8a8f98',
  alpha: 100,
  key: assetId,
  seedOffset: 0,
});
const resolvedLayers = [
  {
    id: 'L1',
    type: 'content',
    items: [
      item('geo_circle_01', 120, 90, 1.4),
      item('org_blob_01', 520, 340, 1.2),
      item('line_squiggle_01', 320, 220, 1),
    ],
  },
];
const docBase = { seed: 7, layers: [{ id: 'L1', type: 'content' }] };
// the calibration field (the channel suite's own): two magnets, 600 steps, seedKey 1234567
const magnets = sanitizeMagnets([
  { x: 0.5, y: 0.5 },
  { x: 0.25, y: 0.3 },
]);
const fluid = createFluid({ cols: 96, rows: 54, seedKey: 1234567, magnets });
for (let i = 0; i < 600; i++) stepFluid(fluid, { magnets });
const density = fluidDensity(fluid);
const rawDescriptor = {
  layerId: 'L1',
  poolIds: [
    'org_blob_01',
    'geo_circle_01',
    'mrk_dots_01',
    'mrk_ring_01',
    'geo_star5_01',
    'flora_flower_01',
    'line_squiggle_01',
    'rad_rings_01',
    'dot_field_01',
    'stamp_glyph_01',
    'hae_diatom_01',
    'pxg_cross',
  ],
  ink: '#f0f0e8',
  seedKey: 1234567,
  budget: 8192,
  scaleBase: fieldBodyScaleBase(W, H),
  aspectHW: H / W,
};

ok('the descriptor lands on the contract only when the doc carries it', () => {
  const bare = buildSceneContract({ doc: docBase, resolvedLayers, caps: null, accum: null });
  assert.ok(!('fieldBody' in bare), 'no doc fieldBody → no contract key');
  const withFb = buildSceneContract({
    doc: { ...docBase, fieldBody: rawDescriptor },
    resolvedLayers,
    caps: null,
    accum: null,
  });
  assert.equal(withFb.fieldBody.layerId, 'L1');
  assert.equal(withFb.fieldBody.vocab.length, 12);
  assert.equal(withFb.fieldBody.budget, 8192);
  assert.deepEqual(withFb.instances, bare.instances, 'the descriptor changes no instance — the body is not items');
  assert.equal(
    fieldBodySeatModel(packFieldDensity(density, null), 1234567, 8192, 12).length,
    7690,
    'the seat model predicts 7,690 pieces for this field (the count the draw offers)',
  );
});

let skipped = false;
try {
  const { renderViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  const bare = buildSceneContract({ doc: docBase, resolvedLayers, caps: null, accum: null });
  const withFb = buildSceneContract({
    doc: { ...docBase, fieldBody: rawDescriptor },
    resolvedLayers,
    caps: null,
    accum: null,
  });
  const off = buildSceneContract({
    doc: { ...docBase, fieldBody: { ...rawDescriptor, budget: 0 } },
    resolvedLayers,
    caps: null,
    accum: null,
  });
  const payload = { density, blocked: null, step: 600 };
  const base = await renderViaGL(bare, { width: W, height: H, bg: '#101010' });
  const pooled = await renderViaGL(withFb, { width: W, height: H, bg: '#101010', fieldBody: payload });

  const channelMax = (a, b) => {
    let mx = 0;
    for (let i = 0; i < a.length; i++) mx = Math.max(mx, Math.abs(a[i] - b[i]));
    return mx;
  };
  const diffFrac = (a, b, mask) => {
    let ch = 0;
    let tot = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (mask && !mask(x, y)) continue;
        const i = (y * W + x) * 4;
        if (Math.abs(a[i] - b[i]) > 24 || Math.abs(a[i + 1] - b[i + 1]) > 24 || Math.abs(a[i + 2] - b[i + 2]) > 24)
          ch++;
        tot++;
      }
    }
    return ch / tot;
  };
  const inDisc = (x, y) => (x - 320) ** 2 + (y - 220) ** 2 < 80 ** 2;

  await okAsync('GL: the pooled body renders at the magnet, concentrated and strong', async () => {
    const disc = diffFrac(base.pixels, pooled.pixels, inDisc);
    const outside = diffFrac(base.pixels, pooled.pixels, (x, y) => !inDisc(x, y));
    assert.ok(disc > 0.45, `the magnet disc changed wholesale (${disc.toFixed(3)})`);
    assert.ok(
      disc > 2 * outside,
      `the change concentrates at the magnet (disc ${disc.toFixed(3)} vs outside ${outside.toFixed(3)})`,
    );
  });

  await okAsync('GL: the channel render is deterministic, byte for byte', async () => {
    const again = await renderViaGL(withFb, { width: W, height: H, bg: '#101010', fieldBody: payload });
    assert.ok(Buffer.compare(again.pixels, pooled.pixels) === 0, 'same contract + density → same frame');
  });

  await okAsync('GL: budget 0 and a missing density payload fail closed to the bare frame', async () => {
    const offPx = await renderViaGL(off, { width: W, height: H, bg: '#101010', fieldBody: payload });
    assert.ok(channelMax(offPx.pixels, base.pixels) <= 1, 'budget 0 draws nothing (1-LSB atlas rounding aside)');
    const noData = await renderViaGL(withFb, { width: W, height: H, bg: '#101010' });
    assert.ok(channelMax(noData.pixels, base.pixels) <= 1, 'a descriptor without its density draws nothing');
  });

  await closeGlDriver();
} catch (e) {
  if (/Executable doesn't exist/.test(String(e?.message || e))) {
    skipped = true;
    console.log('  [skip] browser section — no Playwright browser in this environment');
  } else {
    throw e;
  }
}

console.log(`fieldBody.selfcheck: ok (${n} groups${skipped ? ', browser skipped' : ''})`);
