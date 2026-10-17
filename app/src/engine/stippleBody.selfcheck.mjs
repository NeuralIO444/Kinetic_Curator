// stippleBody.selfcheck.mjs — #1549 (Materials M3): the material:'stipple' body.
//
// Pins the M3 stipple contract end to end:
//  - the switch (isStippleMaterial) and the recovered screen (the
//    retired SVG def, verbatim: a 6-unit userSpaceOnUse tile holding
//    an ink dot r0.8 @1.5,1.5 and an accent dot r0.6 @4.5,4.2, the
//    rest transparent — JS screen, GLSL chunk and SVG def all read
//    the one STIPPLE_DOTS table; the radii ship at Matt's ×2.5
//    (STIPPLE_DOT_SCALE, tuned 2026-10-14) while the table itself
//    stays verbatim);
//  - placements: a stipple material flags every placed item and
//    changes NOTHING else — the body is a render-level screen, not
//    a placement field; plate/wash/glass are untouched;
//  - the scene contract: the stipple flag rides only when set;
//  - the instance packer: 45-float stride (S4 appended the engraving block; #1585 appended the M4
//    param vec4 after the body code), the tail float carries
//    body code 3 for stipple (1 plate / 2 wash / 0 flat unchanged);
//  - the shader: the body code is decoded in QUAD_VS, stippleShade
//    gated on v_stipple in the tint branch, and stippleCover screens
//    the baked sample in the export path (u_liveTint = 0) — the
//    reason stipple, alone among the channel bodies, carries no
//    export warning;
//  - composed stills: stipple items paint their ink through the SVG
//    pattern def, flat items gain no def, and the RASTER moves.
import assert from 'node:assert';
import { Resvg } from '@resvg/resvg-js';
import {
  isStippleMaterial, STIPPLE_MATERIAL, STIPPLE_CELL, STIPPLE_BOX, STIPPLE_DOTS,
  STIPPLE_DOT_SCALE, stippleShadeAt, STIPPLE_GLSL, stipplePatternDef, stippleDotScaleFrom,
} from './stippleBody.mjs';
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
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

// ── the switch + the recovered def ───────────────────────────────────
ok('isStippleMaterial: only the stipple material engages', () => {
  assert.equal(STIPPLE_MATERIAL, 'stipple');
  assert.equal(isStippleMaterial('stipple'), true);
  for (const other of ['flat', 'glass', 'plate', 'wash', '', undefined, null]) {
    assert.equal(isStippleMaterial(other), false, `material ${String(other)} must not engage stipple`);
  }
});

ok('the screen is the retired def, dot for dot', () => {
  // MaterialSheet.jsx @ 0b7d758c: <pattern width=6 height=6
  // patternUnits=userSpaceOnUse> with exactly two circles.
  assert.equal(STIPPLE_CELL, 6);
  assert.equal(STIPPLE_BOX, 100);
  assert.deepEqual(
    STIPPLE_DOTS.map((d) => [d.cx, d.cy, d.r, d.color]),
    [[1.5, 1.5, 0.8, 'ink'], [4.5, 4.2, 0.6, 'accent']],
  );
  const inkDot = stippleShadeAt(1.5 / 100, 1.5 / 100);
  assert.equal(inkDot.color, 'ink', 'the large dot paints ink');
  assert.equal(inkDot.aMul, 1);
  const accDot = stippleShadeAt(4.5 / 100, 4.2 / 100);
  assert.equal(accDot.color, 'accent', 'the small dot paints accent');
  assert.equal(accDot.aMul, 1);
  const gap = stippleShadeAt(3 / 100, 3 / 100);
  assert.equal(gap.color, null, 'between the dots the tile is transparent');
  assert.equal(gap.aMul, 0);
  const wrapped = stippleShadeAt((6 + 1.5) / 100, 1.5 / 100);
  assert.equal(wrapped.color, 'ink', 'the tile wraps: one cell over is the ink dot again');
  // coverage: the two dots' area over the tile, measured on a grid
  let covered = 0;
  const N = 600;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      // sample the first tile: box coords (0..0.06)²
      if (stippleShadeAt(((i + 0.5) / N) * 0.06, ((j + 0.5) / N) * 0.06).aMul > 0) covered++;
    }
  }
  const frac = covered / (N * N);
  // Expected coverage at Matt's dot scale: the ink dot (r 2.0 at
  // 1.5,1.5) crosses the tile's left/top edges and the pattern
  // clips it there — verified against the Resvg stills path, the
  // look Matt approved — so subtract the two clipped segments
  // (re-derive if a future scale changes the clip geometry). The
  // accent dot (r 1.5 at 4.5,4.2) stays inside the tile.
  const rInk = 0.8 * STIPPLE_DOT_SCALE;
  const rAcc = 0.6 * STIPPLE_DOT_SCALE;
  const seg = rInk * rInk * Math.acos(1.5 / rInk) - 1.5 * Math.sqrt(rInk * rInk - 1.5 * 1.5);
  const analytic = (Math.PI * rInk * rInk - 2 * seg + Math.PI * rAcc * rAcc) / 36;
  assert.ok(Math.abs(frac - analytic) < 0.01, `dot coverage ${frac.toFixed(4)} ≈ analytic ${analytic.toFixed(4)}`);
});

