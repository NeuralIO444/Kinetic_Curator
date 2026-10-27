// washBody.selfcheck.mjs — #1549 (Materials M3): the material:'wash' body.
//
// Pins the M3 wash contract end to end:
//  - the switch (isWashMaterial) and the recovered ramp (the retired
//    SVG def, verbatim: a vertical linear gradient, accent @0% →
//    ink @100%, NO opacity stops — JS ramp, GLSL chunk and SVG def
//    all read the one WASH_STOPS table);
//  - placements: a wash material flags every placed item and changes
//    NOTHING else (geometry, alpha, colour identical to flat) — the
//    body is a render-level ramp, not a placement field; plate and
//    glass are untouched;
//  - the scene contract: the wash flag rides only when set, so a
//    non-wash contract is byte-identical in shape to the pre-M3
//    contract (no key, no hash change);
//  - the instance packer: 45-float stride (S4 appended the engraving block; #1585 appended the M4
//    param vec4 after the body code), the tail float carries
//    body code 2 for wash (1 plate / 0 flat bit-identical to M2);
//  - the shader: the body code is decoded in QUAD_VS, washShade
//    inlined from the leaf constants, gated on v_wash;
//  - composed stills: wash items paint their ink through the SVG
//    gradient def, flat items gain no def, and the RASTER moves —
//    the render-level measurement the census place fingerprint
//    cannot make (wash↔flat placements are identical by design).
import assert from 'node:assert';
import { Resvg } from '@resvg/resvg-js';
import {
  isWashMaterial,
  WASH_MATERIAL,
  WASH_STOPS,
  washRampAt,
  WASH_GLSL,
  washGradientDef,
  washParamsFrom,
} from './washBody.mjs';
import { GLASS_BODY_ALPHA } from './glassBody.mjs';
import { place } from '../curator/censusReport.mjs';
import { buildSceneContract } from '../gl/sceneContract.js';
import { packInstanceData } from '../gl/renderer.mjs';
import { QUAD_FS, QUAD_VS } from '../gl/shaders.mjs';
import { composeStillSvg } from '../curator/miner.mjs';
import { resolvePalette } from '../data/palettes.js';
import { resolveLayers } from '../../../studio/render.mjs';
import { getRenderCaps } from '../data/quality.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { ASSETS } from '../data/assets/index.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// ── the switch + the recovered def ───────────────────────────────────
ok('isWashMaterial: only the wash material engages', () => {
  assert.equal(WASH_MATERIAL, 'wash');
  assert.equal(isWashMaterial('wash'), true);
  for (const other of ['flat', 'glass', 'plate', 'stipple', '', undefined, null]) {
    assert.equal(isWashMaterial(other), false, `material ${String(other)} must not engage wash`);
  }
});

ok('the ramp is the retired def, stop for stop', () => {
  // MaterialSheet.jsx @ 0b7d758c: x1=0 y1=0 x2=0 y2=1 — accent at
  // offset 0%, ink at offset 100%, and no stop-opacity anywhere.
  assert.deepEqual(
    WASH_STOPS.map((s) => [s.t, s.color, s.opacity]),
    [
      [0, 'accent', 1],
      [1, 'ink', 1],
    ],
  );
  const top = washRampAt(0.5, 0);
  assert.equal(top.inkMix, 0, 'the top edge paints accent');
  assert.equal(top.alpha, 1, 'the def has no opacity stops — alpha is 1 end to end');
  const bottom = washRampAt(0.5, 1);
  assert.equal(bottom.inkMix, 1, 'the bottom edge paints ink');
  assert.equal(bottom.alpha, 1);
  const mid = washRampAt(0.5, 0.5);
  assert.equal(mid.inkMix, 0.5, 'halfway down the paint is half ink (linear ramp)');
  assert.equal(washRampAt(0, 0.25).inkMix, washRampAt(1, 0.25).inkMix, 'the ramp is one-dimensional: x plays no part');
  assert.equal(washRampAt(0.5, -1).inkMix, 0, 'above the box clamps to the first stop');
  assert.equal(washRampAt(0.5, 2).inkMix, 1, 'below the box clamps to the last stop');
});

