// plateBody.selfcheck.mjs — #1548 (Materials M2): the material:'plate' body.
//
// Pins the M2 contract end to end:
//  - the switch (isPlateMaterial) and the recovered ramp (the retired
//    SVG def's stops, verbatim: accent heart @0.9 → ink @0.85 by 55%
//    of the radius → ink @0.2 at the rim; JS ramp, GLSL chunk and SVG
//    def all read the one PLATE_STOPS table);
//  - placements: a plate material flags every placed item and changes
//    NOTHING else (geometry, alpha, colour identical to flat) — the
//    body is a render-level ramp, not a placement field; glass is
//    untouched (flag false, alpha attenuated exactly as M1 left it);
//  - the scene contract: the plate flag rides only when set, so a
//    non-plate contract is byte-identical in shape to the pre-M2
//    contract (no key, no hash change);
//  - the instance packer: 45-float stride (S4 appended the engraving block; #1585 appended the M4
//    param vec4 after the body code), plate float at the tail
//    offset, missing flag reads 0;
//  - the shader: a_plate / v_plate wired, plateShade inlined from the
//    leaf constants;
//  - composed stills: plate items paint their ink through the SVG
//    gradient def, flat items gain no def, and the RASTER moves —
//    the render-level measurement the census place fingerprint
//    cannot make (plate↔flat placements are identical by design).
import assert from 'node:assert';
import { Resvg } from '@resvg/resvg-js';
import {
  isPlateMaterial,
  PLATE_MATERIAL,
  PLATE_CENTER,
  PLATE_RADIUS,
  PLATE_STOPS,
  plateRampAt,
  PLATE_GLSL,
  plateGradientDef,
  plateGeoFrom,
} from './plateBody.mjs';
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
ok('isPlateMaterial: only the plate material engages', () => {
  assert.equal(PLATE_MATERIAL, 'plate');
  assert.equal(isPlateMaterial('plate'), true);
  for (const other of ['flat', 'glass', 'wash', 'stipple', '', undefined, null]) {
    assert.equal(isPlateMaterial(other), false, `material ${String(other)} must not engage plate`);
  }
});

ok('the ramp is the retired def, stop for stop', () => {
  // MaterialSheet.jsx @ 0b7d758c: cx 50%, cy 45%, r 65%.
  assert.deepEqual(PLATE_CENTER, { x: 0.36, y: 0.3 }); // tuned offset (Matt, 2026-10-14); the retired def reads 50%/45%
  assert.equal(PLATE_RADIUS, 1.05); // tuned radius (Matt, 2026-10-14) — the module header def is the 0.65 source
  assert.deepEqual(
    PLATE_STOPS.map((s) => [s.t, s.color, s.opacity]),
    [
      [0, 'accent', 0.9],
      [0.55, 'ink', 0.85],
      [1, 'ink', 0.2],
    ],
  );
  const core = plateRampAt(PLATE_CENTER.x, PLATE_CENTER.y);
  assert.equal(core.inkMix, 0, 'the heart paints accent');
  assert.equal(core.alpha, 0.9);
  const mid = plateRampAt(PLATE_CENTER.x + PLATE_RADIUS * 0.55, PLATE_CENTER.y);
  assert.equal(mid.inkMix, 1, 'by 55% of the radius the paint is ink');
  assert.ok(Math.abs(mid.alpha - 0.85) < 1e-9);
  const rim = plateRampAt(PLATE_CENTER.x + PLATE_RADIUS, PLATE_CENTER.y);
  assert.ok(Math.abs(rim.alpha - 0.2) < 1e-9, 'the rim dissolves to 0.2');
  assert.equal(
    plateRampAt(PLATE_CENTER.x + PLATE_RADIUS * 2, PLATE_CENTER.y).alpha,
    0.2,
    'past the radius the pad is the last stop (exact at the clamp)',
  );
  const beyond = plateRampAt(0, 0);
  // Tuned radius (0.85, Matt 2026-10-14): the glyph-box corner (distance
  // ~0.673 from center) now sits INSIDE the ramp — the gradient finishes
  // past the mark, so the corner reads between the mid and rim stops.
  // (0,0) is the corner NEAREST the offset core (0.36, 0.30): distance
  // ~0.469, t ~0.45 — it reads between the core and mid stops.
  assert.ok(
    beyond.alpha > 0.85 && beyond.alpha < 0.9,
    'the near corner reads inside the ramp, core side of the mid stop',
  );
  // coverage never rises along a ray: the plate only dissolves outward
  let prev = Infinity;
  for (let i = 0; i <= 20; i++) {
    const r = plateRampAt(PLATE_CENTER.x + (i / 20) * PLATE_RADIUS, PLATE_CENTER.y);
    assert.ok(r.alpha <= prev + 1e-12, 'alpha is non-increasing outward');
    prev = r.alpha;
  }
});