ok('the GLSL chunk and the SVG def read the same constants', () => {
  for (const frag of ['stippleShade', 'stippleCover', 'mod(local * 100.0, 6.0)', 'vec2(1.5, 1.5)', 'vec2(4.5, 4.2)']) {
    assert.ok(STIPPLE_GLSL.includes(frag), `GLSL carries ${frag}`);
  }
  const def = stipplePatternDef('sgX', '#abcdef', '#123456');
  assert.ok(def.includes('<pattern id="sgX" width="6" height="6" patternUnits="userSpaceOnUse">'), 'def tile is the retired def');
  assert.ok(def.includes('<circle cx="1.5" cy="1.5" r="2" fill="#123456"/>'), 'ink dot: ink channel, def radius at Matt\'s ×2.5 scale');
  assert.ok(def.includes('<circle cx="4.5" cy="4.2" r="1.5" fill="#abcdef"/>'), 'accent dot: accent channel, def radius at Matt\'s ×2.5 scale');
});

// ── placements (the census fixture, plateBody's BASE shape) ─────────
const BASE = { count: 60, kinemeBreath: 0.3, kinemeDrift: 0.5, kinemePaletteBreath: 0.12, mode: 'fibonacci' };
const byIndex = (items) => new Map(items.map((it) => [it.index, it]));
const flat = place({ ...BASE, material: 'flat' });
const stipple = place({ ...BASE, material: 'stipple' });
const plate = place({ ...BASE, material: 'plate' });
const wash = place({ ...BASE, material: 'wash' });
const glass = place({ ...BASE, material: 'glass' });

ok('stipple material: every item flagged, every placement field identical to flat', () => {
  assert.ok(stipple.length > 0);
  const f = byIndex(flat);
  assert.equal(stipple.length, flat.length);
  for (const s of stipple) {
    assert.equal(s.stipple, true, 'every stipple-material item carries the flag');
    const src = f.get(s.index);
    assert.ok(src, 'stipple item has a flat counterpart');
    assert.equal(src.stipple, false, 'flat items carry stipple:false');
    for (const field of ['x', 'y', 'scale', 'scaleY', 'rotation', 'alpha', 'color', 'accent', 'zTier']) {
      assert.equal(s[field], src[field], `field ${field} untouched by the stipple flag`);
    }
  }
});

ok('plate + wash + glass parity: their items gain no stipple flag; glass keeps the M1 alpha', () => {
  for (const p of plate) assert.equal(p.stipple, false, 'plate item carries no stipple flag');
  for (const w of wash) assert.equal(w.stipple, false, 'wash item carries no stipple flag');
  const f = byIndex(flat);
  for (const g of glass) {
    assert.equal(g.stipple, false, 'glass item carries no stipple flag');
    assert.equal(g.alpha, f.get(g.index).alpha * GLASS_BODY_ALPHA, 'M1 attenuation exact');
  }
});

ok('glass wins: the layout glass toggle (#1129) suppresses the stipple flag', () => {
  const forced = place({ ...BASE, material: 'stipple' }, { rawParams: { glass: true } });
  assert.ok(forced.length > 0);
  assert.ok(forced.every((i) => i.glass === true), 'layout glass flag set on every item');
  assert.ok(forced.every((i) => i.stipple === false), 'glass-flagged items carry no stipple flag');
});