ok('the GLSL chunk and the SVG def read the same constants', () => {
  // #1585: strength/spread arrive as the `prm` vector (the packer
  // fills it from the one source of truth); the stops stay the table.
  for (const frag of ['washShade', 'clamp(local.y / prm.y, 0.0, 1.0) * prm.x', 'mix(accent, ink']) {
    assert.ok(WASH_GLSL.includes(frag), `GLSL carries ${frag}`);
  }
  const def = washGradientDef('wgX', '#abcdef', '#123456');
  assert.ok(def.includes('<linearGradient id="wgX" x1="0" y1="0" x2="0" y2="1">'), 'def geometry is the retired def');
  assert.ok(def.includes('<stop offset="0%" stop-color="#abcdef"/>'), 'top stop: accent');
  assert.ok(def.includes('<stop offset="100%" stop-color="#123456"/>'), 'bottom stop: ink');
  assert.ok(!def.includes('stop-opacity'), 'the retired def declares no stop-opacity — none is emitted');
});

ok('#1585: strength + spread reshape the ramp; defaults resolve to the shipped pair', () => {
  assert.equal(
    washRampAt(0.5, 1, { strength: 0.5, spread: 1 }).inkMix,
    0.5,
    'strength halves the travel: the bottom edge is half ink',
  );
  assert.equal(
    washRampAt(0.5, 0.5, { strength: 1, spread: 2 }).inkMix,
    0.25,
    'spread 2: halfway down is a quarter of the ramp',
  );
  assert.equal(
    washRampAt(0.5, 0.25, { strength: 1, spread: 0.5 }).inkMix,
    0.5,
    'spread 0.5: the ramp completes by halfway down',
  );
  assert.equal(
    washRampAt(0.5, 0.75, { strength: 1, spread: 0.5 }).inkMix,
    1,
    'past the compressed ramp the pad is the last stop',
  );
  assert.equal(
    washRampAt(0.5, 0.5, { strength: 0, spread: 1 }).inkMix,
    0,
    'strength 0 holds the top colour everywhere',
  );
  assert.equal(
    washRampAt(0.5, 0.5, { strength: 0.5, spread: 1 }).alpha,
    1,
    "alpha is the table's, untouched by the params",
  );
  assert.deepEqual(washParamsFrom({}), { strength: 1, spread: 1 });
  assert.deepEqual(
    washParamsFrom({ washStrength: NaN, washSpread: 0 }),
    { strength: 1, spread: 1 },
    'garbage resolves to the shipped pair',
  );
  assert.deepEqual(washParamsFrom({ washStrength: 0.4, washSpread: 2.5 }), { strength: 0.4, spread: 2.5 });
  // the def at explicit defaults is byte-identical to the def at no argument
  assert.equal(
    washGradientDef('wgD', '#abcdef', '#123456', { strength: 1, spread: 1 }),
    washGradientDef('wgD', '#abcdef', '#123456'),
  );
  const half = washGradientDef('wgH', '#000000', '#ffffff', { strength: 0.5, spread: 1 });
  assert.ok(
    half.includes('<stop offset="100%" stop-color="#808080"/>'),
    'strength 0.5: the bottom stop is the channel midpoint',
  );
  const tight = washGradientDef('wgT', '#abcdef', '#123456', { strength: 1, spread: 0.5 });
  assert.ok(tight.includes('y2="0.5"'), 'spread 0.5: the gradient vector halves (the ramp completes halfway down)');
  assert.ok(
    tight.includes('<stop offset="100%" stop-color="#123456"/>'),
    'spread leaves the authored stop offsets alone — the vector carries it',
  );
});

// ── placements (the census fixture, plateBody's BASE shape) ─────────
const BASE = { count: 60, kinemeBreath: 0.3, kinemeDrift: 0.5, kinemePaletteBreath: 0.12, mode: 'fibonacci' };
const byIndex = (items) => new Map(items.map((it) => [it.index, it]));
const flat = place({ ...BASE, material: 'flat' });
const wash = place({ ...BASE, material: 'wash' });
const plate = place({ ...BASE, material: 'plate' });
const glass = place({ ...BASE, material: 'glass' });

ok('wash material: every item flagged, every placement field identical to flat', () => {
  assert.ok(wash.length > 0);
  const f = byIndex(flat);
  assert.equal(wash.length, flat.length);
  for (const w of wash) {
    assert.equal(w.wash, true, 'every wash-material item carries the flag');
    const src = f.get(w.index);
    assert.ok(src, 'wash item has a flat counterpart');
    assert.equal(src.wash, false, 'flat items carry wash:false');
    for (const field of ['x', 'y', 'scale', 'scaleY', 'rotation', 'alpha', 'color', 'accent', 'zTier']) {
      assert.equal(w[field], src[field], `field ${field} untouched by the wash flag`);
    }
  }
});