ok('the GLSL chunk and the SVG def read the same constants', () => {
  // #1585: the geometry is a live param now — the GLSL takes it as
  // the `geo` vector (the packer fills it from the one source of
  // truth); the stops stay inlined authored data, and the def still
  // carries the geometry at the shipped defaults.
  for (const frag of ['0.900', '0.850', '0.200', 'plateShade', 'geo']) {
    assert.ok(PLATE_GLSL.includes(frag), `GLSL carries ${frag}`);
  }
  const def = plateGradientDef('pgX', '#abcdef', '#123456');
  assert.ok(
    def.includes('cx="36%"') && def.includes('cy="30%"') && def.includes('r="105%"'),
    'def geometry: tuned center + radius (Matt, 2026-10-14)',
  );
  assert.ok(def.includes('<stop offset="0%" stop-color="#abcdef" stop-opacity="0.9"/>'), 'core stop: accent @0.9');
  assert.ok(def.includes('<stop offset="55%" stop-color="#123456" stop-opacity="0.85"/>'), 'mid stop: ink @0.85');
  assert.ok(def.includes('<stop offset="100%" stop-color="#123456" stop-opacity="0.2"/>'), 'rim stop: ink @0.2');
});

ok('#1585: the geometry params move the ramp; defaults resolve to the shipped geometry', () => {
  const moved = { cx: 0.5, cy: 0.5, radius: 0.5 };
  const core = plateRampAt(0.5, 0.5, moved);
  assert.equal(core.inkMix, 0, 'the moved core paints accent at its own centre');
  assert.equal(core.alpha, 0.9);
  const rim = plateRampAt(0.5 + 0.5, 0.5, moved);
  assert.ok(Math.abs(rim.alpha - 0.2) < 1e-9, 'the moved radius reaches the rim stop at its own rim');
  // the resolver: garbage/absent fields fall back to the shipped constants
  assert.deepEqual(plateGeoFrom({}), { cx: 0.36, cy: 0.3, radius: 1.05 });
  assert.deepEqual(plateGeoFrom({ plateCenterX: NaN, plateRadius: 'x' }), { cx: 0.36, cy: 0.3, radius: 1.05 });
  assert.deepEqual(plateGeoFrom({ plateCenterX: 0.5, plateCenterY: 0.25, plateRadius: 0.6 }), {
    cx: 0.5,
    cy: 0.25,
    radius: 0.6,
  });
  // the def at explicit defaults is byte-identical to the def at no argument
  assert.equal(
    plateGradientDef('pgD', '#abcdef', '#123456', { cx: 0.36, cy: 0.3, radius: 1.05 }),
    plateGradientDef('pgD', '#abcdef', '#123456'),
  );
  const defMoved = plateGradientDef('pgM', '#abcdef', '#123456', moved);
  assert.ok(
    defMoved.includes('cx="50%"') && defMoved.includes('cy="50%"') && defMoved.includes('r="50%"'),
    'moved def carries the moved geometry',
  );
});

// ── placements (the census fixture, glassBody's BASE shape) ─────────
const BASE = { count: 60, kinemeBreath: 0.3, kinemeDrift: 0.5, kinemePaletteBreath: 0.12, mode: 'fibonacci' };
const byIndex = (items) => new Map(items.map((it) => [it.index, it]));
const flat = place({ ...BASE, material: 'flat' });
const plate = place({ ...BASE, material: 'plate' });
const glass = place({ ...BASE, material: 'glass' });

ok('plate material: every item flagged, every placement field identical to flat', () => {
  assert.ok(plate.length > 0);
  const f = byIndex(flat);
  assert.equal(plate.length, flat.length);
  for (const p of plate) {
    assert.equal(p.plate, true, 'every plate-material item carries the flag');
    const src = f.get(p.index);
    assert.ok(src, 'plate item has a flat counterpart');
    assert.equal(src.plate, false, 'flat items carry plate:false');
    for (const field of ['x', 'y', 'scale', 'scaleY', 'rotation', 'alpha', 'color', 'accent', 'zTier']) {
      assert.equal(p[field], src[field], `field ${field} untouched by the plate flag`);
    }
  }
});