ok('repeat builds are identical (the flag never sticks to pooled items)', () => {
  const again = place({ ...BASE, material: 'stipple' });
  assert.deepEqual(again.map((i) => i.stipple), stipple.map((i) => i.stipple));
  const after = place({ ...BASE, material: 'flat' });
  assert.ok(after.every((i) => i.stipple === false), 'a later flat build reads no stale stipple flags');
});

// ── the scene contract ───────────────────────────────────────────────
const enabledAssets = Object.fromEntries(ASSETS.map((a) => [a.id, true]));
const caps = getRenderCaps('balanced', false);
function docWith(material) {
  return {
    version: 1, seed: 1234, paletteId: 'praystation', paletteOverrides: null,
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, lifeDrift: 0, count: 24, material },
    enabledAssets, quality: 'balanced',
    layers: [{ id: 'bg', name: 'BG', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
    activeLayerId: 'bg', layerSnapshots: {},
  };
}
const contractFor = (material) => {
  const doc = docWith(material);
  return buildSceneContract({ doc, resolvedLayers: resolveLayers(doc, { caps }), caps });
};

ok('contract: stipple instances carry the flag; non-stipple contracts gain no key', () => {
  const s = contractFor('stipple');
  const sInst = s.instances.filter((i) => i.layer === 'bg');
  assert.ok(sInst.length > 0, 'stipple doc produced instances');
  assert.ok(sInst.every((i) => i.stipple === true), 'every instance of a stipple stratum carries stipple:true');
  const f = contractFor('flat');
  const fInst = f.instances.filter((i) => i.layer === 'bg');
  assert.ok(fInst.length > 0, 'flat doc produced instances');
  assert.ok(fInst.every((i) => !('stipple' in i)), 'flat contract has no stipple key anywhere (hash parity)');
});

// ── the instance packer + shader ─────────────────────────────────────
ok('packInstanceData: 45-float stride, stipple packs body code 3 at the tail', () => {
  const cells = { 'a1|#000000|#000000': { u0: 0, v0: 0, u1: 0.1, v1: 0.1 } };
  const mk = (extra) => ({
    asset: 'a1', tint: '#000000', accent: '#000000', x: 1, y: 2, scaleX: 3, scaleY: 3,
    rotation: 0, opacity: 1, vx: 0, vy: 0, kineme: 0, kinemePhase: 0, ...extra,
  });
  const buf = packInstanceData([mk({ stipple: true }), mk({ wash: true }), mk({ plate: true }), mk({})], cells);
  assert.equal(buf.length, 4 * 45, 'four instances at the 45-float stride (29 through #1585, +16 engraving floats in S4)');
  assert.equal(buf[24], 3, 'stipple instance: tail float is body code 3');
  assert.equal(buf[45 + 24], 2, 'wash instance: tail float is body code 2');
  assert.equal(buf[2 * 45 + 24], 1, 'plate instance: tail float still 1 (M2 bit-parity)');
  assert.equal(buf[3 * 45 + 24], 0, 'unflagged instance: tail float is 0');
  // #1585: absent `mat` the packer writes Matt's shipped dot scale;
  // a carried `mat` writes through.
  assert.deepEqual([...buf.slice(25, 29)], [2.5, 0, 0, 0], 'stipple at defaults packs the shipped dot scale');
  const moved = packInstanceData([mk({ stipple: true, mat: [4, 0, 0, 0] })], cells);
  assert.deepEqual([...moved.slice(25, 29)], [4, 0, 0, 0], 'stipple with a moved dot scale packs it');
});

ok('#1585: the dot scale moves the screen; defaults resolve to Matt\'s scale', () => {
  // at ×1 the ink dot is r 0.8 — a point 1.2 units from its centre is a gap;
  // at Matt's ×2.5 (r 2.0) the same point is inside the dot.
  const pt = { x: (1.5 + 1.2) / 100, y: 1.5 / 100 };
  assert.equal(stippleShadeAt(pt.x, pt.y, 1).color, null, 'at ×1 the point sits in a gap');
  assert.equal(stippleShadeAt(pt.x, pt.y).color, 'ink', 'at the shipped ×2.5 the point is inside the ink dot');
  assert.equal(stippleDotScaleFrom({}), 2.5);
  assert.equal(stippleDotScaleFrom({ stippleDotScale: NaN }), 2.5, 'garbage resolves to the shipped scale');
  assert.equal(stippleDotScaleFrom({ stippleDotScale: 4 }), 4);
  // the def at explicit defaults is byte-identical to the def at no argument
  assert.equal(stipplePatternDef('sgD', '#abcdef', '#123456', 2.5), stipplePatternDef('sgD', '#abcdef', '#123456'));
  const big = stipplePatternDef('sgB', '#abcdef', '#123456', 5);
  assert.ok(big.includes('<circle cx="1.5" cy="1.5" r="4"'), 'at ×5 the ink dot radius doubles Matt\'s');
});

ok('shader: body code decoded, v_stipple wired, screen in both tint and baked paths', () => {
  assert.ok(QUAD_VS.includes('v_stipple = a_plate == 3.0 ? 1.0 : 0.0'), 'vertex decodes body code 3 to the stipple flag');
  assert.ok(QUAD_FS.includes('in float v_stipple'), 'fragment receives the flag');
  assert.ok(QUAD_FS.includes('vec3 stippleShade('), 'the leaf screen is inlined in the fragment shader');
  assert.ok(QUAD_FS.includes('else if (v_stipple > 0.5)'), 'the screen is gated on the flag in the tint branch — flat path untouched');
  assert.ok(QUAD_FS.includes('float stippleCover('), 'the coverage form is inlined for the baked-sample path');
  assert.ok(QUAD_FS.includes('float cover = stippleCover('), 'the baked path (studio export) screens the sample — stipple survives studio.py still');
});

// ── composed stills: the render-level measurement ────────────────────
ok('stills: stipple paints ink through the pattern def; the raster moves; flat gains nothing', () => {
  const palette = resolvePalette('hydra', null, []);
  const flatSvg = composeStillSvg(flat, palette);
  const stippleSvg = composeStillSvg(stipple, palette);
  assert.ok(!flatSvg.includes('<pattern'), 'flat still has no pattern def');
  assert.ok(stippleSvg.includes('<pattern'), 'stipple still carries the pattern def');
  assert.ok(stippleSvg.includes('url(#sg0)'), 'stipple ink paint references the def');
  const raster = (svg) => new Resvg(svg, { font: { loadSystemFonts: false }, fitTo: { mode: 'width', value: 500 } }).render();
  const a = raster(flatSvg);
  const b = raster(stippleSvg);
  assert.equal(a.width, b.width); assert.equal(a.height, b.height);
  // Cache the pixel buffers ONCE before diffing: Resvg's .pixels is
  // a getter that materializes a fresh full-image buffer per access,
  // so indexing it inside the loop allocates one buffer per pixel
  // and the process OOMs (the #1564 lesson; censusReport/miner cache
  // the same way).
  const ap = a.pixels; const bp = b.pixels;
  let sum = 0;
  for (let i = 0; i < ap.length; i++) sum += Math.abs(ap[i] - bp[i]);
  const meanAbs = sum / ap.length;
  assert.ok(meanAbs > 0.5, `stipple still raster differs measurably from flat (mean |Δ| ${meanAbs.toFixed(2)} / channel)`);
});

ok('#1585 stills: the dot scale moves the raster; defaults leave no matParams', () => {
  assert.ok(stipple.every((i) => i.matParams === undefined), 'default stipple items carry no matParams field value');
  const fine = place({ ...BASE, material: 'stipple', stippleDotScale: 1 });
  assert.ok(fine.every((i) => Array.isArray(i.matParams)), 'moved stipple items carry matParams');
  assert.deepEqual(fine[0].matParams, [1, 0, 0, 0], 'matParams is (dotScale, 0, 0, 0)');
  const palette = resolvePalette('hydra', null, []);
  const raster = (svg) => new Resvg(svg, { font: { loadSystemFonts: false }, fitTo: { mode: 'width', value: 500 } }).render();
  const a = raster(composeStillSvg(stipple, palette));
  const b = raster(composeStillSvg(fine, palette));
  const ap = a.pixels; const bp = b.pixels;
  let sum = 0;
  for (let i = 0; i < ap.length; i++) sum += Math.abs(ap[i] - bp[i]);
  const meanAbs = sum / ap.length;
  assert.ok(meanAbs > 0.5, `stipple dot scale 2.5 → 1 moves the still (mean |Δ| ${meanAbs.toFixed(2)} / channel)`);
});

console.log(`stippleBody.selfcheck: OK (${n} cases)`);