ok('plate + glass parity: their items gain no wash flag; glass keeps the M1 alpha', () => {
  for (const p of plate) assert.equal(p.wash, false, 'plate item carries no wash flag');
  const f = byIndex(flat);
  for (const g of glass) {
    assert.equal(g.wash, false, 'glass item carries no wash flag');
    assert.equal(g.alpha, f.get(g.index).alpha * GLASS_BODY_ALPHA, 'M1 attenuation exact');
  }
});

ok('glass wins: the layout glass toggle (#1129) suppresses the wash flag', () => {
  const forced = place({ ...BASE, material: 'wash' }, { rawParams: { glass: true } });
  assert.ok(forced.length > 0);
  assert.ok(
    forced.every((i) => i.glass === true),
    'layout glass flag set on every item',
  );
  assert.ok(
    forced.every((i) => i.wash === false),
    'glass-flagged items carry no wash flag',
  );
});

ok('repeat builds are identical (the flag never sticks to pooled items)', () => {
  const again = place({ ...BASE, material: 'wash' });
  assert.deepEqual(
    again.map((i) => i.wash),
    wash.map((i) => i.wash),
  );
  const after = place({ ...BASE, material: 'flat' });
  assert.ok(
    after.every((i) => i.wash === false),
    'a later flat build reads no stale wash flags',
  );
});