ok('glass parity: glass items gain no plate flag and keep the M1 alpha', () => {
  const f = byIndex(flat);
  for (const g of glass) {
    assert.equal(g.plate, false, 'glass item carries no plate flag');
    assert.equal(g.alpha, f.get(g.index).alpha * GLASS_BODY_ALPHA, 'M1 attenuation exact');
  }
});

ok('glass wins: the layout glass toggle (#1129) suppresses the plate flag', () => {
  // material stays 'plate' (the default) while the layout glass flag
  // forces the glass body — those instances must render exactly as
  // M1 left them, so they take no plate flag on any surface.
  const forced = place({ ...BASE, material: 'plate' }, { rawParams: { glass: true } });
  assert.ok(forced.length > 0);
  assert.ok(
    forced.every((i) => i.glass === true),
    'layout glass flag set on every item',
  );
  assert.ok(
    forced.every((i) => i.plate === false),
    'glass-flagged items carry no plate flag',
  );
});

ok('repeat builds are identical (the flag never sticks to pooled items)', () => {
  const again = place({ ...BASE, material: 'plate' });
  assert.deepEqual(
    again.map((i) => i.plate),
    plate.map((i) => i.plate),
  );
  const after = place({ ...BASE, material: 'flat' });
  assert.ok(
    after.every((i) => i.plate === false),
    'a later flat build reads no stale plate flags',
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

ok('contract: plate instances carry the flag; non-plate contracts gain no key', () => {
  const p = contractFor('plate');
  const pInst = p.instances.filter((i) => i.layer === 'bg');
  assert.ok(pInst.length > 0, 'plate doc produced instances');
  assert.ok(
    pInst.every((i) => i.plate === true),
    'every instance of a plate stratum carries plate:true',
  );
  const f = contractFor('flat');
  const fInst = f.instances.filter((i) => i.layer === 'bg');
  assert.ok(fInst.length > 0, 'flat doc produced instances');
  assert.ok(
    fInst.every((i) => !('plate' in i)),
    'flat contract has no plate key anywhere (hash parity)',
  );
});

ok('#1585 contract: `mat` rides only when a plate knob moved', () => {
  const p = contractFor('plate');
  const pInst = p.instances.filter((i) => i.layer === 'bg');
  assert.ok(
    pInst.every((i) => !('mat' in i)),
    'plate at defaults: no mat key (hash parity with pre-M4)',
  );
  const doc = docWith('plate');
  doc.layoutParams = { ...doc.layoutParams, plateRadius: 0.6, plateCenterX: 0.5 };
  const moved = buildSceneContract({ doc, resolvedLayers: resolveLayers(doc, { caps }), caps });
  const mInst = moved.instances.filter((i) => i.layer === 'bg');
  assert.ok(mInst.length > 0, 'moved plate doc produced instances');
  assert.ok(
    mInst.every((i) => Array.isArray(i.mat)),
    'moved plate instances carry mat',
  );
  assert.deepEqual(mInst[0].mat, [0.5, 0.3, 0.6, 0], 'mat is (cx, cy, radius, 0) at contract precision');
});

// ── the instance packer + shader ─────────────────────────────────────
ok('packInstanceData: 45-float stride, plate at the tail, absent reads 0', () => {
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
  const buf = packInstanceData([mk({ plate: true }), mk({}), mk({ glass: true })], cells);
  assert.equal(
    buf.length,
    3 * 45,
    'three instances at the 45-float stride (29 through #1585, +16 engraving floats in S4)',
  );
  assert.equal(buf[24], 1, 'plate instance: tail float is 1');
  assert.equal(buf[45 + 24], 0, 'unflagged instance: tail float is 0');
  assert.equal(buf[2 * 45 + 20], 1, 'glass float unmoved at offset 20');
  assert.equal(buf[2 * 45 + 24], 0, 'glass instance carries no plate');
  // #1585: the param vec4 follows the body code. Absent `mat` (an
  // unmoved Look) the packer writes the shipped defaults; a carried
  // `mat` writes through. (The buffer is Float32 — expectations are
  // the fround'd values.)
  assert.deepEqual(
    [...buf.slice(25, 29)],
    [0.36, 0.3, 1.05, 0].map(Math.fround),
    'plate at defaults packs the shipped geometry',
  );
  const moved = packInstanceData([mk({ plate: true, mat: [0.5, 0.25, 0.6, 0] })], cells);
  assert.deepEqual(
    [...moved.slice(25, 29)],
    [0.5, 0.25, 0.6, 0].map(Math.fround),
    'plate with a moved centre/radius packs them',
  );
});

ok('shader: a_plate / v_plate wired and plateShade inlined', () => {
  assert.ok(QUAD_VS.includes('layout(location=8) in float a_plate'), 'vertex attribute declared');
  assert.ok(QUAD_VS.includes('v_plate = a_plate'), 'vertex passes the flag through');
  assert.ok(QUAD_FS.includes('in float v_plate'), 'fragment receives the flag');
  assert.ok(QUAD_FS.includes('vec3 plateShade('), 'the leaf ramp is inlined in the fragment shader');
  assert.ok(QUAD_FS.includes('if (v_plate > 0.5)'), 'the ramp is gated on the flag — flat path untouched');
});

// ── composed stills ──────────────────────────────────────────────────
ok('stills: plate paints ink through the gradient def; flat gains nothing', () => {
  const palette = resolvePalette('hydra', null, []);
  const flatSvg = composeStillSvg(flat, palette);
  const plateSvg = composeStillSvg(plate, palette);
  assert.ok(!flatSvg.includes('<radialGradient'), 'flat still has no gradient def');
  assert.ok(plateSvg.includes('<radialGradient'), 'plate still carries the gradient def');
  assert.ok(plateSvg.includes('url(#pg0)'), 'plate ink paint references the def');
});

ok('stills: the raster moves — plate pixels differ measurably from flat', () => {
  // plate↔flat placements are identical by design, so the census
  // place fingerprint cannot see plate; the raster can. Compose the
  // same seeded scene both ways and the pixels must move.
  //
  // GOTCHA (this case's own history, 2026-10-14): Resvg's `.pixels`
  // is a getter that materializes a FRESH full-image buffer on every
  // access. Indexing it per pixel (`img.pixels[i]` in a loop) makes
  // one native allocation per pixel — the process balloons to ~6 GB
  // and dies by SIGKILL with no assertion ever failing (locally, and
  // on CI, where it took both selfcheck jobs down at this case).
  // Cache the buffers once, then index the copies — the same pattern
  // censusReport and miner already use (`const px = img.pixels`).
  const palette = resolvePalette('hydra', null, []);
  const raster = (svg) =>
    new Resvg(svg, { font: { loadSystemFonts: false }, fitTo: { mode: 'width', value: 500 } }).render();
  const a = raster(composeStillSvg(flat, palette));
  const b = raster(composeStillSvg(plate, palette));
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  const ap = a.pixels;
  const bp = b.pixels;
  let sum = 0;
  for (let i = 0; i < ap.length; i++) sum += Math.abs(ap[i] - bp[i]);
  const meanAbs = sum / ap.length;
  assert.ok(meanAbs > 0.5, `plate raster differs from flat (mean |Δ| ${meanAbs.toFixed(2)} / channel)`);
});

ok('#1585 stills: a moved plate radius moves the raster; defaults leave no matParams', () => {
  assert.ok(
    plate.every((i) => i.matParams === undefined),
    'default plate items carry no matParams field value',
  );
  const tight = place({ ...BASE, material: 'plate', plateRadius: 0.3 });
  assert.ok(
    tight.every((i) => Array.isArray(i.matParams)),
    'moved plate items carry matParams',
  );
  assert.deepEqual(tight[0].matParams, [0.36, 0.3, 0.3, 0], 'matParams is (cx, cy, radius, 0)');
  const palette = resolvePalette('hydra', null, []);
  const raster = (svg) =>
    new Resvg(svg, { font: { loadSystemFonts: false }, fitTo: { mode: 'width', value: 500 } }).render();
  const a = raster(composeStillSvg(plate, palette));
  const b = raster(composeStillSvg(tight, palette));
  const ap = a.pixels;
  const bp = b.pixels;
  let sum = 0;
  for (let i = 0; i < ap.length; i++) sum += Math.abs(ap[i] - bp[i]);
  const meanAbs = sum / ap.length;
  assert.ok(meanAbs > 0.5, `plate radius 1.05 → 0.3 moves the still (mean |Δ| ${meanAbs.toFixed(2)} / channel)`);
});

console.log(`plateBody.selfcheck: OK (${n} cases)`);