// ── the scene contract ───────────────────────────────────────────────
const enabledAssets = Object.fromEntries(ASSETS.map((a) => [a.id, true]));
const caps = getRenderCaps('balanced', false);
function docWith(material) {
  return {
    version: 1,
    seed: 1234,
    paletteId: 'praystation',
    paletteOverrides: null,
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, lifeDrift: 0, count: 24, material },
    enabledAssets,
    quality: 'balanced',
    layers: [{ id: 'bg', name: 'BG', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
    activeLayerId: 'bg',
    layerSnapshots: {},
  };
}
const contractFor = (material) => {
  const doc = docWith(material);
  return buildSceneContract({ doc, resolvedLayers: resolveLayers(doc, { caps }), caps });
};

ok('contract: wash instances carry the flag; non-wash contracts gain no key', () => {
  const w = contractFor('wash');
  const wInst = w.instances.filter((i) => i.layer === 'bg');
  assert.ok(wInst.length > 0, 'wash doc produced instances');
  assert.ok(
    wInst.every((i) => i.wash === true),
    'every instance of a wash stratum carries wash:true',
  );
  const f = contractFor('flat');
  const fInst = f.instances.filter((i) => i.layer === 'bg');
  assert.ok(fInst.length > 0, 'flat doc produced instances');
  assert.ok(
    fInst.every((i) => !('wash' in i)),
    'flat contract has no wash key anywhere (hash parity)',
  );
  const p = contractFor('plate');
  const pInst = p.instances.filter((i) => i.layer === 'bg');
  assert.ok(
    pInst.every((i) => i.plate === true && !('wash' in i)),
    'plate contract unchanged: plate key only, no wash key',
  );
});

// ── the instance packer + shader ─────────────────────────────────────
ok('packInstanceData: 45-float stride, wash packs body code 2 at the tail', () => {
  const cells = { 'a1|#000000|#000000': { u0: 0, v0: 0, u1: 0.1, v1: 0.1 } };
  const mk = (extra) => ({
    asset: 'a1',
    tint: '#000000',
    accent: '#000000',
    x: 1,
    y: 2,
    scaleX: 3,
    scaleY: 3,
    rotation: 0,
    opacity: 1,
    vx: 0,
    vy: 0,
    kineme: 0,
    kinemePhase: 0,
    ...extra,
  });
  const buf = packInstanceData([mk({ wash: true }), mk({ plate: true }), mk({}), mk({ glass: true })], cells);
  assert.equal(
    buf.length,
    4 * 45,
    'four instances at the 45-float stride (29 through #1585, +16 engraving floats in S4)',
  );
  assert.equal(buf[24], 2, 'wash instance: tail float is body code 2');
  assert.equal(buf[45 + 24], 1, 'plate instance: tail float still 1 (M2 bit-parity)');
  assert.equal(buf[2 * 45 + 24], 0, 'unflagged instance: tail float is 0');
  assert.equal(buf[3 * 45 + 20], 1, 'glass float unmoved at offset 20');
  assert.equal(buf[3 * 45 + 24], 0, 'glass instance carries no body code');
  // #1585: absent `mat` the packer writes the shipped wash pair; a
  // carried `mat` writes through.
  assert.deepEqual([...buf.slice(25, 29)], [1, 1, 0, 0], 'wash at defaults packs (strength 1, spread 1)');
  const moved = packInstanceData([mk({ wash: true, mat: [0.4, 2.5, 0, 0] })], cells);
  assert.deepEqual([...moved.slice(25, 29)], [0.4, 2.5, 0, 0].map(Math.fround), 'wash with moved knobs packs them');
});

ok('shader: body code decoded, v_wash wired and washShade inlined', () => {
  assert.ok(QUAD_VS.includes('layout(location=8) in float a_plate'), 'vertex attribute declared');
  assert.ok(QUAD_VS.includes('v_plate = a_plate'), 'vertex passes the code through (the M2 literal)');
  assert.ok(QUAD_VS.includes('v_wash = a_plate == 2.0 ? 1.0 : 0.0'), 'vertex decodes body code 2 to the wash flag');
  assert.ok(QUAD_FS.includes('in float v_wash'), 'fragment receives the flag');
  assert.ok(QUAD_FS.includes('vec3 washShade('), 'the leaf ramp is inlined in the fragment shader');
  assert.ok(QUAD_FS.includes('else if (v_wash > 0.5)'), 'the ramp is gated on the flag — flat path untouched');
});

// ── composed stills: the render-level measurement ────────────────────
ok('stills: wash paints ink through the gradient def; the raster moves; flat gains nothing', () => {
  const palette = resolvePalette('hydra', null, []);
  const flatSvg = composeStillSvg(flat, palette);
  const washSvg = composeStillSvg(wash, palette);
  assert.ok(
    !flatSvg.includes('id="wg0"'),
    'flat still has no wash def (library assets may carry their own gradients — the wash def id is the pin)',
  );
  assert.ok(washSvg.includes('<linearGradient id="wg0"'), 'wash still carries the wash gradient def');
  assert.ok(washSvg.includes('url(#wg0)'), 'wash ink paint references the def');
  const raster = (svg) =>
    new Resvg(svg, { font: { loadSystemFonts: false }, fitTo: { mode: 'width', value: 500 } }).render();
  const a = raster(flatSvg);
  const b = raster(washSvg);
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  // Cache the pixel buffers ONCE before diffing: Resvg's .pixels is
  // a getter that materializes a fresh full-image buffer per access,
  // so indexing it inside the loop allocates one buffer per pixel
  // and the process OOMs (the #1564 lesson; censusReport/miner cache
  // the same way).
  const ap = a.pixels;
  const bp = b.pixels;
  let sum = 0;
  for (let i = 0; i < ap.length; i++) sum += Math.abs(ap[i] - bp[i]);
  const meanAbs = sum / ap.length;
  assert.ok(meanAbs > 0.5, `wash still raster differs measurably from flat (mean |Δ| ${meanAbs.toFixed(2)} / channel)`);
});

ok('#1585 stills: wash strength moves the raster; defaults leave no matParams', () => {
  assert.ok(
    wash.every((i) => i.matParams === undefined),
    'default wash items carry no matParams field value',
  );
  const weak = place({ ...BASE, material: 'wash', washStrength: 0.25 });
  assert.ok(
    weak.every((i) => Array.isArray(i.matParams)),
    'moved wash items carry matParams',
  );
  assert.deepEqual(weak[0].matParams, [0.25, 1, 0, 0], 'matParams is (strength, spread, 0, 0)');
  const palette = resolvePalette('hydra', null, []);
  const raster = (svg) =>
    new Resvg(svg, { font: { loadSystemFonts: false }, fitTo: { mode: 'width', value: 500 } }).render();
  const a = raster(composeStillSvg(wash, palette));
  const b = raster(composeStillSvg(weak, palette));
  const ap = a.pixels;
  const bp = b.pixels;
  let sum = 0;
  for (let i = 0; i < ap.length; i++) sum += Math.abs(ap[i] - bp[i]);
  const meanAbs = sum / ap.length;
  assert.ok(meanAbs > 0.5, `wash strength 1 → 0.25 moves the still (mean |Δ| ${meanAbs.toFixed(2)} / channel)`);
});

console.log(`washBody.selfcheck: OK (${n} cases)`);
